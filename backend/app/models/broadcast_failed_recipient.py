from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base


class BroadcastFailedRecipient(Base):
    __tablename__ = "broadcast_failed_recipients"

    id = Column(Integer, primary_key=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    token_hash = Column(String(64), nullable=False)  # sha256 hex ของ LINE user id
    attempt_count = Column(Integer, default=3, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("broadcast_id", "token_hash",
                         name="uq_broadcast_failed_recipient"),
    )
