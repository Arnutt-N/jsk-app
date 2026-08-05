"""WsTicket model — single-use WebSocket auth tickets (P1.1a FR6).

Short-lived (60s TTL), single-use tokens minted via `POST /auth/ws-ticket`
so the live-chat WebSocket never carries a long-lived JWT in its first
message. DB-backed (not Redis) because the backend may scale horizontally on
Koyeb and Redis stays optional per repo policy. `token_hash` stores only the
SHA-256 hash of the raw ticket — never the raw value.
"""
from sqlalchemy import Column, ForeignKey, Integer, String, DateTime
from datetime import datetime, timezone

from app.db.base import Base


class WsTicket(Base):
    """A single-use WebSocket authentication ticket."""

    __tablename__ = "ws_tickets"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<WsTicket(id={self.id}, user_id={self.user_id}, used_at={self.used_at})>"
