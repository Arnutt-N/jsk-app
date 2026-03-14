from pydantic import BaseModel, ConfigDict
from datetime import datetime
from enum import Enum
from typing import Optional

class SessionStatus(str, Enum):
    WAITING = "WAITING"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"

class ClosedBy(str, Enum):
    OPERATOR = "OPERATOR"
    SYSTEM = "SYSTEM"
    USER = "USER"
    SYSTEM_TIMEOUT = "SYSTEM_TIMEOUT"

class ChatSessionBase(BaseModel):
    line_user_id: str
    status: SessionStatus = SessionStatus.WAITING

class ChatSessionCreate(ChatSessionBase):
    pass

class ChatSessionResponse(ChatSessionBase):
    id: int
    operator_id: Optional[int] = None
    started_at: datetime
    claimed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    message_count: int = 0
    closed_by: Optional[ClosedBy] = None

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
