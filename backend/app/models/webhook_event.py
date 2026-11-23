"""Minimal durable intake record for LINE webhook events (F09).

Stores the event ID and type only: no message content, LINE user ID, or reply token.
`inbound_applied_at` and `reply_status` are separate so a failed reply cannot
re-run inbound effects on redelivery.
"""
import enum

from sqlalchemy import Column, DateTime, Enum, String
from sqlalchemy.sql import func

from app.db.base import Base


class ReplyDeliveryStatus(str, enum.Enum):
    NONE = "none"
    SENT = "sent"
    FAILED = "failed"


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    event_id = Column(String(64), primary_key=True)
    event_type = Column(String(32), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    inbound_applied_at = Column(DateTime(timezone=True), nullable=True)
    reply_status = Column(
        Enum(
            ReplyDeliveryStatus,
            name="webhookeventreplystatus",
            values_callable=lambda enum: [member.value for member in enum],
        ),
        nullable=False,
        server_default=ReplyDeliveryStatus.NONE.value,
    )
