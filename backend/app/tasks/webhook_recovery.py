"""F01: replay an acknowledged webhook event after a restart.

The receipt committed before ``200 OK`` must carry a minimal replayable payload
so a crash in the in-process background task does not lose the event until LINE
happens to redeliver it. This module reconstructs LINE event objects from the
stored payload and replays receipts that were never applied.

Payload policy: the fields the handlers read are stored (message id and text)
so inbound effects can re-run; the LINE user id and reply token are not, so a
replay cannot leak an identifier or send to a stale token. Retention is bounded
by ``WEBHOOK_EVENT_TTL``; an expired receipt is not replayed.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.webhook_event import WebhookEvent

logger = logging.getLogger(__name__)

# A receipt younger than this is still owned by its in-process worker; replaying
# it would race the live task. 30s comfortably covers handler latency.
RECOVERY_GRACE_SECONDS = 30

# Poll interval for the recovery loop.
RECOVERY_INTERVAL_SECONDS = 15

# Replayable payload keys per LINE event type. Anything not listed here is
# dropped at intake. The message id is stored so the inbound effect (persist,
# broadcast) can re-run after a crash; message text, the LINE user id and the
# reply token are not, so a replay cannot leak content or send to a stale token.
_PAYLOAD_FIELDS = {
    "MessageEvent": ("type", "message"),
    "PostbackEvent": ("type", "data", "params"),
    "FollowEvent": ("type",),
    "UnfollowEvent": ("type",),
}


def build_payload(event) -> dict | None:
    """Project a parsed LINE event onto the minimal replayable shape.

    Only the message id (and postback data) is kept: the payload carries what
    the handlers need to re-derive the event without persisting message text,
    the LINE user id, or the reply token.
    """
    event_type = type(event).__name__
    fields = _PAYLOAD_FIELDS.get(event_type)
    if fields is None:
        return None
    payload = {"type": event_type, "webhookEventId": getattr(event, "webhook_event_id", None)}
    for field in fields:
        if field == "type":
            continue
        # `field` names the payload key; read the same-named attribute off the
        # event (message -> event.message, data -> event.data).
        value = getattr(event, field, None)
        if value is None:
            continue
        # Prefer explicit identity fields (message id, postback data) over
        # free text; never persist message text.
        stored = getattr(value, "id", None) or getattr(value, "data", None)
        if stored is None and isinstance(value, dict):
            stored = value.get("id") or value.get("data")
        if stored is not None:
            payload[field] = stored
    return payload


def event_from_payload(payload: dict):
    """Rebuild a LINE event object from a stored payload.

    The replay carries the message id so the inbound effect can dedupe and
    persist; the reply token is absent, so the reply path degrades to a no-op
    instead of sending to a stale token.
    """
    event_type = payload.get("type")
    message = None
    if event_type == "MessageEvent":
        message = SimpleNamespace(id=payload.get("id"), type="text", text=None)
    return SimpleNamespace(
        webhook_event_id=payload.get("webhookEventId"),
        source=SimpleNamespace(user_id=None),
        reply_token=None,
        message=message,
        type=event_type,
    )


async def _recover_pending() -> int:
    """Replay receipts that were acknowledged but never applied."""
    from app.api.v1.endpoints import webhook as webhook_module

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=RECOVERY_GRACE_SECONDS)
    retention = datetime.now(timezone.utc) - timedelta(seconds=settings.WEBHOOK_EVENT_TTL)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WebhookEvent).where(
                WebhookEvent.inbound_applied_at.is_(None),
                WebhookEvent.payload.isnot(None),
                WebhookEvent.received_at < cutoff,
                WebhookEvent.received_at > retention,
            )
        )
        rows = result.scalars().all()

    if not rows:
        return 0
    events = [event_from_payload(row.payload) for row in rows]
    logger.info("Replaying %s pending webhook event(s) after restart", len(events))
    await webhook_module.process_webhook_events(events)
    return len(events)


async def _run_once() -> int:
    return await _recover_pending()


async def run_recovery_loop():
    """Poll for pending receipts until cancelled."""
    logger.info("Webhook recovery task started")
    while True:
        try:
            await _recover_pending()
        except Exception as exc:  # noqa: BLE001 -- never die on a bad batch
            logger.error("Webhook recovery error: %s", exc)
        await asyncio.sleep(RECOVERY_INTERVAL_SECONDS)


_scheduler_task: "asyncio.Task | None" = None


async def start_webhook_recovery():
    """Start the recovery background task."""
    global _scheduler_task
    _scheduler_task = asyncio.create_task(run_recovery_loop())
    logger.info("Webhook recovery background task started")
    return _scheduler_task


async def stop_webhook_recovery():
    """Cancel and await the recovery background task."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        logger.info("Webhook recovery background task stopped")
    _scheduler_task = None