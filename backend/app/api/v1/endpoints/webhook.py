"""LINE webhook endpoint — signature verification and event dispatch only."""
from fastapi import APIRouter, Request, HTTPException, Header, BackgroundTasks
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    MessageEvent,
    PostbackEvent,
    FollowEvent,
    UnfollowEvent
)
import logging

from app.core.config import settings
from app.core.line_client import parser
from app.core.redis_client import redis_client
from app.db.session import AsyncSessionLocal
from app.services.friend_service import friend_service
from app.services.message_intake.message_handler import handle_message_event as _handle_message_event_impl
from app.services.message_intake.postback_handler import handle_postback_event

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging_utils import mask_line_id

router = APIRouter()
logger = logging.getLogger(__name__)

WEBHOOK_EVENT_KEY_PREFIX = "webhook:event:"
WEBHOOK_EVENT_LOCK_SUFFIX = ":lock"


@router.post("/webhook")
async def line_webhook(request: Request, background_tasks: BackgroundTasks, x_line_signature: str = Header(None)):
    if x_line_signature is None:
        raise HTTPException(status_code=400, detail="Missing X-Line-Signature header")

    body = await request.body()
    body_str = body.decode('utf-8')

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
            lock_acquired = False
            try:
                event_id = getattr(event, 'webhook_event_id', None)
                if event_id:
                    cache_key = f"{WEBHOOK_EVENT_KEY_PREFIX}{event_id}"
                    if await redis_client.exists(cache_key):
                        logger.info(f"Duplicate webhook event {event_id}, skipping")
                        continue
                    lock_key = f"{cache_key}{WEBHOOK_EVENT_LOCK_SUFFIX}"
                    lock_acquired = await redis_client.set(
                        lock_key,
                        "1",
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

                if isinstance(event, MessageEvent):
                    await handle_message_event(event, db)
                elif isinstance(event, PostbackEvent):
                    await handle_postback_event(event, db)
                elif isinstance(event, FollowEvent):
                    await handle_follow_event(event, db)
                elif isinstance(event, UnfollowEvent):
                    await handle_unfollow_event(event, db)

                await db.commit()

                if cache_key:
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
            except Exception as e:
                await db.rollback()
                event_id = getattr(event, 'webhook_event_id', 'unknown')
                logger.error("Failed to process event %s (%s): %s", event_id, type(event).__name__, e, exc_info=True)
                continue
            finally:
                # Release the lock ONLY when this invocation actually acquired
                # it: the `continue` paths above (lock lost to another worker,
                # Redis down) still run the finally block, and deleting then
                # would destroy the winner's in-flight lock and let a third
                # duplicate delivery process the same event again.
                if lock_key and lock_acquired:
                    await redis_client.delete(lock_key)


async def handle_message_event(event: MessageEvent, db: AsyncSession):
    """Thin wrapper — real logic in message_intake.message_handler."""
    await _handle_message_event_impl(event, db)


async def handle_follow_event(event: FollowEvent, db: AsyncSession):
    """Handle when a user adds the LINE OA as friend."""
    line_user_id = event.source.user_id
    logger.info(f"User {mask_line_id(line_user_id)} followed the OA")
    await friend_service.get_or_create_user(line_user_id, db, commit=False)
    await friend_service.handle_follow(line_user_id, db, commit=False)


async def handle_unfollow_event(event: UnfollowEvent, db: AsyncSession):
    """Handle when a user blocks/unfollows the LINE OA."""
    line_user_id = event.source.user_id
    logger.info(f"User {mask_line_id(line_user_id)} unfollowed the OA")
    await friend_service.handle_unfollow(line_user_id, db, commit=False)
