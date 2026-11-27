"""LINE webhook endpoint — signature verification and event dispatch only."""
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import FollowEvent, MessageEvent, PostbackEvent, UnfollowEvent
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.line_client import parser
from app.core.logging_utils import mask_line_id
from app.core.redis_client import redis_client
from app.db.session import AsyncSessionLocal
from app.models.webhook_event import ReplyDeliveryStatus, WebhookEvent
from app.services.delivery_outcome import DeliveryOutcome
from app.services.friend_service import friend_service
from app.services.message_intake.message_handler import handle_message_event as _handle_message_event_impl
from app.services.message_intake.postback_handler import handle_postback_event
from app.services.outbox import (
    Outbox,
    OutboxItem,
    OutboxKind,
    drain_outbox,
    drain_outbox_outcomes,
    new_outbox,
    reply,
)

router = APIRouter()
logger = logging.getLogger(__name__)

WEBHOOK_EVENT_KEY_PREFIX = "webhook:event:"
WEBHOOK_EVENT_LOCK_SUFFIX = ":lock"

_REPLY_STATUS = {
    DeliveryOutcome.SENT: ReplyDeliveryStatus.SENT,
    DeliveryOutcome.NOT_SENT: ReplyDeliveryStatus.FAILED,
    DeliveryOutcome.UNKNOWN: ReplyDeliveryStatus.UNKNOWN,
    DeliveryOutcome.TEMPORARY_FAILURE: ReplyDeliveryStatus.UNKNOWN,
}

# F-005: this endpoint is public and unauthenticated, and the signature check
# needs the whole body, so everything before it is attacker-controlled. LINE
# text messages cap at a few KB; 1 MiB leaves room for a large postback payload
# and still bounds what one anonymous request can make the process hold.
MAX_WEBHOOK_BODY_BYTES = 1024 * 1024  # 1 MiB


async def _read_body_with_limit(request: Request) -> bytes:
    """Read the request body, refusing anything over MAX_WEBHOOK_BODY_BYTES.

    Two gates on purpose:
      1. The declared Content-Length is rejected before a single byte is read,
         so the common case costs nothing.
      2. A streamed read enforces the same cap, because Content-Length may be
         absent (chunked) or a lie.

    Raises HTTPException(413) rather than returning a sentinel so no caller can
    forget to check it.
    """
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            declared_len = int(declared)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length")
        if declared_len > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Request body too large")

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Request body too large")
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/webhook")
async def line_webhook(request: Request, background_tasks: BackgroundTasks, x_line_signature: str = Header(None)):
    if x_line_signature is None:
        raise HTTPException(status_code=400, detail="Missing X-Line-Signature header")

    body = await _read_body_with_limit(request)

    # F-011: decode AFTER the size gate and map malformed bytes to a 400.
    # Previously `body.decode("utf-8")` ran first, so a non-UTF-8 body surfaced
    # as an unhandled UnicodeDecodeError — a 500 with a traceback for input the
    # caller fully controls.
    try:
        body_str = body.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("Webhook body is not valid UTF-8 (length=%d)", len(body))
        raise HTTPException(status_code=400, detail="Invalid request body encoding")

    try:
        events = parser.parse(body_str, x_line_signature)
    except InvalidSignatureError:
        logger.error("Invalid LINE webhook signature (body length=%d)", len(body_str))
        raise HTTPException(status_code=400, detail="Invalid signature")

    # An event row is committed before the ACK. A crash in the background task
    # can be redelivered; the row is the durable record of that fact.
    try:
        async with AsyncSessionLocal() as db:
            for event in events:
                event_id = getattr(event, "webhook_event_id", None)
                if not event_id or await db.get(WebhookEvent, event_id):
                    continue
                try:
                    async with db.begin_nested():
                        db.add(WebhookEvent(
                            event_id=event_id,
                            event_type=type(event).__name__,
                        ))
                except IntegrityError:
                    # Concurrent duplicate; the first delivery owns the row.
                    pass
            await db.commit()
    except Exception:
        # Never ACK a duplicate delivered during a DB outage; fail closed
        # only when the durable marker cannot be written. The first delivery
        # is still processing and LINE will retry this one.
        raise HTTPException(status_code=503, detail="Intake storage unavailable")

    background_tasks.add_task(process_webhook_events, events)

    return "OK"


