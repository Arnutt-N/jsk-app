from pydantic import BaseModel, ConfigDict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class FriendEventType(str, Enum):
    FOLLOW = "FOLLOW"
    UNFOLLOW = "UNFOLLOW"
    BLOCK = "BLOCK"
    UNBLOCK = "UNBLOCK"
    REFOLLOW = "REFOLLOW"


class EventSource(str, Enum):
    WEBHOOK = "WEBHOOK"
    MANUAL = "MANUAL"


class FriendEventBase(BaseModel):
    line_user_id: str
    event_type: FriendEventType
    source: EventSource = EventSource.WEBHOOK
    refollow_count: int = 0
    event_data: Optional[Dict[str, Any]] = None


class FriendEventCreate(FriendEventBase):
    pass


class FriendEventResponse(FriendEventBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class FriendEventWithUser(FriendEventResponse):
    """Event response enriched with user display info."""
    display_name: Optional[str] = None
    picture_url: Optional[str] = None


class FriendEventListResponse(BaseModel):
    events: List[FriendEventResponse]
    total: int


class FriendEventListWithUserResponse(BaseModel):
    events: List[FriendEventWithUser]
    total: int
    page: int
    per_page: int
    total_pages: int


class RefollowBreakdown(BaseModel):
    count: int  # how many times re-followed (1, 2, 3+)
    users: int  # how many users have that count


class FriendStatsResponse(BaseModel):
    total_followers: int
    total_blocked: int
    total_unfollowed: int
    total_refollows: int
    refollow_rate: float  # percentage
    refollow_breakdown: List[RefollowBreakdown]
