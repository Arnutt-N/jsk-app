from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index, Text, Enum, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base


class MessageDirection(str, enum.Enum):
    INCOMING = "INCOMING"
    OUTGOING = "OUTGOING"


class SenderRole(str, enum.Enum):
    """Role of the message sender"""
    USER = "USER"      # LINE user
    BOT = "BOT"        # Automated bot response
    ADMIN = "ADMIN"    # Human operator in live chat


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    direction = Column(Enum(MessageDirection), nullable=False)
    message_type = Column(String, nullable=False)  # text, image, sticker, location, flex
    content = Column(Text, nullable=True)  # Text content or JSON string
    payload = Column(JSONB, nullable=True)  # Full JSON payload for complex messages
    
    # New columns for live chat support
    sender_role = Column(Enum(SenderRole), nullable=True)  # USER, BOT, or ADMIN
    operator_name = Column(String, nullable=True)  # Display name of admin operator
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        # Composite index backing the conversation-history query
        # (WHERE user_id = ... ORDER BY created_at DESC).
        # Created by migration q8r9s0t1u2v3 (PR C).
        Index("ix_messages_user_created", "user_id", text("created_at DESC")),
    )
