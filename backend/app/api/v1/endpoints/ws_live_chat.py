from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
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
from app.services.auth_session_service import claim_ws_ticket


def log_ws_event(admin_id, event):
    """Best-effort structured logging for WS auth events."""
    logger.info("WS event for admin %s: %s", admin_id, event)


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


async def _load_and_authorize_ws_user(user_id: int) -> Optional[User]:
    """Shared user-load + role-check for both WS auth paths (JWT and ticket).

    Extracted so `authenticate_ws_ticket` doesn't duplicate the lookup/role
    logic that previously lived inline in `authenticate_ws_user` (P1.1a Task
    8 note: mirror lines 64-75, don't copy-paste them)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if not user or not getattr(user, "is_active", True):
        return None

    if user.role not in {UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT}:
        return None

    return user


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

        user = await _load_and_authorize_ws_user(user_id_int)
        if user is None:
            raise JWTError("User not found or insufficient permissions")

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


async def authenticate_ws_ticket(websocket: WebSocket, ticket: str) -> Optional[str]:
    """Authenticate a WebSocket connection using a single-use ws-ticket
    (P1.1a FR6). Tickets are minted via `POST /auth/ws-ticket` and consumed
    atomically -- claiming the same ticket twice always fails the second
    time, regardless of whether authorization then succeeds or fails."""
    async with AsyncSessionLocal() as db:
        user_id = await claim_ws_ticket(db, ticket)
        # Single-use depends on the `used_at` write persisting even if the
        # subsequent role check below fails.
        await db.commit()

    if user_id is None:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.AUTH_ERROR.value,
            "payload": {
                "message": "Invalid or expired ticket.",
                "code": WSErrorCode.AUTH_INVALID_TOKEN.value
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return None

    user = await _load_and_authorize_ws_user(user_id)
    if user is None:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.AUTH_ERROR.value,
            "payload": {
                "message": "Invalid token or insufficient permissions",
                "code": WSErrorCode.AUTH_INVALID_TOKEN.value
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return None

    logger.info(f"WebSocket auth successful for admin {user.id} (ticket)")
    return str(user.id)


async def handle_auth(websocket: WebSocket, payload: dict) -> Optional[str]:
    """
    Authenticate WebSocket connection using an access token OR a single-use
    ws-ticket (P1.1a FR6).

    Token path (unchanged, stays available until PR 2C):
        {"type": "auth", "payload": {"token": "<jwt access token>"}}
    Ticket path (minted via `POST /auth/ws-ticket`):
        {"type": "auth", "payload": {"ticket": "<raw ticket>"}}

    Tickets can also arrive via `?ticket=<raw>` URL query param (cross-origin
    handshake). The endpoint consumes the query ticket before the first frame.
    """
    has_credential = bool(payload.get('token') or payload.get('ticket'))
    try:
        auth_data = AuthPayload(**payload) if has_credential else None
    except ValidationError as e:
        # NEW-1 (round-2 review): log only the error type + field location, never
        # the raw exception -- Pydantic V2's ValidationError.__str__ renders the
        # failing `input_value=...`, which would write a submitted (malformed/
        # oversized) token/ticket fragment into the warning log. The `loc`/`type`
        # pair is enough to diagnose a bad payload without leaking a credential.
        redacted = [
            {"loc": ".".join(str(p) for p in err["loc"]), "type": err["type"]}
            for err in e.errors()
        ]
        logger.warning(f"Auth payload validation failed: {redacted}")
        auth_data = None

    if auth_data is not None and auth_data.ticket:
        return await authenticate_ws_ticket(websocket, auth_data.ticket)

    token = auth_data.token if auth_data else None
    return await authenticate_ws_user(websocket, token)


async def send_message_failed(
    websocket: WebSocket,
    temp_id: Optional[str],
    error: str,
    timestamp: str,
    retryable: bool = False,
) -> None:
    """Notify the sender that an optimistic message failed."""
    if not temp_id:
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": error},
            "timestamp": timestamp,
        })
        return

    await ws_manager.send_personal(websocket, {
        "type": WSEventType.MESSAGE_FAILED.value,
        "payload": {
            "temp_id": temp_id,
            "error": error,
            "retryable": retryable,
        },
        "timestamp": timestamp,
    })


@router.websocket("/ws/live-chat")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for live chat real-time communication.

    Connect: ws://host/api/v1/ws/live-chat
    (send {"type": "auth", "payload": {"token": "<jwt>"}} as the first message;
     the token is NOT accepted as a URL query parameter)

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

    # Origin validation (P1.1a FR6), BEFORE accept: when the Origin header is
    # present and BACKEND_CORS_ORIGINS is non-empty, reject handshakes from
    # origins outside that allowlist. `websocket.close()` before `accept()`
    # rejects the handshake at the HTTP level (403) rather than accepting
    # then immediately disconnecting. Absent Origin (non-browser clients,
    # server-to-server, tests) or an empty allowlist both pass -- there is
    # nothing to compare against, and rejecting would break every existing
    # test/tool that doesn't set an Origin header.
    origin = websocket.headers.get("origin")
    allowed_origins = {str(o).rstrip("/") for o in settings.BACKEND_CORS_ORIGINS}
    if origin and allowed_origins and origin.rstrip("/") not in allowed_origins:
        await websocket.close(code=1008)  # policy violation
        return

    connection_id = await ws_manager.connect(websocket)
    admin_id: Optional[str] = None
    current_room: Optional[str] = None
    message_start_time: Optional[float] = None

    # CROSS-ORIGIN: ticket from URL query param (bypasses SameSite=Lax).
    # authenticate_ws_ticket() manages its own DB session internally.
    if ticket:
        try:
            admin_id = await authenticate_ws_ticket(websocket, ticket)
        except Exception:
            logger.exception("ws query-ticket auth failed")
            await websocket.close(code=1008)
            return
        if not admin_id:
            await websocket.close(code=1008)
            return
        log_ws_event(admin_id, "ws_via_query_ticket")
        await ws_manager.register(websocket, admin_id)
        ws_health_monitor.record_connection(admin_id)
        _ts = datetime.now(timezone.utc).isoformat()
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.AUTH_SUCCESS.value,
            "payload": {"admin_id": admin_id},
            "timestamp": _ts
        })
        await ws_manager.send_personal(websocket, {
            "type": WSEventType.PRESENCE_UPDATE.value,
            "payload": {"operators": await ws_manager.get_online_admins()},
            "timestamp": _ts
        })
        await ws_manager.broadcast_presence(exclude_admin=admin_id)

    try:
        while True:
            message_start_time = time.time()
            data = await websocket.receive_json()
            msg_type = data.get("type")
            payload = data.get("payload", {})
            timestamp = datetime.now(timezone.utc).isoformat()

            # Track received message
            ws_health_monitor.record_message_received()

            # AUTH must be the first frame for same-origin clients.
            # Cross-origin clients already authed via ?ticket=; treat a
            # repeat auth frame as idempotent.
            if msg_type == WSEventType.AUTH.value:
                if admin_id:
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.AUTH_SUCCESS.value,
                        "payload": {"admin_id": admin_id},
                        "timestamp": timestamp
                    })
                    continue
                admin_id = await handle_auth(websocket, payload)
                if admin_id:
                    await ws_manager.register(websocket, admin_id)
                    ws_health_monitor.record_connection(admin_id)
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.AUTH_SUCCESS.value,
                        "payload": {"admin_id": admin_id},
                        "timestamp": timestamp
                    })
                    # Send presence update to the newly-authenticated client
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.PRESENCE_UPDATE.value,
                        "payload": {"operators": await ws_manager.get_online_admins()},
                        "timestamp": timestamp
                    })
                    # Broadcast updated roster so OTHER operators see this one
                    # come online. Exclude the registrant: it already received
                    # the full roster via the send_personal presence push above,
                    # so broadcasting to it too would deliver a duplicate
                    # presence_update ahead of its next request.
                    await ws_manager.broadcast_presence(exclude_admin=admin_id)
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
                    continue

                if not text:
                    await send_message_failed(
                        websocket,
                        temp_id,
                        "Message text required",
                        timestamp,
                    )
                    continue

                # Extract line_user_id from room_id
                line_user_id = current_room.replace("conversation:", "")

                async with AsyncSessionLocal() as db:
                    committed = False
                    try:
                        await live_chat_service.send_message(
                            line_user_id, text, admin_id_int, db
                        )
                        await db.commit()
                        committed = True
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
                        await send_message_failed(
                            websocket,
                            temp_id,
                            str(e.detail),
                            timestamp,
                        )
                    except Exception as e:
                        logger.error("Error sending live-chat message: %s", e)
                        if committed:
                            # The message already reached LINE and the DB —
                            # only the confirm/broadcast step failed. Claiming
                            # a retryable failure here would invite the
                            # operator to send the customer a duplicate.
                            await send_message_failed(
                                websocket,
                                temp_id,
                                "Message sent but confirmation failed — refresh instead of resending",
                                timestamp,
                                retryable=False,
                            )
                        else:
                            await send_message_failed(
                                websocket,
                                temp_id,
                                "Failed to send message",
                                timestamp,
                                retryable=True,
                            )
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
        # Broadcast updated roster AFTER cleanup so the list reflects the new
        # state (the just-disconnected operator is excluded). Only when this
        # connection was authenticated.
        if admin_id:
            await ws_manager.broadcast_presence()
