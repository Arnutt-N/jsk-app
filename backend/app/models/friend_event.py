from enum import Enum
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.base import Base


class FriendEventType(str, Enum):
    FOLLOW = "FOLLOW"
    UNFOLLOW = "UNFOLLOW"
    BLOCK = "BLOCK"
    UNBLOCK = "UNBLOCK"
    REFOLLOW = "REFOLLOW"


class EventSource(str, Enum):
    WEBHOOK = "WEBHOOK"
    MANUAL = "MANUAL"


class FriendEvent(Base):
    __tablename__ = "friend_events"

    id = Column(Integer, primary_key=True, index=True)
    line_user_id = Column(String(50), nullable=False, index=True)
    event_type = Column(String(20), nullable=False)
    source = Column(String(20), default=EventSource.WEBHOOK)
    refollow_count = Column(Integer, default=0)
    event_data = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
