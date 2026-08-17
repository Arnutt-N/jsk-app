"""Operator-to-user message sending (text and media) and chat-mode toggle."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_action
from app.models.message import MessageDirection
from app.models.user import ChatMode, User
from app.services.line_service import line_service
from app.services.user_identity_service import resolve_by_line_id

from ._deps import get_sla_service

logger = logging.getLogger(__name__)


class MessagingMixin:
    @audit_action("send_message", "message")
    async def send_message(self, line_user_id: str, text: str, operator_id: int, db: AsyncSession):
        """Send message from operator to user via LINE"""
        from linebot.v3.messaging import TextMessage

        session = await self._require_active_session_owner(line_user_id, operator_id, db)

        # Get operator name
        operator_result = await db.execute(select(User).where(User.id == operator_id))
        operator = operator_result.scalar_one_or_none()
        operator_name = operator.display_name if operator else "Admin"

        await line_service.push_messages(line_user_id, [TextMessage(text=text)])

        await line_service.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.OUTGOING,
            message_type="text",
            content=text,
            sender_role="ADMIN",
            operator_name=operator_name,
            user_id=session.user_id,
        )

        session.message_count += 1
        session.last_activity_at = datetime.now(timezone.utc)
        if not session.first_response_at:
            session.first_response_at = datetime.now(timezone.utc)
            await get_sla_service().check_frt_on_first_response(session, db)

        user = await resolve_by_line_id(db, line_user_id)
        if user:
            user.last_message_at = datetime.now(timezone.utc)

        return {"success": True}

    @audit_action("send_media", "message")
    async def send_media_message(
        self,
        line_user_id: str,
        operator_id: int,
        file_bytes: bytes,
        file_name: str,
        content_type: Optional[str],
        db: AsyncSession,
    ):
        """Send media from operator to user, persist file, and store outgoing message."""
        from linebot.v3.messaging import TextMessage

        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty",
            )

        media_type = "image" if (content_type or "").startswith("image/") else "file"

        session = await self._require_active_session_owner(line_user_id, operator_id, db)

        operator_result = await db.execute(select(User).where(User.id == operator_id))
        operator = operator_result.scalar_one_or_none()
        operator_name = operator.display_name if operator else "Admin"

        media = await line_service.persist_operator_upload(
            data=file_bytes,
            media_type=media_type,
            file_name=file_name,
            content_type=content_type,
        )

        media_url = media.get("url")
        if not media_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist media",
            )

        if media_type == "image":
            if not str(media_url).startswith("http"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SERVER_BASE_URL must be configured for image sending",
                )
            await line_service.push_image_message(
                line_user_id=line_user_id,
                image_url=media_url,
                preview_url=media.get("preview_url") or media_url,
            )
            content = "[Image]"
        else:
            text = f"Attachment: {file_name}\n{media_url}"
            await line_service.push_messages(line_user_id, [TextMessage(text=text[:5000])])
            content = file_name or "[File]"

        payload = {
            "url": media_url,
            "preview_url": media.get("preview_url"),
            "file_name": media.get("file_name") or file_name,
            "content_type": media.get("content_type"),
            "size": media.get("size"),
        }
        saved_message = await line_service.save_message(
            db=db,
            line_user_id=line_user_id,
            direction=MessageDirection.OUTGOING,
            message_type=media_type,
            content=content,
            payload=payload,
            sender_role="ADMIN",
            operator_name=operator_name,
            user_id=session.user_id,
        )

        session.message_count += 1
        session.last_activity_at = datetime.now(timezone.utc)
        if not session.first_response_at:
            session.first_response_at = datetime.now(timezone.utc)
            await get_sla_service().check_frt_on_first_response(session, db)
        await db.commit()

        return {
            "success": True,
            "message": {
                "id": saved_message.id,
                "line_user_id": line_user_id,
                "direction": saved_message.direction.value if hasattr(saved_message.direction, "value") else saved_message.direction,
                "content": saved_message.content,
                "message_type": saved_message.message_type,
                "payload": saved_message.payload,
                "sender_role": saved_message.sender_role.value if hasattr(saved_message.sender_role, "value") else saved_message.sender_role,
                "operator_name": saved_message.operator_name,
                "created_at": saved_message.created_at.isoformat() if saved_message.created_at else None,
            },
        }

    async def set_chat_mode(self, line_user_id: str, mode: ChatMode, db: AsyncSession):
        """Toggle chat mode"""
        user = await resolve_by_line_id(db, line_user_id)
        if user:
            user.chat_mode = mode
            await db.commit()
            return True
        return False
