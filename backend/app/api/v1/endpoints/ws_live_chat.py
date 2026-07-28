from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from typing import Optional
from datetime import datetime, timezone
import logging
import time

from app.core.config import settings
from app.core.websocket_manager import ws_manager
from app.core.rate_limiter import ws_rate_limiter
from app.core.websocket_health import ws_health_monitor
from app.db.session import AsyncSessionLocal
from app.services.analytics_service import analytics_service
from app.services.ws_session import (
    handle_auth,
    authenticate_ws_ticket,
    log_ws_event,
    handle_send_message,
    handle_join_room,
    handle_claim_session,
    handle_close_session,
    handle_transfer_session,
)
from app.schemas.ws_events import WSEventType, WSErrorCode

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/live-chat")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for live chat real-time communication.

    Connect: ws://host/api/v1/ws/live-chat
    (send {"type": "auth", "payload": {"token": "<jwt>"}} as the first message;
     cross-origin clients use ?ticket=<raw> query param)

    Flow:
    1. Client connects
    2. Server accepts
    3. Client sends 'auth' message (or uses query ticket)
    4. Server validates and sends 'auth_success' + 'presence_update'
    5. Client can join rooms, send messages, etc.
    """
    # Origin validation (P1.1a FR6), BEFORE accept
    origin = websocket.headers.get("origin")
    allowed_origins = {str(o).rstrip("/") for o in settings.BACKEND_CORS_ORIGINS}
    if origin and allowed_origins and origin.rstrip("/") not in allowed_origins:
        await websocket.close(code=1008)
        return

    connection_id = await ws_manager.connect(websocket)
    admin_id: Optional[str] = None
    current_room: Optional[str] = None
    message_start_time: Optional[float] = None

    # CROSS-ORIGIN: ticket from URL query param (bypasses SameSite=Lax).
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

            ws_health_monitor.record_message_received()

            # AUTH — mutates admin_id (connection identity), stays inline
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
                    await ws_manager.send_personal(websocket, {
                        "type": WSEventType.PRESENCE_UPDATE.value,
                        "payload": {"operators": await ws_manager.get_online_admins()},
                        "timestamp": timestamp
                    })
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

            # Rate limiting (except ping)
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
                new_room = await handle_join_room(
                    websocket, admin_id, payload, current_room, timestamp
                )
                if new_room is not None:
                    current_room = new_room
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
                await handle_send_message(
                    websocket, admin_id_int, payload, current_room,
                    timestamp, message_start_time,
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
                await handle_claim_session(
                    websocket, admin_id_int, current_room, timestamp
                )
                continue

            # === CLOSE SESSION ===
            if msg_type == WSEventType.CLOSE_SESSION.value:
                await handle_close_session(
                    websocket, admin_id_int, current_room, timestamp
                )
                continue

            # === TRANSFER SESSION ===
            if msg_type == WSEventType.TRANSFER_SESSION.value:
                await handle_transfer_session(
                    websocket, admin_id_int, payload, current_room, timestamp
                )
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
        if admin_id:
            await ws_manager.broadcast_presence()