async def _claim_event(db: AsyncSession, event_id: str) -> Optional[datetime]:
    """Atomically claim an unapplied event. Returns the lease token on win."""
    ttl = func.now() - func.make_interval(0, 0, 0, 0, 0, 0, settings.WEBHOOK_EVENT_TTL)
    result = await db.execute(
        update(WebhookEvent)
        .where(
            WebhookEvent.event_id == event_id,
            WebhookEvent.inbound_applied_at.is_(None),
            or_(WebhookEvent.inbound_claimed_at.is_(None), WebhookEvent.inbound_claimed_at < ttl),
        )
        .values(inbound_claimed_at=func.now())
        .returning(WebhookEvent.inbound_claimed_at)
    )
    token = result.scalar_one_or_none()
    if hasattr(token, "__await__"):
        token = await token  # AsyncMock db in unit tests.
    await db.commit()
    return token


async def _finalize_event(db: AsyncSession, event_id: str, token: datetime) -> bool:
    """Mark the claimed event applied only while this worker still owns it."""
    result = await db.execute(
        update(WebhookEvent)
        .where(
            WebhookEvent.event_id == event_id,
            WebhookEvent.inbound_applied_at.is_(None),
            WebhookEvent.inbound_claimed_at == token,
        )
        .values(inbound_applied_at=func.now(), inbound_claimed_at=None)
        .returning(WebhookEvent.event_id)
    )
    win = result.scalar_one_or_none()
    if hasattr(win, "__await__"):
        win = await win  # AsyncMock db in unit tests.
    return win is not None


async def process_webhook_events(events):
    """Process webhook events with deduplication support."""
    async with AsyncSessionLocal() as db:
        for event in events:
            cache_key = None
            lock_key = None
            lock_token: Optional[str] = None
            lock_acquired = False
            try:
                event_id = getattr(event, 'webhook_event_id', None)
                if event_id:
                    cache_key = f"{WEBHOOK_EVENT_KEY_PREFIX}{event_id}"
                    if await redis_client.exists(cache_key):
                        logger.info(f"Duplicate webhook event {event_id}, skipping")
                        continue
                    lock_key = f"{cache_key}{WEBHOOK_EVENT_LOCK_SUFFIX}"
                    # Store a per-invocation token (not a constant): the Lua
                    # compare-and-delete release only deletes the lock when
                    # the stored token still matches, so a stale holder whose
                    # TTL expired can never delete another worker's lock.
                    lock_token = uuid.uuid4().hex
                    lock_acquired = await redis_client.set(
                        lock_key,
                        lock_token,
                        seconds=settings.WEBHOOK_EVENT_TTL,
                        nx=True,
                    )
                    # Tri-state: False = another worker holds the lock (real
                    # duplicate delivery → skip); None = Redis unavailable →
                    # fail OPEN and process (dedup is best-effort; dropping
                    # every event during a Redis outage would be worse than a
                    # rare double-process).
                    if lock_acquired is False:
                        logger.info(f"Webhook event {event_id} is already being processed, skipping duplicate delivery")
                        continue
                    if lock_acquired is None:
                        logger.warning(f"Redis unavailable - processing webhook event {event_id} without dedup lock")

                # Durable claim: Redis dedup is best-effort. The atomic UPDATE
                # admits exactly one worker even when Redis is unavailable,
                # and refuses an event that was already applied.
                claim_token = None
                if event_id:
                    claim_token = await _claim_event(db, event_id)
                    if claim_token is None:
                        logger.info("Inbound already applied or claimed for webhook event %s", event_id)
                        continue

                box = None
                if isinstance(event, MessageEvent):
                    box = new_outbox()
                    await handle_message_event(event, db, box)
                elif isinstance(event, PostbackEvent):
                    box = new_outbox()
                    await handle_postback_event(event, db, box)
                elif isinstance(event, FollowEvent):
                    box = new_outbox()
                    await handle_follow_event(event, db, box)
                elif isinstance(event, UnfollowEvent):
                    await handle_unfollow_event(event, db)

                if event_id:
                    won = await _finalize_event(db, event_id, claim_token)
                    if not won:
                        await db.rollback()
                        logger.warning("Webhook event %s lease lost before finalize", event_id)
                        continue
                await db.commit()

                outcomes = {}
                if box is not None:
                    if any(isinstance(item, OutboxItem) for item in box):
                        outcomes = await drain_outbox_outcomes(box)
                    else:
                        # Legacy untagged callers are preserved: a failure is
                        # recorded as reply failure for backward compatibility.
                        failures = await drain_outbox(box)
                        outcomes = {
                            OutboxKind.REPLY: (
                                DeliveryOutcome.NOT_SENT if failures else DeliveryOutcome.SENT
                            )
                        }
                reply_outcome = outcomes.get(OutboxKind.REPLY)
                if event_id:
                    async with AsyncSessionLocal() as status_db:
                        row = await status_db.get(WebhookEvent, event_id)
                        if row is not None:
                            row.reply_status = _REPLY_STATUS.get(
                                reply_outcome, ReplyDeliveryStatus.NONE
                            )
                        await status_db.commit()

                reply_settled = reply_outcome in (None, DeliveryOutcome.SENT)
                if cache_key and reply_settled:
                    try:
                        await redis_client.setex(
                            cache_key,
                            settings.WEBHOOK_EVENT_TTL,
                            "1"
                        )
                        logger.debug(f"Marked event {event_id} as processed")
                    except (ConnectionError, TimeoutError, OSError) as redis_err:
                        logger.warning(
                            "Failed to set dedup marker for event %s (will allow redelivery): %s",
                            event_id, redis_err,
                        )
                elif cache_key:
                    logger.error(
                        "delivery_failed for event %s: reply outcome %s (marker skipped, will allow redelivery)",
                        event_id, reply_outcome,
                    )
            except Exception as e:
                await db.rollback()
                event_id = getattr(event, 'webhook_event_id', 'unknown')
                logger.error("Failed to process event %s (%s): %s", event_id, type(event).__name__, e, exc_info=True)
                continue
            finally:
                # Release the lock ONLY when this invocation actually acquired
                # it: the `continue` paths above (lock lost to another worker,
                # Redis down) still run the finally block. The Lua
                # compare-and-delete makes the release atomic: if our TTL
                # expired and another worker now holds the lock, our stale
                # token no longer matches and their lock survives.
                if lock_key and lock_acquired:
                    await redis_client.release_lock(lock_key, lock_token)


