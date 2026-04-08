from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, Any
from enum import Enum

class MessageDirection(str, Enum):
    INCOMING = "INCOMING"
    OUTGOING = "OUTGOING"

class SenderRole(str, Enum):
    USER = "USER"
    BOT = "BOT"
    ADMIN = "ADMIN"

class MessageResponse(BaseModel):
    id: int
    line_user_id: Optional[str] = None
    direction: MessageDirection
    message_type: str
    content: Optional[str] = None
    payload: Optional[Any] = None
    created_at: datetime
    sender_role: Optional[SenderRole] = None
    operator_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class MessagePage(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
