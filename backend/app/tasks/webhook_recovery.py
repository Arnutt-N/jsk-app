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

from linebot.v3.webhooks import FollowEvent, MessageEvent, PostbackEvent, UnfollowEvent
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.webhook_event import WebhookEvent

logger = logging.getLogger(__name__)

# A receipt younger than this is still owned by its in-process worker; replaying
# it would race the live task. 30s comfortably covers handler latency.
RECOVERY_GRACE_SECONDS = 30

# Poll interval for the recovery loop.
RECOVERY_INTERVAL_SECONDS = 15

# The event classes the dispatcher routes. Anything else has no inbound effect
# and is not stored for replay.
_SUPPORTED_EVENTS = {
    "MessageEvent": MessageEvent,
    "PostbackEvent": PostbackEvent,
    "FollowEvent": FollowEvent,
    "UnfollowEvent": UnfollowEvent,
}

# Ephemeral LINE tokens authorize a single reply/quote/read action and must not
# be persisted; a replay rebuilds the event without them.
_EPHEMERAL_KEYS = ("replyToken", "quoteToken", "markAsReadToken")


def build_payload(event) -> dict | None:
    """Project a parsed LINE event onto its replayable payload.

    The payload is the SDK event's own dict with ephemeral tokens removed, so
    the recovery consumer rebuilds a real SDK object (``from_dict``) and the
    dispatcher's ``isinstance`` routing works unchanged. Sender id, content
    type, and text are kept because the handlers read them to re-run the
    inbound effect. Rows are purged after ``WEBHOOK_EVENT_TTL`` so the stored
    payload is bounded.
    """
    if type(event).__name__ not in _SUPPORTED_EVENTS:
        return None
    payload = event.to_dict()
    for key in _EPHEMERAL_KEYS:
        payload.pop(key, None)
    message = payload.get("message")
    if isinstance(message, dict):
        for key in _EPHEMERAL_KEYS:
            message.pop(key, None)
    return payload


def event_from_payload(event_type: str, payload: dict | None):
    """Rebuild a real SDK event, or None when the receipt is unreplayable."""
    cls = _SUPPORTED_EVENTS.get(event_type)
    if cls is None or not isinstance(payload, dict):
        return None
    data = dict(payload)
    # Required token fields were stripped at write time; give the model a
    # placeholder so it validates. It is not a real token, so any reply attempt
    # during replay fails harmlessly instead of reaching a LIVE user.
    data.setdefault("replyToken", "")
    message = data.get("message")
    if isinstance(message, dict):
        message = dict(message)
        message.setdefault("quoteToken", "")
        data["message"] = message
    try:
        return cls.from_dict(data)
    except Exception as exc:  # malformed/legacy payload
        logger.error("Cannot rebuild %s from stored payload: %s", event_type, exc)
        return None


async def _purge_expired(db: AsyncSession, retention: datetime) -> None:
    """Drop receipts past the replay horizon so stored payloads stay bounded."""
    await db.execute(delete(WebhookEvent).where(WebhookEvent.received_at < retention))


async def _recover_pending() -> int:
    """Replay receipts that were acknowledged but never applied."""
    from app.api.v1.endpoints import webhook as webhook_module

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=RECOVERY_GRACE_SECONDS)
    retention = now - timedelta(seconds=settings.WEBHOOK_EVENT_TTL)
    # A crashed worker's claim expires sooner than the replay horizon, so
    # another worker can reclaim it while it is still worth replaying (F02).
    claim_horizon = now - timedelta(seconds=settings.WEBHOOK_EVENT_CLAIM_SECONDS)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WebhookEvent).where(
                WebhookEvent.inbound_applied_at.is_(None),
                WebhookEvent.inbound_error.is_(None),
                WebhookEvent.received_at < cutoff,
                WebhookEvent.received_at > retention,
                or_(
                    WebhookEvent.inbound_claimed_at.is_(None),
                    WebhookEvent.inbound_claimed_at < claim_horizon,
                ),
            )
        )
        rows = result.scalars().all()

        events = []
        unrecoverable: list[str] = []
        for row in rows:
            event = event_from_payload(row.event_type, row.payload)
            if event is None:
                unrecoverable.append(row.event_id)
            else:
                events.append(event)

        if unrecoverable:
            # A clear terminal state so one bad row neither stalls the batch nor
            # retries forever (F03).
            logger.warning("Marking %s unreplayable webhook receipt(s)", len(unrecoverable))
            await db.execute(
                update(WebhookEvent)
                .where(WebhookEvent.event_id.in_(unrecoverable))
                .values(inbound_error="unrecoverable_payload", inbound_claimed_at=None)
            )
        await _purge_expired(db, retention)
        await db.commit()

    if not events:
        return 0
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