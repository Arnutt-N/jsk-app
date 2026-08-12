"""Message event handling — the core intake pipeline for incoming LINE messages."""
import logging
import re
from datetime import datetime, timezone

from linebot.v3.messaging import TextMessage
from linebot.v3.webhooks import MessageEvent, TextMessageContent
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intent import IntentResponse
from app.models.message import MessageDirection
from app.schemas.ws_events import WSEventType
from app.services.line_service import describe_line_message
from app.services.response_parser import parse_response

from ._deps import (
    get_friend_service,
    get_handoff_service,
    get_line_service,
    get_ws_manager,
)
from .broadcast import notify_admins_conversation_update
from .commands import (
    BOOKING_QUERY_KEYWORDS,
    handle_bind_phone,
    handle_check_booking,
    handle_check_status,
)
from .intent_matching import resolve_reply_responses
from .media_extraction import extract_non_text_message

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_isoformat() -> str:
    return _utcnow().isoformat()


async def handle_message_event(event: MessageEvent, db: AsyncSession):
    """Process an incoming LINE MessageEvent: persist, broadcast, and reply."""
    line_svc = get_line_service()
    ws = get_ws_manager()
    friend_svc = get_friend_service()
    handoff_svc = get_handoff_service()

    if event.reply_token == "00000000000000000000000000000000":
        logger.info("Received Verify Event (dummy token). Skipping reply.")
        return

    line_user_id = event.source.user_id
    line_message_id = str(getattr(event.message, "id", "")) or None

    if line_message_id:
        existing_message = await line_svc.get_incoming_message_by_line_message_id(
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

    user = await friend_svc.get_or_create_user(line_user_id, db, commit=False)
    user = await friend_svc.refresh_profile(
        line_user_id,
        db,
        force=False,
        stale_after_hours=24,
        commit=False,
    ) or user

    user.last_message_at = _utcnow()

    if isinstance(event.message, TextMessageContent):
        text = event.message.text.strip()

        saved_message = await line_svc.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.INCOMING,
            message_type="text",
            content=text,
            payload={"line_message_id": line_message_id} if line_message_id else None,
            commit=False,
            user_id=user.id,
        )

        room_id = ws.get_room_id(line_user_id)
        await ws.broadcast_to_room(room_id, {
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

        await notify_admins_conversation_update(line_user_id, user, saved_message, text, db)

        if user.chat_mode and user.chat_mode.value == "HUMAN":
            logger.info(f"User {line_user_id} in HUMAN mode — skipping bot reply")
            return

        await line_svc.show_loading_animation(line_user_id)

        if await handoff_svc.check_handoff_keywords(
            text,
            user,
            event.reply_token,
            db,
            commit=False,
        ):
            return

        if text == "ติดตาม" or text == "สถานะ":
            await handle_check_status(line_user_id, event.reply_token, db)
            return

        if text in BOOKING_QUERY_KEYWORDS:
            await handle_check_booking(line_user_id, event.reply_token, db)
            return

        if re.match(r"^0\d{9}$", text):
            await handle_bind_phone(text, line_user_id, event.reply_token, db)
            return

        responses, cat_name, keyword_match = await resolve_reply_responses(text, db)

        if not responses:
            return

        all_messages = []

        for res in responses:
            if len(all_messages) >= 5:
                break

            reply_type = res.reply_type if isinstance(res, IntentResponse) else res["reply_type"]
            text_content = res.text_content if isinstance(res, IntentResponse) else res["text_content"]
            payload = res.payload if isinstance(res, IntentResponse) else res["payload"]

            try:
                if payload:
                    from linebot.v3.messaging import FlexMessage, FlexContainer
                    from app.utils.url_utils import resolve_payload_urls, strip_flex_body

                    resolved_payload = resolve_payload_urls(payload)
                    stripped_payload = strip_flex_body(resolved_payload)
                    container = FlexContainer.from_dict(stripped_payload)

                    if text_content:
                        all_messages.append(TextMessage(text=text_content))

                    if len(all_messages) < 5:
                        keyword_label = keyword_match.keyword if keyword_match else res.get("keyword", "Bot")
                        all_messages.append(FlexMessage(alt_text=keyword_label, contents=container))
                else:
                    msgs = await parse_response(text_content or "", db)
                    if msgs:
                        for m in msgs:
                            if len(all_messages) < 5:
                                all_messages.append(m)
                    elif text_content:
                        all_messages.append(TextMessage(text=text_content))
            except Exception as e:
                logger.error(f"Error building response in category {cat_name}: {e}")

        if all_messages:
            try:
                await line_svc.reply_messages(event.reply_token, all_messages)

                for sent_message in all_messages:
                    m_type, m_content, m_payload = describe_line_message(sent_message)
                    await line_svc.save_message(
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
                await line_svc.reply_text(event.reply_token, "ขออภัย เกิดข้อผิดพลาดในการส่งข้อมูล")

    else:
        message_type, content, payload = await extract_non_text_message(event.message)
        if not message_type:
            logger.info("Unsupported non-text message type: %s", getattr(event.message, "type", "unknown"))
            return

        saved_message = await line_svc.save_message(
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

        room_id = ws.get_room_id(line_user_id)
        await ws.broadcast_to_room(room_id, {
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

        await notify_admins_conversation_update(line_user_id, user, saved_message, content, db)
