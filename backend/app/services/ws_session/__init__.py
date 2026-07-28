"""WebSocket session handler package.

Owns the message-dispatch logic for the /ws/live-chat endpoint. The endpoint
layer (ws_live_chat.py) only handles origin validation, connection lifecycle,
and the receive loop — all business logic dispatches here.

Singletons re-exported for test patching (see _deps.py).
"""
from app.core.websocket_manager import ws_manager
from app.core.rate_limiter import ws_rate_limiter
from app.core.websocket_health import ws_health_monitor
from app.services.live_chat_service import live_chat_service
from app.services.analytics_service import analytics_service
from app.services.user_identity_service import resolve_by_line_id
from app.services.message_intake import notify_admins_message_sent

from .auth import (
    handle_auth,
    authenticate_ws_user,
    authenticate_ws_ticket,
    send_message_failed,
    log_ws_event,
)
from .handlers import (
    handle_send_message,
    handle_join_room,
    handle_claim_session,
    handle_close_session,
    handle_transfer_session,
)

__all__ = [
    "ws_manager",
    "ws_rate_limiter",
    "ws_health_monitor",
    "live_chat_service",
    "analytics_service",
    "resolve_by_line_id",
    "notify_admins_message_sent",
    "handle_auth",
    "authenticate_ws_user",
    "authenticate_ws_ticket",
    "send_message_failed",
    "log_ws_event",
    "handle_send_message",
    "handle_join_room",
    "handle_claim_session",
    "handle_close_session",
    "handle_transfer_session",
]
