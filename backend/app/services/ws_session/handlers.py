"""Extracted message-type handlers for the WS live-chat endpoint.

Each handler owns one message type's business logic: validation, DB access,
service calls, broadcasts, and error frames. The endpoint dispatches here.
"""
import logging
import time
from datetime import datetime, timezone

from fastapi import HTTPException, WebSocket
from pydantic import ValidationError

from app.db.session import AsyncSessionLocal
from app.models.chat_session import ClosedBy
from app.schemas.ws_events import (
    WSEventType,
    WSErrorCode,
    SendMessagePayload,
    JoinRoomPayload,
    TransferSessionPayload,
)

from ._deps import (
    get_ws_manager,
    get_live_chat_service,
    get_analytics_service,
    get_ws_health_monitor,
    get_resolve_by_line_id,
    get_notify_admins_message_sent,
)
from .auth import send_message_failed

logger = logging.getLogger(__name__)


async def handle_join_room(
    websocket: WebSocket,
    admin_id: str,
    payload: dict,
    current_room: str | None,
    timestamp: str,
) -> str | None:
    """Join a conversation room. Returns new current_room, or None on validation failure."""
    ws = get_ws_manager()
    svc = get_live_chat_service()

    try:
        room_payload = JoinRoomPayload(**payload)
        line_user_id = room_payload.line_user_id
    except ValidationError:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {
                "message": "Invalid line_user_id format",
                "code": WSErrorCode.VALIDATION_ERROR.value
            },
            "timestamp": timestamp
        })
        return None

    if current_room:
        await ws.leave_room(websocket, current_room)

    room_id = ws.get_room_id(line_user_id)
    await ws.join_room(websocket, room_id)
    await ws.mark_conversation_read(admin_id, line_user_id)

    async with AsyncSessionLocal() as db:
        detail = await svc.get_conversation_detail(line_user_id, db)
        if detail:
            await ws.send_personal(websocket, {
                "type": WSEventType.CONVERSATION_UPDATE.value,
                "payload": {
                    "line_user_id": detail["line_user_id"],
                    "display_name": detail["display_name"],
                    "picture_url": detail["picture_url"],
                    "chat_mode": detail["chat_mode"].value if hasattr(detail["chat_mode"], 'value') else detail["chat_mode"],
                    "session": {
                        "id": detail["session"].id,
                        "status": detail["session"].status.value if hasattr(detail["session"].status, 'value') else detail["session"].status,
                        "operator_id": detail["session"].operator_id
                    } if detail["session"] else None,
                    "messages": [
                        {
                            "id": m.id,
                            "direction": m.direction.value if hasattr(m.direction, 'value') else m.direction,
                            "content": m.content,
                            "message_type": m.message_type,
                            "payload": m.payload,
                            "sender_role": m.sender_role.value if hasattr(m.sender_role, 'value') else m.sender_role,
                            "operator_name": m.operator_name,
                            "created_at": m.created_at.isoformat()
                        } for m in detail["messages"]
                    ]
                },
                "timestamp": timestamp
            })

    return room_id


