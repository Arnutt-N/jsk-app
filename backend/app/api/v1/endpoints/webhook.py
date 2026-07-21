from fastapi import APIRouter, Request, HTTPException, Header, BackgroundTasks
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.webhooks import (
    MessageEvent,
    TextMessageContent,
    PostbackEvent,
    FollowEvent,
    UnfollowEvent
)
from linebot.v3.messaging import TextMessage, FlexMessage
import re
from app.core.line_client import parser
from app.services.line_service import line_service, describe_line_message
from app.services.friend_service import friend_service
from app.services.response_parser import parse_response
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, literal
from app.models.message import MessageDirection
from app.models.auto_reply import AutoReply
from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType
from app.models.service_request import ServiceRequest
from app.services.flex_messages import build_request_status_list
from sqlalchemy.orm import selectinload
from app.core.websocket_manager import ws_manager
from app.core.redis_client import redis_client
from app.schemas.ws_events import WSEventType
from app.core.config import settings
from app.services.handoff_service import handoff_service
from app.services.live_chat_service import live_chat_service
from datetime import datetime, timezone
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Webhook event deduplication cache key prefix
WEBHOOK_EVENT_KEY_PREFIX = "webhook:event:"
WEBHOOK_EVENT_LOCK_SUFFIX = ":lock"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_isoformat() -> str:
    return _utcnow().isoformat()

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

    # Use BackgroundTasks to process events asynchronously
    background_tasks.add_task(process_webhook_events, events)

    return "OK"

async def process_webhook_events(events):
    """Process webhook events with deduplication support."""
    async with AsyncSessionLocal() as db:
        for event in events:
            cache_key = None
            lock_key = None
            try:
                # Deduplication check using webhookEventId
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
                    if not lock_acquired:
                        logger.info(f"Webhook event {event_id} is already being processed, skipping duplicate delivery")
                        continue

                # Process the event
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
                if lock_key:
                    await redis_client.delete(lock_key)


async def handle_follow_event(event: FollowEvent, db: AsyncSession):
    """Handle when a user adds the LINE OA as friend"""
    line_user_id = event.source.user_id
    logger.info(f"User {line_user_id} followed the OA")

    # Create user record and log follow event
    await friend_service.get_or_create_user(line_user_id, db, commit=False)
    await friend_service.handle_follow(line_user_id, db, commit=False)


async def handle_unfollow_event(event: UnfollowEvent, db: AsyncSession):
    """Handle when a user blocks/unfollows the LINE OA"""
    line_user_id = event.source.user_id
    logger.info(f"User {line_user_id} unfollowed the OA")

    await friend_service.handle_unfollow(line_user_id, db, commit=False)


# REGEX intent guards: patterns are admin-authored, but a runaway pattern must
# not stall webhook processing (Python's `re` has no timeout). Bounding both the
# pattern and the probed text keeps worst-case backtracking small.
MAX_REGEX_PATTERN_LENGTH = 256
MAX_REGEX_TEXT_LENGTH = 1000


def _intent_keyword_stmt(*filters):
    return (
        select(IntentKeyword)
        .options(
            selectinload(IntentKeyword.category).selectinload(
                IntentCategory.responses.and_(IntentResponse.is_active == True)
            )
        )
        .filter(*filters)
    )