async def handle_message_event(event: MessageEvent, db: AsyncSession, outbox: Outbox | None = None):
    """Thin wrapper — real logic in message_intake.message_handler."""
    await _handle_message_event_impl(event, db, outbox)


async def handle_follow_event(event: FollowEvent, db: AsyncSession,
                            box: Outbox | None = None):
    """Handle when a user adds the LINE OA as friend."""
    line_user_id = event.source.user_id
    logger.info(f"User {mask_line_id(line_user_id)} followed the OA")
    user = await friend_service.get_or_create_user(line_user_id, db, commit=False)
    event_row = await friend_service.handle_follow(line_user_id, db, commit=False)
    # Welcome reply (fail-silent): sent via the event outbox so it is drained
    # only after db.commit() — same ghost-send discipline as message events.
    try:
        from functools import partial

        from app.services.line_service import line_service
        from app.services.welcome_service import render_welcome

        refollow_count = getattr(event_row, "refollow_count", 0) or 0
        text = await render_welcome(
            db,
            display_name=getattr(user, "display_name", None),
            follow_count=refollow_count + 1,
        )
        if text and box is not None:
            box.append(reply(partial(line_service.reply_text, event.reply_token, text)))
    except Exception as exc:
        logger.warning(
            "Follow welcome skipped for %s: %s", mask_line_id(line_user_id), exc
        )


async def handle_unfollow_event(event: UnfollowEvent, db: AsyncSession):
    """Handle when a user blocks/unfollows the LINE OA."""
    line_user_id = event.source.user_id
    logger.info(f"User {mask_line_id(line_user_id)} unfollowed the OA")
    await friend_service.handle_unfollow(line_user_id, db, commit=False)