async def handle_send_message(
    websocket: WebSocket,
    admin_id_int: int,
    payload: dict,
    current_room: str | None,
    timestamp: str,
    message_start_time: float,
) -> None:
    """Validate, persist, confirm, broadcast, and notify sidebar for a sent message."""
    ws = get_ws_manager()
    svc = get_live_chat_service()
    health = get_ws_health_monitor()

    if not current_room:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {
                "message": "Join a room first",
                "code": WSErrorCode.NOT_IN_ROOM.value
            },
            "timestamp": timestamp
        })
        return

    temp_id = payload.get("temp_id") if isinstance(payload, dict) else None
    try:
        msg_payload = SendMessagePayload(**payload)
        text = msg_payload.text
        temp_id = msg_payload.temp_id
    except ValidationError as e:
        error_msg = str(e.errors()[0]['msg']) if e.errors() else "Invalid message"
        await send_message_failed(
            websocket,
            temp_id if isinstance(temp_id, str) else None,
            error_msg,
            timestamp,
        )
        return

    if not text:
        await send_message_failed(websocket, temp_id, "Message text required", timestamp)
        return

    line_user_id = current_room.replace("conversation:", "")

    async with AsyncSessionLocal() as db:
        committed = False
        try:
            await svc.send_message(line_user_id, text, admin_id_int, db)
            await db.commit()
            committed = True
            messages = await svc.get_recent_messages(line_user_id, 1, db)
            if messages:
                msg = messages[0]
                msg_data = {
                    "id": msg.id,
                    "line_user_id": line_user_id,
                    "direction": msg.direction.value if hasattr(msg.direction, 'value') else msg.direction,
                    "content": msg.content,
                    "message_type": msg.message_type,
                    "payload": msg.payload,
                    "sender_role": msg.sender_role.value if hasattr(msg.sender_role, 'value') else msg.sender_role,
                    "operator_name": msg.operator_name,
                    "created_at": msg.created_at.isoformat(),
                    "temp_id": temp_id
                }
                await ws.send_personal(websocket, {
                    "type": WSEventType.MESSAGE_SENT.value,
                    "payload": msg_data,
                    "timestamp": timestamp
                })
                latency_ms = (time.time() - message_start_time) * 1000
                health.record_message_sent(latency_ms)
                await ws.broadcast_to_room(current_room, {
                    "type": WSEventType.NEW_MESSAGE.value,
                    "payload": msg_data,
                    "timestamp": timestamp
                }, exclude_websocket=websocket)
                try:
                    resolve_by_line_id = get_resolve_by_line_id()
                    notify = get_notify_admins_message_sent()
                    chat_user = await resolve_by_line_id(db, line_user_id)
                    await notify(
                        line_user_id=line_user_id,
                        display_name=(chat_user.display_name if chat_user else None) or "LINE User",
                        picture_url=chat_user.picture_url if chat_user else None,
                        chat_mode=chat_user.chat_mode.value if chat_user and chat_user.chat_mode else "BOT",
                        content=msg_data.get("content") or "[Message]",
                        created_at=msg_data["created_at"],
                        db=db,
                    )
                except Exception as e:
                    logger.warning("Post-send sidebar broadcast failed (non-fatal): %s", e)
        except HTTPException as e:
            await send_message_failed(websocket, temp_id, str(e.detail), timestamp)
        except Exception as e:
            logger.error("Error sending live-chat message: %s", e)
            if committed:
                await send_message_failed(
                    websocket, temp_id,
                    "Message sent but confirmation failed — refresh instead of resending",
                    timestamp, retryable=False,
                )
            else:
                await send_message_failed(
                    websocket, temp_id, "Failed to send message", timestamp, retryable=True,
                )


async def handle_claim_session(
    websocket: WebSocket,
    admin_id_int: int,
    current_room: str | None,
    timestamp: str,
) -> None:
    """Claim the active session for the current conversation."""
    ws = get_ws_manager()
    svc = get_live_chat_service()
    analytics = get_analytics_service()

    if not current_room:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {
                "message": "Must join a conversation before claiming session",
                "code": WSErrorCode.NOT_IN_ROOM.value
            },
            "timestamp": timestamp
        })
        return

    line_user_id = current_room.replace("conversation:", "")
    async with AsyncSessionLocal() as db:
        try:
            session = await svc.claim_session(line_user_id, admin_id_int, db)
            if session:
                await db.commit()
                await ws.broadcast_to_all({
                    "type": WSEventType.SESSION_CLAIMED.value,
                    "payload": {
                        "line_user_id": line_user_id,
                        "session_id": session.id,
                        "status": session.status.value,
                        "operator_id": admin_id_int
                    },
                    "timestamp": timestamp
                })
                try:
                    await analytics.emit_live_kpis_update(db)
                except Exception as e:
                    logger.warning("KPI broadcast failed (non-fatal): %s", e)
            else:
                await ws.send_personal(websocket, {
                    "type": WSEventType.ERROR.value,
                    "payload": {
                        "message": "Session not found or already claimed",
                        "code": WSErrorCode.SESSION_NOT_FOUND.value
                    },
                    "timestamp": timestamp
                })
        except HTTPException as e:
            await ws.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {
                    "message": str(e.detail),
                    "code": WSErrorCode.VALIDATION_ERROR.value
                },
                "timestamp": timestamp
            })
        except Exception as e:
            logger.error(f"Error claiming session: {e}")
            await ws.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {
                    "message": "Failed to claim session",
                    "code": WSErrorCode.INTERNAL_ERROR.value
                },
                "timestamp": timestamp
            })