async def find_intent_keyword(text: str, db: AsyncSession) -> IntentKeyword | None:
    """Match an IntentKeyword against the user's text.

    Priority: EXACT > STARTS_WITH > CONTAINS > REGEX — most specific first, so
    a broad CONTAINS/REGEX rule cannot shadow a precise one. All comparisons
    are case-insensitive. REGEX is evaluated in Python (not SQL) so an invalid
    pattern degrades to a logged skip instead of failing the whole query.
    """
    # 1. EXACT — case-insensitive equality (no wildcard semantics)
    stmt = _intent_keyword_stmt(
        func.lower(IntentKeyword.keyword) == text.lower(),
        IntentKeyword.match_type == MatchType.EXACT,
    ).limit(1)
    match = (await db.execute(stmt)).scalars().first()
    if match:
        return match

    # 2. STARTS_WITH — user text begins with the keyword
    stmt = _intent_keyword_stmt(
        literal(text).ilike(func.concat(IntentKeyword.keyword, '%')),
        IntentKeyword.match_type == MatchType.STARTS_WITH,
    ).limit(1)
    match = (await db.execute(stmt)).scalars().first()
    if match:
        return match

    # 3. CONTAINS — keyword appears anywhere in the user text
    stmt = _intent_keyword_stmt(
        literal(text).ilike(func.concat('%', IntentKeyword.keyword, '%')),
        IntentKeyword.match_type == MatchType.CONTAINS,
    ).limit(1)
    match = (await db.execute(stmt)).scalars().first()
    if match:
        return match

    # 4. REGEX — evaluate each stored pattern in Python
    stmt = _intent_keyword_stmt(IntentKeyword.match_type == MatchType.REGEX)
    regex_keywords = (await db.execute(stmt)).scalars().all()
    probe = text[:MAX_REGEX_TEXT_LENGTH]
    for kw in regex_keywords:
        pattern = kw.keyword or ""
        if len(pattern) > MAX_REGEX_PATTERN_LENGTH:
            logger.warning(
                f"Skipping REGEX intent keyword {kw.id}: pattern longer than "
                f"{MAX_REGEX_PATTERN_LENGTH} chars"
            )
            continue
        try:
            if re.search(pattern, probe, re.IGNORECASE):
                return kw
        except re.error as exc:
            logger.warning(f"Skipping invalid REGEX intent keyword {kw.id}: {exc}")
    return None


async def _find_autoreply_rule(text: str, db: AsyncSession):
    """Legacy AutoReply lookup: active exact keyword, then active contains."""
    stmt = select(AutoReply).filter(
        AutoReply.keyword == text, AutoReply.is_active == True
    )
    rule = (await db.execute(stmt)).scalars().first()
    if rule:
        return rule
    # Contains: 'User Text' ILIKE '%' + AutoReply.keyword + '%'
    stmt = select(AutoReply).filter(
        literal(text).ilike(func.concat('%', AutoReply.keyword, '%')),
        AutoReply.is_active == True,
    ).limit(1)
    return (await db.execute(stmt)).scalars().first()


async def resolve_reply_responses(text: str, db: AsyncSession):
    """Resolve which responses answer ``text`` (issue #122).

    Tries an IntentKeyword match first, using its category's responses only when
    the category is active AND has >=1 active response. Otherwise — no keyword, an
    inactive category, or a category with no active responses — falls through to
    legacy AutoReply (exact -> contains) so a matched-but-unserviceable intent
    never dead-ends the message (before this fix both branches returned early and
    the bot silently swallowed the user's message).

    Returns ``(responses, category_name, keyword_match)``. ``keyword_match`` is
    None whenever the answer comes from AutoReply, so the caller labels the reply
    from the rule rather than the dead intent. Returns ``([], "", None)`` when
    nothing can answer — the bot stays silent, which is the correct default.
    """
    keyword_match = await find_intent_keyword(text, db)
    if keyword_match:
        category = keyword_match.category
        if category and category.is_active and category.responses:
            return list(category.responses), category.name, keyword_match
        logger.info(
            "Intent keyword '%s' matched but its category is unavailable "
            "(inactive or no active responses) — falling through to AutoReply.",
            keyword_match.keyword,
        )

    rule = await _find_autoreply_rule(text, db)
    if not rule:
        logger.info(f"No auto-reply or intent found for: {text}")
        return [], "", None

    responses = [{
        "reply_type": rule.reply_type,
        "text_content": rule.text_content,
        "payload": rule.payload,
        "keyword": rule.keyword,
    }]
    return responses, "Legacy", None


