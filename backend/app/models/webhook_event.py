"""Minimal durable intake record for LINE webhook events (F09, F01).

Stores the event ID, type, and a minimal replayable payload: no message content,
LINE user ID, or reply token. `inbound_applied_at` and `reply_status` are
separate so a failed reply cannot re-run inbound effects on redelivery. The
payload lets a receipt acknowledged before a crash be replayed after restart
(F01) instead of waiting for LINE redelivery.
"""
import enum

from sqlalchemy import JSON, Column, DateTime, Enum, String
from sqlalchemy.sql import func

from app.db.base import Base


class ReplyDeliveryStatus(str, enum.Enum):
    NONE = "none"
    SENT = "sent"
    FAILED = "failed"
    UNKNOWN = "unknown"


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    event_id = Column(String(64), primary_key=True)
    event_type = Column(String(32), nullable=False)
    # Minimal replayable projection of the event (no personal content).
    payload = Column(JSON, nullable=True)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    inbound_applied_at = Column(DateTime(timezone=True), nullable=True)
    inbound_claimed_at = Column(DateTime(timezone=True), nullable=True)
    # Why a receipt can never be replayed (e.g. an unsupported event type or a
    # payload stripped by an older release). Terminal: recovery skips these and
    # an operator can query them. Distinct from `inbound_applied_at`, which
    # means the handlers actually ran.
    inbound_error = Column(String(64), nullable=True)
    reply_status = Column(
        Enum(
            ReplyDeliveryStatus,
            name="webhookeventreplystatus",
            values_callable=lambda enum: [member.value for member in enum],
        ),
        nullable=False,
        server_default=ReplyDeliveryStatus.NONE.value,
    )