async def handle_close_session(
    websocket: WebSocket,
    admin_id_int: int,
    current_room: str | None,
    timestamp: str,
) -> None:
    """Close the active session for the current conversation."""
    ws = get_ws_manager()
    svc = get_live_chat_service()
    analytics = get_analytics_service()

    if not current_room:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {
                "message": "Must join a conversation before closing session",
                "code": WSErrorCode.NOT_IN_ROOM.value
            },
            "timestamp": timestamp
        })
        return

    line_user_id = current_room.replace("conversation:", "")
    async with AsyncSessionLocal() as db:
        try:
            session = await svc.close_session(
                line_user_id, ClosedBy.OPERATOR, db, operator_id=admin_id_int
            )
            if session:
                await db.commit()
                await ws.broadcast_to_all({
                    "type": WSEventType.SESSION_CLOSED.value,
                    "payload": {
                        "line_user_id": line_user_id,
                        "session_id": session.id
                    },
                    "timestamp": timestamp
                })
                try:
                    await analytics.emit_live_kpis_update(db)
                except Exception as e:
                    logger.warning("KPI broadcast failed (non-fatal): %s", e)
            else:
                await ws.send_personal(websocket, {
                    "type": WSEventType.ERROR.value,
                    "payload": {
                        "message": "Session not found or already closed",
                        "code": WSErrorCode.SESSION_NOT_FOUND.value
                    },
                    "timestamp": timestamp
                })
        except HTTPException as e:
            await ws.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {
                    "message": str(e.detail),
                    "code": WSErrorCode.VALIDATION_ERROR.value
                },
                "timestamp": timestamp
            })
        except Exception as e:
            logger.error(f"Error closing session: {e}")
            await ws.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {
                    "message": "Failed to close session",
                    "code": WSErrorCode.INTERNAL_ERROR.value
                },
                "timestamp": timestamp
            })


async def handle_transfer_session(
    websocket: WebSocket,
    admin_id_int: int,
    payload: dict,
    current_room: str | None,
    timestamp: str,
) -> None:
    """Transfer the active session to another operator."""
    ws = get_ws_manager()
    svc = get_live_chat_service()
    analytics = get_analytics_service()

    if not current_room:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {
                "message": "Must join a conversation before transferring session",
                "code": WSErrorCode.NOT_IN_ROOM.value
            },
            "timestamp": timestamp
        })
        return

    line_user_id = current_room.replace("conversation:", "")
    try:
        transfer_payload = TransferSessionPayload(**payload)
    except ValidationError:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {
                "message": "Invalid transfer payload: to_operator_id required",
                "code": WSErrorCode.VALIDATION_ERROR.value
            },
            "timestamp": timestamp
        })
        return

    async with AsyncSessionLocal() as db:
        try:
            session = await svc.transfer_session(
                line_user_id=line_user_id,
                from_operator_id=admin_id_int,
                to_operator_id=transfer_payload.to_operator_id,
                reason=transfer_payload.reason,
                db=db
            )
            if session:
                await db.commit()
                await ws.broadcast_to_all({
                    "type": WSEventType.SESSION_TRANSFERRED.value,
                    "payload": {
                        "line_user_id": line_user_id,
                        "session_id": session.id,
                        "from_operator_id": admin_id_int,
                        "to_operator_id": transfer_payload.to_operator_id,
                        "reason": transfer_payload.reason
                    },
                    "timestamp": timestamp
                })
                try:
                    await analytics.emit_live_kpis_update(db)
                except Exception as e:
                    logger.warning("KPI broadcast failed (non-fatal): %s", e)
            else:
                await ws.send_personal(websocket, {
                    "type": WSEventType.ERROR.value,
                    "payload": {
                        "message": "Session not found or not active",
                        "code": WSErrorCode.SESSION_NOT_FOUND.value
                    },
                    "timestamp": timestamp
                })
        except ValueError as e:
            await ws.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {
                    "message": str(e),
                    "code": WSErrorCode.VALIDATION_ERROR.value
                },
                "timestamp": timestamp
            })
        except Exception as e:
            logger.error(f"Error transferring session: {e}")
            await ws.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {
                    "message": "Failed to transfer session",
                    "code": WSErrorCode.INTERNAL_ERROR.value
                },
                "timestamp": timestamp
            })
