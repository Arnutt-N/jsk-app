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
    status: SessionStatus = SessionStatus.WAITING

class ChatSessionResponse(ChatSessionBase):
    id: int
    operator_id: Optional[int] = None
    started_at: datetime
    claimed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    message_count: int = 0
    closed_by: Optional[ClosedBy] = None
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    archived_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
