from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SQLAlchemyEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class BroadcastStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    INVALID = "invalid"
    UNKNOWN = "unknown"


class BroadcastType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FLEX = "flex"
    MULTI = "multi"
    OBJECT_REF = "object_ref"


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
    target_filter = Column(JSONB, default=dict)
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
    payload_version = Column(Integer, nullable=False, default=1, server_default="1")
    send_lease_owner = Column(String(64), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    operation_id = Column(String(36), nullable=True, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])


class BroadcastSendAttempt(Base):
    """Durable record of one provider call for one broadcast chunk."""

    __tablename__ = "broadcast_send_attempts"

    id = Column(Integer, primary_key=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id", ondelete="CASCADE"), nullable=False)
    payload_version = Column(Integer, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    attempt_no = Column(Integer, nullable=False)
    token_hashes = Column(JSONB, nullable=False)
    token_count = Column(Integer, nullable=False)
    retry_key = Column(String(64), nullable=False)
    attempt_state = Column(String(16), nullable=False)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "broadcast_id", "payload_version", "chunk_index", "attempt_no",
            name="uq_broadcast_send_attempt",
        ),
    )
