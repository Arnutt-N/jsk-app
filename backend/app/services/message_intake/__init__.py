"""Message Intake service package.

Owns LINE MessageEvent and PostbackEvent processing. The endpoint layer
(webhook.py) only verifies signatures and dispatches raw events here.

Public surface:
- message_intake_service: singleton for DI/patching
- process_webhook_events: the background-task entry point
- find_intent_keyword, resolve_reply_responses: re-exported for test compat
- notify_admins_conversation_update: deduplicated broadcast helper

The singletons below (line_service, ws_manager, live_chat_service, ...) are
re-exported because existing tests patch them through this namespace; see
_deps.py for how they stay late-bound inside the mixins.
"""
from app.core.redis_client import redis_client
from app.core.websocket_manager import ws_manager
from app.services.friend_service import friend_service
from app.services.handoff_service import handoff_service
from app.services.line_service import line_service
from app.services.live_chat_service import live_chat_service

from .broadcast import notify_admins_conversation_update, notify_admins_message_sent

message_intake_service = None  # set after mixin classes are defined (Phase 4+)

__all__ = [
    "message_intake_service",
    "notify_admins_conversation_update",
    "notify_admins_message_sent",
    "line_service",
    "ws_manager",
    "live_chat_service",
    "handoff_service",
    "friend_service",
    "redis_client",
]
