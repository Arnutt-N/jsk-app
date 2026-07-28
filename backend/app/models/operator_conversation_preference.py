from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base

class OperatorConversationPreference(Base):
    """Per-operator preferences for a conversation (pin / mute / spam).

    Keyed by the LINE customer's ``users.id`` (not the raw LINE ID) so it stays
    valid across the LINE_ID_STORAGE_MODE pseudonymization rollout. One row per
    (operator, customer); flags default to False.
    """
    __tablename__ = "operator_conversation_preferences"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    is_pinned = Column(Boolean, default=False, nullable=False)
    is_muted = Column(Boolean, default=False, nullable=False)
    is_spam = Column(Boolean, default=False, nullable=False)
    pinned_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "operator_id", "user_id", name="uq_operator_conversation_pref"
        ),
    )