async def handle_message_event(event: MessageEvent, db: AsyncSession):
    # Check for LINE Verify dummy token
    if event.reply_token == "00000000000000000000000000000000":
        logger.info("Received Verify Event (dummy token). Skipping reply.")
        return

    line_user_id = event.source.user_id
    line_message_id = str(getattr(event.message, "id", "")) or None

    if line_message_id:
        existing_message = await line_service.get_incoming_message_by_line_message_id(
            db=db,
            line_user_id=line_user_id,
            line_message_id=line_message_id,
        )
        if existing_message:
            logger.info(
                "Skipping re-delivered LINE message %s for user %s because it is already persisted",
                line_message_id,
                line_user_id,
            )
            return

    # Ensure User record exists (critical for live chat to show this user)
    user = await friend_service.get_or_create_user(line_user_id, db, commit=False)
    user = await friend_service.refresh_profile(
        line_user_id,
        db,
        force=False,
        stale_after_hours=24,
        commit=False,
    ) or user

    # Update last_message_at for conversation sorting
    user.last_message_at = _utcnow()

    if isinstance(event.message, TextMessageContent):
        text = event.message.text.strip()

        # 1. Save User Message (Incoming)
        saved_message = await line_service.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.INCOMING,
            message_type="text",
            content=text,
            payload={"line_message_id": line_message_id} if line_message_id else None,
            commit=False,
            user_id=user.id,
        )

        # Broadcast to WebSocket clients in room (for operators viewing this conversation)
        room_id = ws_manager.get_room_id(line_user_id)
        await ws_manager.broadcast_to_room(room_id, {
            "type": WSEventType.NEW_MESSAGE.value,
            "payload": {
                "id": saved_message.id,
                "line_user_id": line_user_id,
                "direction": "INCOMING",
                "content": text,
                "message_type": "text",
                "sender_role": "USER",
                "created_at": saved_message.created_at.isoformat()
            },
            "timestamp": _utcnow_isoformat()
        })

        # Send conversation updates per admin with personalized unread counts.
        room_id = ws_manager.get_room_id(line_user_id)
        for admin_id in ws_manager.get_connected_admin_ids():
            if await ws_manager.is_admin_in_room_global(admin_id, room_id):
                await ws_manager.mark_conversation_read(
                    admin_id,
                    line_user_id,
                    saved_message.created_at if saved_message.created_at else _utcnow(),
                )
                unread_count = 0
            else:
                unread_count = await live_chat_service.get_unread_count(
                    line_user_id=line_user_id,
                    admin_id=admin_id,
                    db=db,
                )

            await ws_manager.send_to_admin(admin_id, {
                "type": WSEventType.CONVERSATION_UPDATE.value,
                "payload": {
                    "line_user_id": line_user_id,
                    "display_name": user.display_name or "LINE User",
                    "picture_url": user.picture_url,
                    "chat_mode": user.chat_mode.value if user.chat_mode else "BOT",
                    "last_message": {
                        "content": text,
                        "created_at": saved_message.created_at.isoformat()
                    },
                    "unread_count": unread_count,
                },
                "timestamp": _utcnow_isoformat()
            })

        # Skip all bot processing if user is in HUMAN mode (operator handling)
        if user.chat_mode and user.chat_mode.value == "HUMAN":
            logger.info(f"User {line_user_id} in HUMAN mode — skipping bot reply")
            return

        # 2. Show Loading Animation
        await line_service.show_loading_animation(line_user_id)

        # --- HANDOFF KEYWORD DETECTION ---
        # Check for handoff keywords before intent matching
        if await handoff_service.check_handoff_keywords(
            text,
            user,
            event.reply_token,
            db,
            commit=False,
        ):
            # Handoff initiated - skip bot response
            return
        # -----------------------------------

        # --- SPECIAL COMMAND: CHECK STATUS ---
        if text == "ติดตาม" or text == "สถานะ":
            await handle_check_status(line_user_id, event.reply_token, db)
            return
            
        # Check if text is a phone number (0xxxxxxxxx)
        if re.match(r"^0\d{9}$", text):
            await handle_bind_phone(text, line_user_id, event.reply_token, db)
            return
        # -------------------------------------

        # 3. Resolve which responses answer this text. IntentKeyword first
        # (EXACT > STARTS_WITH > CONTAINS > REGEX inside find_intent_keyword),
        # then legacy AutoReply (exact, then contains) for backward
        # compatibility. A matched intent whose category is inactive or has no
        # active responses falls through to AutoReply instead of dead-ending the
        # message (#122).
        responses, cat_name, keyword_match = await resolve_reply_responses(text, db)

        if not responses:
            return

        # 4. Build and send all responses
        all_messages = []
        
        for res in responses:
            # Check for max 5 messages (LINE limit)
            if len(all_messages) >= 5:
                break
                
            reply_type = res.reply_type if isinstance(res, IntentResponse) else res["reply_type"]
            text_content = res.text_content if isinstance(res, IntentResponse) else res["text_content"]
            payload = res.payload if isinstance(res, IntentResponse) else res["payload"]
            
            try:
                if payload:
                    # Flex/Complex Payload
                    from linebot.v3.messaging import FlexMessage, FlexContainer
                    from app.utils.url_utils import resolve_payload_urls, strip_flex_body
                    
                    resolved_payload = resolve_payload_urls(payload)
                    stripped_payload = strip_flex_body(resolved_payload)
                    container = FlexContainer.from_dict(stripped_payload)
                    
                    if text_content:
                        all_messages.append(TextMessage(text=text_content))
                    
                    # Ensure we don't exceed 5
                    if len(all_messages) < 5:
                        keyword_label = keyword_match.keyword if keyword_match else res.get("keyword", "Bot")
                        all_messages.append(FlexMessage(alt_text=keyword_label, contents=container))
                else:
                    # Text or Object Reference
                    msgs = await parse_response(text_content or "", db)
                    if msgs:
                        # Extend but keep limit 5
                        for m in msgs:
                            if len(all_messages) < 5:
                                all_messages.append(m)
                    elif text_content:
                        # Simple text fallback
                        all_messages.append(TextMessage(text=text_content))
            except Exception as e:
                logger.error(f"Error building response in category {cat_name}: {e}")

        if all_messages:
            try:
                await line_service.reply_messages(event.reply_token, all_messages)
                
                # 5. Save each bot reply with its real type/content so the
                # admin panel shows what the customer actually received
                # (was: a single "Sent N messages for intent" summary row).
                for sent_message in all_messages:
                    m_type, m_content, m_payload = describe_line_message(sent_message)
                    await line_service.save_message(
                        db=db,
                        line_user_id=line_user_id,
                        direction=MessageDirection.OUTGOING,
                        message_type=m_type,
                        content=m_content,
                        payload=m_payload,
                        sender_role="BOT",
                        commit=False,
                        user_id=user.id,
                    )
            except Exception as e:
                logger.error(f"Failed to send all messages: {e}")
                await line_service.reply_text(event.reply_token, "ขออภัย เกิดข้อผิดพลาดในการส่งข้อมูล")


    else:
        message_type, content, payload = await _extract_non_text_message(event.message)
        if not message_type:
            logger.info("Unsupported non-text message type: %s", getattr(event.message, "type", "unknown"))
            return

        saved_message = await line_service.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.INCOMING,
            message_type=message_type,
            content=content,
            payload=payload,
            sender_role="USER",
            commit=False,
            user_id=user.id,
        )

        room_id = ws_manager.get_room_id(line_user_id)
        await ws_manager.broadcast_to_room(room_id, {
            "type": WSEventType.NEW_MESSAGE.value,
            "payload": {
                "id": saved_message.id,
                "line_user_id": line_user_id,
                "direction": "INCOMING",
                "content": content,
                "message_type": message_type,
                "payload": payload,
                "sender_role": "USER",
                "created_at": saved_message.created_at.isoformat()
            },
            "timestamp": _utcnow_isoformat()
        })

        for admin_id in ws_manager.get_connected_admin_ids():
            if await ws_manager.is_admin_in_room_global(admin_id, room_id):
                await ws_manager.mark_conversation_read(
                    admin_id,
                    line_user_id,
                    saved_message.created_at if saved_message.created_at else _utcnow(),
                )
                unread_count = 0
            else:
                unread_count = await live_chat_service.get_unread_count(
                    line_user_id=line_user_id,
                    admin_id=admin_id,
                    db=db,
                )

            await ws_manager.send_to_admin(admin_id, {
                "type": WSEventType.CONVERSATION_UPDATE.value,
                "payload": {
                    "line_user_id": line_user_id,
                    "display_name": user.display_name or "LINE User",
                    "picture_url": user.picture_url,
                    "chat_mode": user.chat_mode.value if user.chat_mode else "BOT",
                    "last_message": {
                        "content": content,
                        "created_at": saved_message.created_at.isoformat()
                    },
                    "unread_count": unread_count,
                },
                "timestamp": _utcnow_isoformat()
            })


