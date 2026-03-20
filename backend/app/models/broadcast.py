from enum import Enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLAlchemyEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class BroadcastStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BroadcastType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FLEX = "flex"
    MULTI = "multi"


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message_type = Column(
        SQLAlchemyEnum(BroadcastType, name="broadcasttype", create_constraint=True),
        default=BroadcastType.TEXT,
    )
    content = Column(JSONB, nullable=False)
    target_audience = Column(String, default="all")
    target_filter = Column(JSONB, default={})
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        SQLAlchemyEnum(BroadcastStatus, name="broadcaststatus", create_constraint=True),
        default=BroadcastStatus.DRAFT,
        index=True,
    )
    total_recipients = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])
