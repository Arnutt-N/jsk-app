import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, List, Optional
from app.api import deps
from app.services.live_chat_service import live_chat_service
from app.schemas.live_chat import (
    ConversationList, ConversationDetail,
    SendMessageRequest, ModeToggleRequest
)
from app.models.chat_session import ClosedBy
from app.models.user import User
from app.core.websocket_manager import ws_manager
from app.schemas.ws_events import WSEventType
from app.schemas.ws_events import TransferSessionPayload
from app.services.analytics_service import analytics_service
from app.services.friend_service import friend_service
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)


def _message_payload_from_record(message, line_user_id: str, temp_id: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": message.id,
        "line_user_id": line_user_id,
        "direction": message.direction.value if hasattr(message.direction, "value") else message.direction,
        "content": message.content,
        "message_type": message.message_type,
        "payload": message.payload,
        "sender_role": message.sender_role.value if hasattr(message.sender_role, "value") else message.sender_role,
        "operator_name": message.operator_name,
        "created_at": message.created_at.isoformat(),
        "temp_id": temp_id,
    }


async def _broadcast_conversation_update(
    line_user_id: str,
    db: AsyncSession,
    message_payload: dict[str, Any],
) -> None:
    room_id = ws_manager.get_room_id(line_user_id)
    await ws_manager.broadcast_to_room(
        room_id,
        {
            "type": WSEventType.NEW_MESSAGE.value,
            "payload": message_payload,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    detail = await live_chat_service.get_conversation_detail(line_user_id, db)
    display_name = detail["display_name"] if detail else "LINE User"
    picture_url = detail["picture_url"] if detail else None
    chat_mode = detail["chat_mode"].value if detail and hasattr(detail["chat_mode"], "value") else (detail["chat_mode"] if detail else "BOT")

    try:
        read_marker = datetime.fromisoformat(message_payload["created_at"]) if isinstance(message_payload.get("created_at"), str) else datetime.utcnow()
    except ValueError:
        read_marker = datetime.utcnow()

    for admin_id in ws_manager.get_connected_admin_ids():
        if await ws_manager.is_admin_in_room_global(admin_id, room_id):
            await ws_manager.mark_conversation_read(
                admin_id,
                line_user_id,
                read_marker,
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
                "display_name": display_name or "LINE User",
                "picture_url": picture_url,
                "chat_mode": chat_mode,
                "last_message": {
                    "content": message_payload.get("content") or "[Message]",
                    "created_at": message_payload.get("created_at"),
                },
                "unread_count": unread_count,
            },
            "timestamp": datetime.utcnow().isoformat(),
        })