async def _extract_non_text_message(message):
    message_type = getattr(message, "type", None)
    line_message_id = getattr(message, "id", None)

    if message_type == "image":
        media = await line_service.persist_line_media(
            message_id=str(line_message_id),
            media_type="image",
        ) if line_message_id else {"url": None, "preview_url": None, "content_type": None, "size": None}
        return "image", "[Image]", {
            "line_message_id": line_message_id,
            "preview_url": media.get("preview_url"),
            "url": media.get("url"),
            "content_type": media.get("content_type"),
            "size": media.get("size"),
        }

    if message_type == "sticker":
        package_id = str(getattr(message, "package_id", ""))
        sticker_id = str(getattr(message, "sticker_id", ""))
        return "sticker", f"[Sticker {package_id}/{sticker_id}]", {
            "line_message_id": line_message_id,
            "package_id": package_id,
            "sticker_id": sticker_id,
            "sticker_resource_type": getattr(message, "sticker_resource_type", None),
        }

    if message_type == "file":
        file_name = getattr(message, "file_name", None)
        file_size = getattr(message, "file_size", None)
        media = await line_service.persist_line_media(
            message_id=str(line_message_id),
            media_type="file",
            file_name=file_name,
        ) if line_message_id else {"url": None, "preview_url": None, "content_type": None, "size": None}
        return "file", file_name or "[File]", {
            "line_message_id": line_message_id,
            "file_name": media.get("file_name") or file_name,
            "size": media.get("size") if media.get("size") is not None else file_size,
            "url": media.get("url"),
            "content_type": media.get("content_type"),
        }

    if message_type in {"video", "audio"}:
        media = await line_service.persist_line_media(
            message_id=str(line_message_id),
            media_type=message_type,
        ) if line_message_id else {"url": None, "preview_url": None, "content_type": None, "size": None}
        return message_type, "[Video]" if message_type == "video" else "[Audio]", {
            "line_message_id": line_message_id,
            "url": media.get("url"),
            "content_type": media.get("content_type"),
            "size": media.get("size"),
        }

    return None, "", {}


