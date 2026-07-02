from enum import Enum
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class SessionStatus(str, Enum):
    WAITING = "WAITING"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"

class ClosedBy(str, Enum):
    OPERATOR = "OPERATOR"
    SYSTEM = "SYSTEM"
    USER = "USER"
    SYSTEM_TIMEOUT = "SYSTEM_TIMEOUT"

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    line_user_id = Column(String(50), nullable=False, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String(20), default=SessionStatus.WAITING, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    closed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    first_response_at = Column(DateTime(timezone=True), nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    message_count = Column(Integer, default=0)
    closed_by = Column(String(20), nullable=True)
    transfer_count = Column(Integer, default=0)
    transfer_reason = Column(String(255), nullable=True)

    # Archive fields
    is_archived = Column(Boolean, default=False, nullable=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    archived_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    operator = relationship("User", back_populates="chat_sessions", foreign_keys=[operator_id])
    csat_responses = relationship("CsatResponse", back_populates="session")

    __table_args__ = (
        Index(
            "uq_chat_sessions_one_open_per_line_user",
            "line_user_id",
            unique=True,
            postgresql_where=status.in_([
                SessionStatus.WAITING.value,
                SessionStatus.ACTIVE.value,
            ]),
        ),
    )
