from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.db.base import Base


class PasswordResetToken(Base):
    """Single-use, expiring token for self-service password reset.

    Only the SHA-256 hash is stored -- the raw token is emailed once and never
    persisted, so a database read alone cannot reset anyone's password.
    """

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