async def handle_postback_event(event: PostbackEvent, db: AsyncSession):
    line_user_id = event.source.user_id
    data = event.postback.data

    await line_service.show_loading_animation(line_user_id)

    if data == "action=track_requests":
        await handle_check_status(line_user_id, event.reply_token, db)
    elif data.startswith("csat|"):
        await handle_csat_response(line_user_id, data, event.reply_token, db)
    else:
        # Handle other postbacks if any
        logger.info("Unhandled postback data '%s' from user %s", data, line_user_id)


async def handle_csat_response(line_user_id: str, data: str, reply_token: str, db: AsyncSession):
    """Handle CSAT survey postback: csat|{session_id}|{score}"""
    try:
        parts = data.split("|")
        if len(parts) != 3:
            logger.warning(f"Invalid CSAT postback data: {data}")
            return

        session_id = int(parts[1])
        score = int(parts[2])

        if not 1 <= score <= 5:
            logger.warning(f"Invalid CSAT score: {score}")
            return

        from app.services.csat_service import csat_service
        from app.services.user_identity_service import resolve_by_line_id

        resolved_user = await resolve_by_line_id(db, line_user_id)
        response = await csat_service.record_response(
            session_id=session_id,
            line_user_id=line_user_id,
            score=score,
            feedback=None,
            db=db,
            user_id=resolved_user.id if resolved_user else None,
        )

        thank_you = csat_service.get_thank_you_message(score)
        await line_service.reply_text(reply_token, thank_you)

    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing CSAT postback '{data}': {e}")
    except Exception as e:
        logger.error(f"Error recording CSAT response: {e}")

