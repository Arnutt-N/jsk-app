from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, Any, List
from datetime import datetime
import bleach
import re


class WSEventType(str, Enum):
    """WebSocket event types for live chat communication"""
    # Client → Server
    AUTH = "auth"
    JOIN_ROOM = "join_room"
    LEAVE_ROOM = "leave_room"
    SEND_MESSAGE = "send_message"
    TYPING_START = "typing_start"
    TYPING_STOP = "typing_stop"
    CLAIM_SESSION = "claim_session"
    CLOSE_SESSION = "close_session"
    TRANSFER_SESSION = "transfer_session"
    SUBSCRIBE_ANALYTICS = "subscribe_analytics"
    UNSUBSCRIBE_ANALYTICS = "unsubscribe_analytics"
    PING = "ping"

    # Server → Client
    AUTH_SUCCESS = "auth_success"
    AUTH_ERROR = "auth_error"
    NEW_MESSAGE = "new_message"
    MESSAGE_SENT = "message_sent"
    TYPING_INDICATOR = "typing_indicator"
    SESSION_CLAIMED = "session_claimed"
    SESSION_CLOSED = "session_closed"
    SESSION_TRANSFERRED = "session_transferred"
    PRESENCE_UPDATE = "presence_update"
    CONVERSATION_UPDATE = "conversation_update"
    OPERATOR_JOINED = "operator_joined"
    OPERATOR_LEFT = "operator_left"
    ANALYTICS_UPDATE = "analytics_update"
    SLA_ALERT = "sla_alert"
    ERROR = "error"
    PONG = "pong"


class WSErrorCode(str, Enum):
    """WebSocket error codes for structured error handling"""
    AUTH_INVALID_TOKEN = "auth_invalid_token"
    AUTH_EXPIRED_TOKEN = "auth_expired_token"
    AUTH_MISSING_TOKEN = "auth_missing_token"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    VALIDATION_ERROR = "validation_error"
    INVALID_REQUEST = "invalid_request"
    MESSAGE_TOO_LONG = "message_too_long"
    NOT_AUTHENTICATED = "not_authenticated"
    NOT_IN_ROOM = "not_in_room"
    SESSION_NOT_FOUND = "session_not_found"
    INTERNAL_ERROR = "internal_error"
    UNKNOWN_EVENT = "unknown_event"


class WSMessage(BaseModel):
    """Base WebSocket message structure"""
    type: WSEventType
    payload: Optional[Any] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(use_enum_values=True)


class AuthPayload(BaseModel):
    """Authentication payload - requires JWT token"""
    token: str = Field(..., min_length=10, max_length=2000, description="JWT access token")

    @field_validator('token', mode='before')
    @classmethod
    def clean_token(cls, v: str) -> str:
        """Strip whitespace from token"""
        if isinstance(v, str):
            return v.strip()
        return v


class JoinRoomPayload(BaseModel):
    """Join room payload"""
    line_user_id: str = Field(..., min_length=1, max_length=100, pattern=r'^U[a-f0-9]{32}$')


class SendMessagePayload(BaseModel):
    """Send message payload with content validation"""
    text: str = Field(..., min_length=1, max_length=5000, description="Message content")
    temp_id: Optional[str] = Field(None, max_length=100)

    @field_validator('text', mode='before')
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        """Sanitize message text to prevent XSS"""
        if not isinstance(v, str):
            return v
        # Strip HTML tags
        cleaned = bleach.clean(v, tags=[], strip=True)
        # Normalize whitespace
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned


class TransferSessionPayload(BaseModel):
    """Transfer session payload"""
    to_operator_id: int = Field(..., gt=0, description="Target operator ID")
    reason: Optional[str] = Field(None, max_length=255, description="Transfer reason")


class TypingPayload(BaseModel):
    """Typing indicator payload"""
    line_user_id: str


class MessagePayload(BaseModel):
    """Message data payload"""
    id: int
    line_user_id: str
    direction: str
    content: str
    message_type: str
    sender_role: Optional[str] = None
    operator_name: Optional[str] = None
    created_at: datetime
    temp_id: Optional[str] = None


class SessionPayload(BaseModel):
    """Session data payload"""
    line_user_id: str
    session_id: int
    status: str
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None


class PresencePayload(BaseModel):
    """Presence update payload"""
    operators: List[dict]  # [{id, name, status, active_chats}]


class ErrorPayload(BaseModel):
    """Error payload"""
    message: str
    code: Optional[str] = None


class ConversationUpdatePayload(BaseModel):
    """Conversation update payload"""
    line_user_id: str
    display_name: str
    picture_url: Optional[str] = None
    chat_mode: str
    unread_count: Optional[int] = None
    session: Optional[dict] = None
    messages: List[MessagePayload] = []
