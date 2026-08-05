from enum import Enum
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, text
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

    id = Column(Integer, primary_key=True)
    line_user_id = Column(String(50), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String(20), default=SessionStatus.WAITING, index=True)
    # started_at / claimed_at are indexed under the hand-written `idx_` names
    # declared in __table_args__ below, not the `ix_` names `index=True` would
    # generate. Keeping index=True here would make autogenerate propose
    # dropping the live indexes and recreating them under a different name.
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
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
        # Mirrors the constraint above via the FK path, for LINE_ID_STORAGE_MODE
        # = "pseudonym" where line_user_id is no longer populated.
        # Created by migration d5e6f7g8h9i0.
        Index(
            "uq_chat_sessions_one_open_per_user",
            "user_id",
            unique=True,
            postgresql_where=text(
                "status IN ('WAITING', 'ACTIVE') AND user_id IS NOT NULL"
            ),
        ),
        # Created by migration c3d4e5f6g7h8 under these exact names.
        Index("idx_chat_sessions_started_at", "started_at"),
        Index("idx_chat_sessions_claimed_at", "claimed_at"),
    )
