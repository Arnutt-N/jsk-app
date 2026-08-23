"""WebSocket authentication and error-frame helpers.

Extracted from ws_live_chat.py endpoint — owns JWT auth, ticket auth,
RBAC permission check, and the send_message_failed error helper.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket
from jose import jwt, JWTError, ExpiredSignatureError
from pydantic import ValidationError
from sqlalchemy import select

from app.core.config import settings
from app.core.permissions import can, KEY_ACCESS_LIVE_CHAT
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.schemas.ws_events import WSEventType, WSErrorCode, AuthPayload
from app.services.auth_session_service import claim_ws_ticket

from ._deps import get_ws_manager

logger = logging.getLogger(__name__)


def log_ws_event(admin_id, event):
    """Best-effort structured logging for WS auth events."""
    logger.info("WS event for admin %s: %s", admin_id, event)


async def send_ws_error(
    websocket: WebSocket,
    message: str,
    code: WSErrorCode,
    timestamp: str,
    event_type: WSEventType = WSEventType.ERROR,
) -> None:
    """Send the standard error frame: {type, payload: {message, code}, timestamp}."""
    ws = get_ws_manager()
    await ws.send_personal(websocket, {
        "type": event_type.value,
        "payload": {
            "message": message,
            "code": code.value
        },
        "timestamp": timestamp
    })


async def _load_and_authorize_ws_user(user_id: int) -> Optional[User]:
    """Shared user-load + role-check for both WS auth paths (JWT and ticket).

    NEW-3: the role check is DB-configurable via KEY_ACCESS_LIVE_CHAT.
    This is the WS gate; the HTTP gate (deps.py:get_current_staff) is
    permissive — two-gate design, do NOT tighten get_current_staff.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if not user or not getattr(user, "is_active", True):
        return None

    if not can(user.role, KEY_ACCESS_LIVE_CHAT):
        return None

    return user


async def authenticate_ws_user(websocket: WebSocket, token: Optional[str]) -> Optional[str]:
    """Authenticate a WebSocket connection and return the authenticated admin_id."""
    if not token:
        await send_ws_error(
            websocket, "Access token required.", WSErrorCode.AUTH_MISSING_TOKEN,
            datetime.now(timezone.utc).isoformat(), WSEventType.AUTH_ERROR,
        )
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
        await send_ws_error(
            websocket, "Token expired. Please refresh and reconnect.", WSErrorCode.AUTH_EXPIRED_TOKEN,
            datetime.now(timezone.utc).isoformat(), WSEventType.AUTH_ERROR,
        )
        return None

    except JWTError as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await send_ws_error(
            websocket, "Invalid token or insufficient permissions", WSErrorCode.AUTH_INVALID_TOKEN,
            datetime.now(timezone.utc).isoformat(), WSEventType.AUTH_ERROR,
        )
        return None


async def authenticate_ws_ticket(websocket: WebSocket, ticket: str) -> Optional[str]:
    """Authenticate using a single-use ws-ticket (P1.1a FR6)."""
    async with AsyncSessionLocal() as db:
        user_id = await claim_ws_ticket(db, ticket)
        await db.commit()

    if user_id is None:
        await send_ws_error(
            websocket, "Invalid or expired ticket.", WSErrorCode.AUTH_INVALID_TOKEN,
            datetime.now(timezone.utc).isoformat(), WSEventType.AUTH_ERROR,
        )
        return None

    user = await _load_and_authorize_ws_user(user_id)
    if user is None:
        await send_ws_error(
            websocket, "Invalid token or insufficient permissions", WSErrorCode.AUTH_INVALID_TOKEN,
            datetime.now(timezone.utc).isoformat(), WSEventType.AUTH_ERROR,
        )
        return None

    logger.info(f"WebSocket auth successful for admin {user.id} (ticket)")
    return str(user.id)


async def handle_auth(websocket: WebSocket, payload: dict) -> Optional[str]:
    """Route an auth frame to ticket or JWT path based on payload contents."""
    has_credential = bool(payload.get('token') or payload.get('ticket'))
    try:
        auth_data = AuthPayload(**payload) if has_credential else None
    except ValidationError as e:
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
    ws = get_ws_manager()
    if not temp_id:
        await ws.send_personal(websocket, {
            "type": WSEventType.ERROR.value,
            "payload": {"message": error},
            "timestamp": timestamp,
        })
        return

    await ws.send_personal(websocket, {
        "type": WSEventType.MESSAGE_FAILED.value,
        "payload": {
            "temp_id": temp_id,
            "error": error,
            "retryable": retryable,
        },
        "timestamp": timestamp,
    })
