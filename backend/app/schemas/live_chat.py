import re
from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

import bleach
from pydantic import BaseModel, Field, field_validator

from .chat_session import ChatSessionResponse, SessionStatus
from .message import MessageResponse

class ChatMode(str, Enum):
    BOT = "BOT"
    HUMAN = "HUMAN"

class LastMessage(BaseModel):
    content: str
    created_at: datetime

class TagSummary(BaseModel):
    id: int
    name: str
    color: str

class ConversationSummary(BaseModel):
    line_user_id: str
    display_name: Optional[str] = None
    picture_url: Optional[str] = None
    friend_status: str
    chat_mode: ChatMode
    session: Optional[ChatSessionResponse] = None
    last_message: Optional[LastMessage] = None
    last_user_activity_at: Optional[datetime] = None
    unread_count: int = 0
    tags: List[TagSummary] = Field(default_factory=list)
    is_pinned: bool = False
    is_muted: bool = False
    is_spam: bool = False

class ConversationList(BaseModel):
    conversations: List[ConversationSummary]
    total: int
    waiting_count: int
    active_count: int

class ConversationDetail(ConversationSummary):
    messages: List[MessageResponse]

def sanitize_message_text(value: Optional[str]) -> Optional[str]:
    """Strip HTML and collapse whitespace.

    Shared by every outbound-text entry point (WS send, REST send, REST
    create-conversation) so their sanitization cannot drift apart.
    """
    if value is None or not isinstance(value, str):
        return value
    cleaned = bleach.clean(value, tags=[], strip=True)
    return re.sub(r"\s+", " ", cleaned).strip()


class SendMessageRequest(BaseModel):
    text: Optional[str] = Field(None, max_length=5000)
    reply_object_id: Optional[int] = None
    media_id: Optional[str] = None

    @field_validator("text", mode="before")
    @classmethod
    def sanitize_text(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_message_text(value)

class ModeToggleRequest(BaseModel):
    mode: ChatMode

class ConversationPreferenceUpdate(BaseModel):
    is_pinned: Optional[bool] = None
    is_muted: Optional[bool] = None
    is_spam: Optional[bool] = None


class ReadConversationRequest(BaseModel):
    """Read boundary acknowledged by one operator for one conversation."""

    read_at: Optional[datetime] = None
