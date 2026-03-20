from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from typing import Optional
from datetime import datetime, timezone
import logging

from jose import jwt, JWTError, ExpiredSignatureError
from pydantic import ValidationError
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.core.websocket_manager import ws_manager
from app.core.rate_limiter import ws_rate_limiter
from app.core.websocket_health import ws_health_monitor
from app.services.live_chat_service import live_chat_service
from app.services.analytics_service import analytics_service
from app.schemas.ws_events import (
    WSEventType,
    WSErrorCode,
    AuthPayload,
    SendMessagePayload,
    JoinRoomPayload,
    TransferSessionPayload
)
from app.models.chat_session import ClosedBy
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)
router = APIRouter()


async def authenticate_ws_user(websocket: WebSocket, token: Optional[str]) -> Optional[str]:
    """Authenticate a WebSocket connection and return the authenticated admin_id."""
    if not token:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.AUTH_ERROR.value,
            "payload": {
                "message": "Access token required.",
                "code": WSErrorCode.AUTH_MISSING_TOKEN.value
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return None

    try:
        payload_data = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        token_type = payload_data.get("type")
        if token_type != "access":
            raise JWTError("Invalid token type")

        user_id = payload_data.get("sub")
        if user_id is None:
            raise JWTError("Missing 'sub' claim in token")

        try:
            user_id_int = int(user_id)
        except (TypeError, ValueError) as exc:
            raise JWTError("Invalid subject claim") from exc

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id_int))
            user = result.scalar_one_or_none()

        if not user or not getattr(user, "is_active", True):
            raise JWTError("User not found")

        if user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT}:
            raise JWTError("Insufficient permissions")

        logger.info(f"WebSocket auth successful for admin {user.id}")
        return str(user.id)

    except ExpiredSignatureError:
        logger.warning("WebSocket auth failed: Token expired")
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.AUTH_ERROR.value,
            "payload": {
                "message": "Token expired. Please refresh and reconnect.",
                "code": WSErrorCode.AUTH_EXPIRED_TOKEN.value
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return None

    except JWTError as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.AUTH_ERROR.value,
            "payload": {
                "message": "Invalid token or insufficient permissions",
                "code": WSErrorCode.AUTH_INVALID_TOKEN.value
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return None


async def handle_auth(websocket: WebSocket, payload: dict, query_token: Optional[str] = None) -> Optional[str]:
    """
    Authenticate WebSocket connection using an access token.

    Token can be provided via:
    1. Auth message payload: {"token": "<jwt>"}
    2. Query parameter: ?token=<jwt>
    """
    # Get token from payload or fallback to query param
    try:
        auth_data = AuthPayload(**payload) if payload.get('token') else None
        token = auth_data.token if auth_data else query_token
    except ValidationError as e:
        logger.warning(f"Auth payload validation failed: {e}")
        token = query_token  # Fallback to query param

    return await authenticate_ws_user(websocket, token)


@router.websocket("/ws/live-chat")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for live chat real-time communication.

    Connect: ws://host/api/v1/ws/live-chat?token=<jwt>

    Flow:
    1. Client connects
    2. Server accepts
    3. Client sends 'auth' message
    4. Server validates and sends 'auth_success' + 'presence_update'
    5. Client can join rooms, send messages, etc.

    Events (Client → Server):
      - auth: {"type": "auth", "payload": {"token": "<jwt access token>"}}
      - join_room: {"type": "join_room", "payload": {"line_user_id": "U123"}}
      - leave_room: {"type": "leave_room"}
      - send_message: {"type": "send_message", "payload": {"text": "Hello"}}
      - typing_start: {"type": "typing_start", "payload": {"line_user_id": "U123"}}
      - typing_stop: {"type": "typing_stop", "payload": {"line_user_id": "U123"}}
      - claim_session: {"type": "claim_session"}
      - close_session: {"type": "close_session"}
      - ping: {"type": "ping"}
    """
    import time
    connection_id = await ws_manager.connect(websocket)
    admin_id: Optional[str] = None
    current_room: Optional[str] = None
    message_start_time: Optional[float] = None

    try:
        while True:
            message_start_time = time.time()
            data = await websocket.receive_json()
            msg_type = data.get("type")
            payload = data.get("payload", {})
            timestamp = datetime.now(timezone.utc).isoformat()

            # Track received message
            ws_health_monitor.record_message_received()

            # === AUTH (must be first) ===
            if msg_type == WSEventType.AUTH.value:
                admin_id = await handle_auth(websocket, payload, token)  # Pass query token
                if admin_id:
                    await ws_manager.register(websocket, admin_id)
                    ws_health_monitor.record_connection(admin_id)
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.AUTH_SUCCESS.value,
                        "payload": {"admin_id": admin_id},
                        "timestamp": timestamp
                    })
                    # Send presence update
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.PRESENCE_UPDATE.value,
                        "payload": {"operators": await ws_manager.get_online_admins()},
                        "timestamp": timestamp
                    })
                else:
                    ws_health_monitor.record_error("auth_failed")
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.AUTH_ERROR.value,
                        "payload": {"message": "Invalid credentials"},
                        "timestamp": timestamp
                    })
                    break
                continue

            # Require auth for all other operations
            if not admin_id:
                await ws_manager.send_personal(websocket, {
                    "type": WSEventType.ERROR.value,
                    "payload": {
                        "message": "Not authenticated. Send 'auth' first.",
                        "code": WSErrorCode.NOT_AUTHENTICATED.value
                    },
                    "timestamp": timestamp
                })
                continue

            # Validate admin_id is valid integer (needed for DB operations)
            try:
                admin_id_int = int(admin_id)
            except (ValueError, TypeError):
                await ws_manager.send_personal(websocket, {
                    "type": WSEventType.ERROR.value,
                    "payload": {
                        "message": "Invalid admin ID format",
                        "code": WSErrorCode.INVALID_REQUEST.value
                    },
                    "timestamp": timestamp
                })
                continue

            # Rate limiting check for all messages (except ping)
            if msg_type != WSEventType.PING.value:
                if not ws_rate_limiter.is_allowed(admin_id):
                    remaining = ws_rate_limiter.get_remaining(admin_id)
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": f"Rate limit exceeded. Try again in {settings.WS_RATE_LIMIT_WINDOW} seconds.",
                            "code": WSErrorCode.RATE_LIMIT_EXCEEDED.value,
                            "remaining": remaining
                        },
                        "timestamp": timestamp
                    })
                    continue

            # === PING/PONG ===
            if msg_type == WSEventType.PING.value:
                await ws_manager.touch_presence(admin_id)
                await ws_manager.send_personal(websocket, {
                    "type": WSEventType.PONG.value,
                    "payload": {"server_time": timestamp},
                    "timestamp": timestamp
                })
                continue

            # === JOIN ROOM ===
            if msg_type == WSEventType.JOIN_ROOM.value:
                try:
                    room_payload = JoinRoomPayload(**payload)
                    line_user_id = room_payload.line_user_id
                except ValidationError as e:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": "Invalid line_user_id format",
                            "code": WSErrorCode.VALIDATION_ERROR.value
                        },
                        "timestamp": timestamp
                    })
                    continue

                # Leave previous room
                if current_room:
                    await ws_manager.leave_room(websocket, current_room)

                room_id = ws_manager.get_room_id(line_user_id)
                await ws_manager.join_room(websocket, room_id)
                current_room = room_id
                await ws_manager.mark_conversation_read(admin_id, line_user_id)

                # Send conversation state
                async with AsyncSessionLocal() as db:
                    detail = await live_chat_service.get_conversation_detail(line_user_id, db)
                    if detail:
                        await ws_manager.send_personal(websocket, {
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
                continue

            # === LEAVE ROOM ===
            if msg_type == WSEventType.LEAVE_ROOM.value:
                if current_room:
                    await ws_manager.leave_room(websocket, current_room)
                    current_room = None
                continue

            # === ANALYTICS SUBSCRIBE ===
            if msg_type == WSEventType.SUBSCRIBE_ANALYTICS.value:
                await ws_manager.subscribe_analytics(websocket)
                async with AsyncSessionLocal() as db:
                    try:
                        await analytics_service.emit_live_kpis_update(db)
                    except Exception as e:
                        logger.warning("KPI broadcast failed (non-fatal): %s", e)
                continue

            if msg_type == WSEventType.UNSUBSCRIBE_ANALYTICS.value:
                await ws_manager.unsubscribe_analytics(websocket)
                continue

            # === SEND MESSAGE ===
            if msg_type == WSEventType.SEND_MESSAGE.value:
                if not current_room:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": "Join a room first",
                            "code": WSErrorCode.NOT_IN_ROOM.value
                        },
                        "timestamp": timestamp
                    })
                    continue

                # Validate and sanitize message
                try:
                    msg_payload = SendMessagePayload(**payload)
                    text = msg_payload.text
                    temp_id = msg_payload.temp_id
                except ValidationError as e:
                    error_msg = str(e.errors()[0]['msg']) if e.errors() else "Invalid message"
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": error_msg,
                            "code": WSErrorCode.VALIDATION_ERROR.value
                        },
                        "timestamp": timestamp
                    })
                    continue

                if not text:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {"message": "Message text required"},
                        "timestamp": timestamp
                    })
                    continue

                # Extract line_user_id from room_id
                line_user_id = current_room.replace("conversation:", "")

                async with AsyncSessionLocal() as db:
                    try:
                        await live_chat_service.send_message(
                            line_user_id, text, admin_id_int, db
                        )
                        await db.commit()
                        # Get the sent message
                        messages = await live_chat_service.get_recent_messages(line_user_id, 1, db)
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
                            # Confirm to sender
                            await ws_manager.send_personal(websocket, {
                                "type": WSEventType.MESSAGE_SENT.value,
                                "payload": msg_data,
                                "timestamp": timestamp
                            })
                            # Track message sent with latency
                            latency_ms = (time.time() - message_start_time) * 1000
                            ws_health_monitor.record_message_sent(latency_ms)
                            # Broadcast to room
                            await ws_manager.broadcast_to_room(current_room, {
                                "type": WSEventType.NEW_MESSAGE.value,
                                "payload": msg_data,
                                "timestamp": timestamp
                            }, exclude_websocket=websocket)
                    except HTTPException as e:
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": str(e.detail),
                                "code": WSErrorCode.VALIDATION_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                continue

            # === TYPING START ===
            if msg_type == WSEventType.TYPING_START.value:
                if current_room:
                    line_user_id = current_room.replace("conversation:", "")
                    await ws_manager.broadcast_to_room(current_room, {
                        "type": WSEventType.TYPING_INDICATOR.value,
                        "payload": {
                            "line_user_id": line_user_id,
                            "admin_id": admin_id,
                            "is_typing": True
                        },
                        "timestamp": timestamp
                    }, exclude_websocket=websocket)
                continue

            # === TYPING STOP ===
            if msg_type == WSEventType.TYPING_STOP.value:
                if current_room:
                    line_user_id = current_room.replace("conversation:", "")
                    await ws_manager.broadcast_to_room(current_room, {
                        "type": WSEventType.TYPING_INDICATOR.value,
                        "payload": {
                            "line_user_id": line_user_id,
                            "admin_id": admin_id,
                            "is_typing": False
                        },
                        "timestamp": timestamp
                    }, exclude_websocket=websocket)
                continue

            # === CLAIM SESSION ===
            if msg_type == WSEventType.CLAIM_SESSION.value:
                if not current_room:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": "Must join a conversation before claiming session",
                            "code": WSErrorCode.NOT_IN_ROOM.value
                        },
                        "timestamp": timestamp
                    })
                    continue
                line_user_id = current_room.replace("conversation:", "")
                async with AsyncSessionLocal() as db:
                    try:
                        session = await live_chat_service.claim_session(
                            line_user_id, admin_id_int, db
                        )
                        if session:
                            await db.commit()
                            await ws_manager.broadcast_to_all({
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
                                await analytics_service.emit_live_kpis_update(db)
                            except Exception as e:
                                logger.warning("KPI broadcast failed (non-fatal): %s", e)
                        else:
                            await ws_manager.send_personal(websocket, {
                                "type": WSEventType.ERROR.value,
                                "payload": {
                                    "message": "Session not found or already claimed",
                                    "code": WSErrorCode.SESSION_NOT_FOUND.value
                                },
                                "timestamp": timestamp
                            })
                    except HTTPException as e:
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": str(e.detail),
                                "code": WSErrorCode.VALIDATION_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                    except Exception as e:
                        logger.error(f"Error claiming session: {e}")
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": "Failed to claim session",
                                "code": WSErrorCode.INTERNAL_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                continue

            # === CLOSE SESSION ===
            if msg_type == WSEventType.CLOSE_SESSION.value:
                if not current_room:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": "Must join a conversation before closing session",
                            "code": WSErrorCode.NOT_IN_ROOM.value
                        },
                        "timestamp": timestamp
                    })
                    continue
                line_user_id = current_room.replace("conversation:", "")
                async with AsyncSessionLocal() as db:
                    try:
                        session = await live_chat_service.close_session(
                            line_user_id, ClosedBy.OPERATOR, db, operator_id=admin_id_int
                        )
                        if session:
                            await db.commit()
                            await ws_manager.broadcast_to_all({
                                "type": WSEventType.SESSION_CLOSED.value,
                                "payload": {
                                    "line_user_id": line_user_id,
                                    "session_id": session.id
                                },
                                "timestamp": timestamp
                            })
                            try:
                                await analytics_service.emit_live_kpis_update(db)
                            except Exception as e:
                                logger.warning("KPI broadcast failed (non-fatal): %s", e)
                        else:
                            await ws_manager.send_personal(websocket, {
                                "type": WSEventType.ERROR.value,
                                "payload": {
                                    "message": "Session not found or already closed",
                                    "code": WSErrorCode.SESSION_NOT_FOUND.value
                                },
                                "timestamp": timestamp
                            })
                    except HTTPException as e:
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": str(e.detail),
                                "code": WSErrorCode.VALIDATION_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                    except Exception as e:
                        logger.error(f"Error closing session: {e}")
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": "Failed to close session",
                                "code": WSErrorCode.INTERNAL_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                continue

            # === TRANSFER SESSION ===
            if msg_type == WSEventType.TRANSFER_SESSION.value:
                if not current_room:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": "Must join a conversation before transferring session",
                            "code": WSErrorCode.NOT_IN_ROOM.value
                        },
                        "timestamp": timestamp
                    })
                    continue
                line_user_id = current_room.replace("conversation:", "")
                try:
                    transfer_payload = TransferSessionPayload(**payload)
                except ValidationError as e:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.ERROR.value,
                        "payload": {
                            "message": "Invalid transfer payload: to_operator_id required",
                            "code": WSErrorCode.VALIDATION_ERROR.value
                        },
                        "timestamp": timestamp
                    })
                    continue
                async with AsyncSessionLocal() as db:
                    try:
                        session = await live_chat_service.transfer_session(
                            line_user_id=line_user_id,
                            from_operator_id=admin_id_int,
                            to_operator_id=transfer_payload.to_operator_id,
                            reason=transfer_payload.reason,
                            db=db
                        )
                        if session:
                            await db.commit()
                            await ws_manager.broadcast_to_all({
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
                                await analytics_service.emit_live_kpis_update(db)
                            except Exception as e:
                                logger.warning("KPI broadcast failed (non-fatal): %s", e)
                        else:
                            await ws_manager.send_personal(websocket, {
                                "type": WSEventType.ERROR.value,
                                "payload": {
                                    "message": "Session not found or not active",
                                    "code": WSErrorCode.SESSION_NOT_FOUND.value
                                },
                                "timestamp": timestamp
                            })
                    except ValueError as e:
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": str(e),
                                "code": WSErrorCode.VALIDATION_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                    except Exception as e:
                        logger.error(f"Error transferring session: {e}")
                        await ws_manager.send_personal(websocket, {
                            "type": WSEventType.ERROR.value,
                            "payload": {
                                "message": "Failed to transfer session",
                                "code": WSErrorCode.INTERNAL_ERROR.value
                            },
                            "timestamp": timestamp
                        })
                continue

            # Unknown message type
            await ws_manager.send_personal(websocket, {
                "type": WSEventType.ERROR.value,
                "payload": {"message": f"Unknown message type: {msg_type}"},
                "timestamp": timestamp
            })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for admin {admin_id}")
        if admin_id:
            ws_health_monitor.record_disconnection(admin_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_health_monitor.record_error("websocket_exception")
    finally:
        if admin_id:
            ws_rate_limiter.reset(admin_id)
        await ws_manager.disconnect(websocket)