async def handle_check_status(line_user_id: str, reply_token: str, db: AsyncSession):
    """Fetch latest 5 requests and reply with Flex Message or ask for Phone"""
    try:
        from app.services.user_identity_service import resolve_by_line_id, child_filter

        resolved_user = await resolve_by_line_id(db, line_user_id)
        user_id = resolved_user.id if resolved_user else None

        stmt = (
            select(ServiceRequest)
            .where(child_filter(ServiceRequest, line_user_id, user_id))
            .order_by(ServiceRequest.created_at.desc())
            .limit(5)
        )
        result = await db.execute(stmt)
        requests = result.scalars().all()
        
        if not requests:
            # Not found by LINE ID -> Ask for Phone
            msg = (
                "⚠️ ไม่พบประวัติคำร้องที่ผูกกับ LINE ของคุณ\n\n"
                "หากท่านเคยยื่นเรื่องไว้ กรุณาพิมพ์ **เบอร์โทรศัพท์** (10 หลัก) "
                "เพื่อค้นหาและเชื่อมโยงข้อมูลครับ"
            )
            await line_service.reply_text(reply_token, msg)
            return

        # Build Flex Message
        flex_content = build_request_status_list(requests)
        
        # Send Reply
        await line_service.reply_flex(reply_token, "สถานะคำร้องของคุณ", flex_content)
        
    except Exception as e:
        logger.error(f"Error checking status for {line_user_id}: {e}")
        await line_service.reply_text(reply_token, "ขออภัย ไม่สามารถดึงข้อมูลสถานะได้ในขณะนี้")


async def handle_bind_phone(phone_number: str, line_user_id: str, reply_token: str, db: AsyncSession):
    """Search by phone, bind LINE ID, and show status"""
    try:
        from app.services.user_identity_service import resolve_by_line_id

        resolved_user = await resolve_by_line_id(db, line_user_id)
        user_id = resolved_user.id if resolved_user else None

        # 1. Search for requests with this phone number
        # Optional: We could check if they already have a line_user_id to prevent stealing, 
        # but per requirement "Option B", we allow binding.
        
        stmt = select(ServiceRequest).where(ServiceRequest.phone_number == phone_number)
        result = await db.execute(stmt)
        requests = result.scalars().all()
        
        if not requests:
            await line_service.reply_text(reply_token, f"❌ ไม่พบข้อมูลคำร้องของเบอร์ {phone_number} ครับ")
            return
            
        # 2. Guard: Only bind unbound or own requests (prevent history takeover)
        bindable = [r for r in requests if not r.line_user_id or r.line_user_id == line_user_id]
        already_bound_to_others = len(requests) - len(bindable)

        if not bindable:
            await line_service.reply_text(
                reply_token,
                f"คำร้องเบอร์ {phone_number} ถูกผูกกับบัญชี LINE อื่นแล้วครับ "
                "กรุณาติดต่อเจ้าหน้าที่เพื่อดำเนินการ"
            )
            return

        for req in bindable:
            req.line_user_id = line_user_id
            if user_id is not None:
                req.user_id = user_id
        await db.flush()

        if already_bound_to_others > 0:
            logger.warning(
                f"Phone bind: {already_bound_to_others} requests for {phone_number} "
                f"already bound to other LINE users, skipped"
            )
        
        # 3. Fetch updated list (Top 5)
        stmt_latest = (
            select(ServiceRequest)
            .where(ServiceRequest.line_user_id == line_user_id)
            .order_by(ServiceRequest.created_at.desc())
            .limit(5)
        )
        result_latest = await db.execute(stmt_latest)
        latest_requests = result_latest.scalars().all()
        
        # 4. Success Reply
        flex_content = build_request_status_list(latest_requests)
        
        # Add a text message saying "Linked successfully" before the Flex? 
        # LineService.reply_flex sends one message. We can't easily send two unless we modify it.
        # For simplicity, just sending the list implies success. OR we assume build_request_status_list handles it.
        # Let's send a success text then the flex? No, reply token used once.
        # We'll just send the Flex. The user will see their data.
        
        await line_service.reply_flex(reply_token, "สถานะคำร้องของคุณ", flex_content)
        
    except Exception as e:
        logger.error(f"Error binding phone {phone_number}: {e}")
        await line_service.reply_text(reply_token, "ขออภัย เกิดข้อผิดพลาดในการเชื่อมโยงข้อมูล")