@router.get("/conversations", response_model=ConversationList)
async def list_conversations(
    status: Optional[str] = None,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """List all conversations for inbox"""
    return await live_chat_service.get_conversations(status, db, admin_id=current_user.id)

@router.get("/conversations/{line_user_id}", response_model=ConversationDetail)
async def get_conversation(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Get full chat history with a user"""
    await ws_manager.mark_conversation_read(str(current_user.id), line_user_id)
    detail = await live_chat_service.get_conversation_detail(line_user_id, db)
    if not detail:
        raise HTTPException(status_code=404, detail="User not found")
    return detail

@router.get("/conversations/{line_user_id}/messages")
async def get_conversation_messages(
    line_user_id: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Get paginated conversation messages with cursor-based pagination."""
    return await live_chat_service.get_messages_paginated(
        line_user_id=line_user_id,
        before_id=before_id,
        limit=limit,
        db=db,
    )

@router.post("/conversations/{line_user_id}/messages")
async def send_message(
    line_user_id: str,
    request: SendMessageRequest,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Send message to user via LINE"""
    if not request.text:
        raise HTTPException(status_code=400, detail="Message text is required")

    result = await live_chat_service.send_message(
        line_user_id, request.text, current_user.id, db
    )
    await db.commit()
    recent_messages = await live_chat_service.get_recent_messages(line_user_id, 1, db)
    if recent_messages:
        await _broadcast_conversation_update(
            line_user_id=line_user_id,
            db=db,
            message_payload=_message_payload_from_record(recent_messages[0], line_user_id),
        )
    return result

@router.post("/conversations/{line_user_id}/media")
async def send_media(
    line_user_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Upload and send media message to user via LINE."""
    content = await file.read()
    result = await live_chat_service.send_media_message(
        line_user_id=line_user_id,
        operator_id=current_user.id,
        file_bytes=content,
        file_name=file.filename or "attachment",
        content_type=file.content_type,
        db=db,
    )
    await db.commit()
    sent_message = result.get("message", {})
    created_at = sent_message.get("created_at") or datetime.utcnow().isoformat()

    room_id = ws_manager.get_room_id(line_user_id)
    await ws_manager.broadcast_to_room(room_id, {
        "type": WSEventType.NEW_MESSAGE.value,
        "payload": sent_message,
        "timestamp": datetime.utcnow().isoformat(),
    })

    detail = await live_chat_service.get_conversation_detail(line_user_id, db)
    display_name = detail["display_name"] if detail else "LINE User"
    picture_url = detail["picture_url"] if detail else None
    chat_mode = detail["chat_mode"].value if detail and hasattr(detail["chat_mode"], "value") else (detail["chat_mode"] if detail else "BOT")

    try:
        read_marker = datetime.fromisoformat(created_at) if isinstance(created_at, str) else datetime.utcnow()
    except ValueError:
        read_marker = datetime.utcnow()

    for admin_id in ws_manager.get_connected_admin_ids():
        if await ws_manager.is_admin_in_room_global(admin_id, room_id):
            await ws_manager.mark_conversation_read(
                admin_id,
                line_user_id,
                read_marker,
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
                "display_name": display_name or "LINE User",
                "picture_url": picture_url,
                "chat_mode": chat_mode,
                "last_message": {
                    "content": sent_message.get("content") or "[Media]",
                    "created_at": created_at,
                },
                "unread_count": unread_count,
            },
            "timestamp": datetime.utcnow().isoformat(),
        })

    return result

@router.post("/conversations/{line_user_id}/claim")
async def claim_conversation(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Operator claims the chat session"""
    session = await live_chat_service.claim_session(
        line_user_id, current_user.id, db
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")
    await db.commit()
    await ws_manager.broadcast_to_all({
        "type": WSEventType.SESSION_CLAIMED.value,
        "payload": {
            "line_user_id": line_user_id,
            "session_id": session.id,
            "status": session.status.value if hasattr(session.status, "value") else session.status,
            "operator_id": current_user.id,
        },
        "timestamp": datetime.utcnow().isoformat(),
    })
    await analytics_service.emit_live_kpis_update(db)
    return session

@router.post("/conversations/{line_user_id}/close")
async def close_conversation(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Close session and return to bot mode"""
    session = await live_chat_service.close_session(
        line_user_id, ClosedBy.OPERATOR, db, operator_id=current_user.id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")
    await db.commit()
    await ws_manager.broadcast_to_all({
        "type": WSEventType.SESSION_CLOSED.value,
        "payload": {
            "line_user_id": line_user_id,
            "session_id": session.id,
        },
        "timestamp": datetime.utcnow().isoformat(),
    })
    await analytics_service.emit_live_kpis_update(db)
    return session

@router.post("/conversations/{line_user_id}/transfer")
async def transfer_conversation(
    line_user_id: str,
    request: TransferSessionPayload,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Transfer an active session to another operator."""
    try:
        session = await live_chat_service.transfer_session(
            line_user_id=line_user_id,
            from_operator_id=current_user.id,
            to_operator_id=request.to_operator_id,
            reason=request.reason,
            db=db,
        )
    except ValueError as e:
        detail = str(e)
        if "No active session found" in detail:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
        if "Only the current operator" in detail:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")

    await db.commit()
    await ws_manager.broadcast_to_all({
        "type": WSEventType.SESSION_TRANSFERRED.value,
        "payload": {
            "line_user_id": line_user_id,
            "session_id": session.id,
            "from_operator_id": current_user.id,
            "to_operator_id": request.to_operator_id,
            "reason": request.reason,
        },
        "timestamp": datetime.utcnow().isoformat(),
    })

    try:
        await analytics_service.emit_live_kpis_update(db)
    except Exception as e:
        logger.warning("KPI broadcast failed (non-fatal): %s", e)

    return {
        "success": True,
        "line_user_id": line_user_id,
        "session_id": session.id,
        "from_operator_id": current_user.id,
        "to_operator_id": request.to_operator_id,
        "reason": request.reason,
    }

@router.post("/conversations/{line_user_id}/mode")
async def toggle_mode(
    line_user_id: str,
    request: ModeToggleRequest,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Toggle chat mode: BOT | HUMAN"""
    success = await live_chat_service.set_chat_mode(
        line_user_id, request.mode, db
    )
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    await db.commit()
    return {"success": True, "mode": request.mode}

@router.post("/conversations/{line_user_id}/refresh-profile")
async def refresh_profile(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Manually refresh LINE profile for a conversation user."""
    user = await friend_service.refresh_profile(
        line_user_id=line_user_id,
        db=db,
        force=True,
        stale_after_hours=24,
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "success": True,
        "line_user_id": line_user_id,
        "display_name": user.display_name,
        "picture_url": user.picture_url,
        "profile_updated_at": user.profile_updated_at.isoformat() if user.profile_updated_at else None,
    }

@router.get("/analytics")
async def get_analytics(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    operator_id: Optional[int] = None,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(deps.get_current_admin),
) -> Any:
    """Get chat analytics dashboard data"""
    return await live_chat_service.get_analytics(
        from_date, to_date, operator_id, db
    )

@router.get("/analytics/operators")
async def get_operator_stats(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(deps.get_current_admin),
) -> Any:
    """Get per-operator performance metrics"""
    return await live_chat_service.get_operator_analytics(
        from_date, to_date, db
    )

@router.get("/messages/search")
async def search_messages(
    q: str,
    line_user_id: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(deps.get_current_staff),
) -> Any:
    """Search message text across conversations or within a specific conversation."""
    return {
        "items": await live_chat_service.search_messages(
            query=q,
            line_user_id=line_user_id,
            limit=limit,
            db=db,
        )
    }
