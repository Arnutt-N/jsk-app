"""LINE webhook endpoint — signature verification and event dispatch only."""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import FollowEvent, MessageEvent, PostbackEvent, UnfollowEvent
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.line_client import parser
from app.core.logging_utils import mask_line_id
from app.core.redis_client import redis_client
from app.db.session import AsyncSessionLocal
from app.services.friend_service import friend_service
from app.services.message_intake.message_handler import handle_message_event as _handle_message_event_impl
from app.services.message_intake.postback_handler import handle_postback_event
from app.services.outbox import Outbox, drain_outbox, new_outbox

router = APIRouter()
logger = logging.getLogger(__name__)

WEBHOOK_EVENT_KEY_PREFIX = "webhook:event:"
WEBHOOK_EVENT_LOCK_SUFFIX = ":lock"

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

    background_tasks.add_task(process_webhook_events, events)

    return "OK"


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

                await db.commit()

                failures = 0
                if box is not None:
                    failures = await drain_outbox(box)

                if cache_key and failures == 0:
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
                        "delivery_failed for event %s: %d outbox send(s) failed (marker skipped, will allow redelivery)",
                        event_id, failures,
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
            box.append(partial(line_service.reply_text, event.reply_token, text))
    except Exception as exc:
        logger.warning(
            "Follow welcome skipped for %s: %s", mask_line_id(line_user_id), exc
        )


async def handle_unfollow_event(event: UnfollowEvent, db: AsyncSession):
    """Handle when a user blocks/unfollows the LINE OA."""
    line_user_id = event.source.user_id
    logger.info(f"User {mask_line_id(line_user_id)} unfollowed the OA")
    await friend_service.handle_unfollow(line_user_id, db, commit=False)
