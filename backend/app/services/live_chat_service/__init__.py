"""Live chat service package.

Formerly a single 980-line module; now split by concern while keeping the
same import path (`app.services.live_chat_service`) and public surface:

- unread.py         — unread-count helpers
- handoff.py        — human handoff initiation + queue position
- sessions.py       — claim/close/takeover/release/transfer lifecycle
- conversations.py  — inbox listing, history, message search
- messaging.py      — operator text/media sending, chat-mode toggle
- analytics.py      — chat analytics aggregation
- errors.py         — transfer error constants

The singletons below (line_service, sla_service, business_hours_service,
redis_client, ...) are re-exported because existing tests patch them through
this namespace (e.g. `patch('app.services.live_chat_service.sla_service')`);
see _deps.py for how sla_service stays late-bound inside the mixins.
"""
from app.core.redis_client import redis_client
from app.services.business_hours_service import business_hours_service
from app.services.line_service import line_service
from app.services.sla_service import sla_service
from app.services.telegram_service import telegram_service

from .analytics import AnalyticsMixin
from .conversations import ConversationsMixin
from .errors import (
    TRANSFER_ERR_INVALID_TARGET,
    TRANSFER_ERR_NO_ACTIVE_SESSION,
    TRANSFER_ERR_NOT_CURRENT_OPERATOR,
    TRANSFER_ERR_TRANSFER_TO_SELF,
)
from .handoff import HandoffMixin
from .messaging import MessagingMixin
from .preferences import PreferencesMixin
from .sessions import SessionLifecycleMixin
from .unread import UnreadCountsMixin


class LiveChatService(
    UnreadCountsMixin,
    HandoffMixin,
    SessionLifecycleMixin,
    ConversationsMixin,
    MessagingMixin,
    AnalyticsMixin,
    PreferencesMixin,
):
    """Facade composing the live chat capabilities from per-concern mixins."""


live_chat_service = LiveChatService()

__all__ = [
    "LiveChatService",
    "live_chat_service",
    "TRANSFER_ERR_NO_ACTIVE_SESSION",
    "TRANSFER_ERR_NOT_CURRENT_OPERATOR",
    "TRANSFER_ERR_TRANSFER_TO_SELF",
    "TRANSFER_ERR_INVALID_TARGET",
    "line_service",
    "telegram_service",
    "sla_service",
    "business_hours_service",
    "redis_client",
]
