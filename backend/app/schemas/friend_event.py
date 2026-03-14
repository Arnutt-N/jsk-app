from pydantic import BaseModel, ConfigDict
from datetime import datetime
from enum import Enum
from typing import List, Optional

class FriendEventType(str, Enum):
    FOLLOW = "FOLLOW"
    UNFOLLOW = "UNFOLLOW"
    REFOLLOW = "REFOLLOW"

class EventSource(str, Enum):
    WEBHOOK = "WEBHOOK"
    MANUAL = "MANUAL"

class FriendEventBase(BaseModel):
    line_user_id: str
    event_type: FriendEventType
    source: EventSource = EventSource.WEBHOOK

class FriendEventCreate(FriendEventBase):
    pass

class FriendEventResponse(FriendEventBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class FriendEventListResponse(BaseModel):
    events: List[FriendEventResponse]
    total: int
