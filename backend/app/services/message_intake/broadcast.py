"""Deduplicated admin-notification broadcast.

Extracted from webhook.py where the same "notify all connected admins with
per-admin unread counts" pattern appeared twice (text + non-text branches).
"""
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.ws_events import WSEventType

from ._deps import get_live_chat_service, get_ws_manager


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def notify_admins_conversation_update(
    line_user_id: str,
    user,
    saved_message,
    content: str,
    db: AsyncSession,
) -> None:
    """Broadcast CONVERSATION_UPDATE to all connected admins with per-admin unread counts."""
    ws = get_ws_manager()
    room_id = ws.get_room_id(line_user_id)

    for admin_id in ws.get_connected_admin_ids():
        if await ws.is_admin_in_room_global(admin_id, room_id):
            await ws.mark_conversation_read(
                admin_id,
                line_user_id,
                saved_message.created_at if saved_message.created_at else _utcnow(),
            )
            unread_count = 0
        else:
            unread_count = await get_live_chat_service().get_unread_count(
                line_user_id=line_user_id,
                admin_id=admin_id,
                db=db,
            )

        await ws.send_to_admin(admin_id, {
            "type": WSEventType.CONVERSATION_UPDATE.value,
            "payload": {
                "line_user_id": line_user_id,
                "display_name": user.display_name or "LINE User",
                "picture_url": user.picture_url,
                "chat_mode": user.chat_mode.value if user.chat_mode else "BOT",
                "last_message": {
                    "content": content,
                    "created_at": saved_message.created_at.isoformat(),
                },
                "unread_count": unread_count,
            },
            "timestamp": _utcnow().isoformat(),
        })
