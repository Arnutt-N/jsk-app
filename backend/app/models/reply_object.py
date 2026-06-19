"""
ReplyObject Model - Reusable Message Templates
Admin creates these objects ($flex_1, $image_1) that can be referenced in auto-reply responses.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.base import Base
import enum


class ObjectType(str, enum.Enum):
    """Type of message object"""
    TEXT = "text"           # Simple text template
    FLEX = "flex"           # Flex Message (Bubble/Carousel)
    IMAGE = "image"         # Single Image
    STICKER = "sticker"     # LINE Sticker
    VIDEO = "video"         # Video Message
    AUDIO = "audio"         # Audio Message
    LOCATION = "location"   # Location Message
    IMAGEMAP = "imagemap"   # ImageMap Message
    TEMPLATE = "template"   # Template Message (buttons/confirm/carousel/image_carousel)
    TEXT_V2 = "text_v2"     # Text v2 (emoji / substitution / mention)


class ReplyObject(Base):
    """
    Reusable message object that can be referenced in auto_replies.response
    using $object_id syntax (e.g., $flex_traffic, $image_contact)
    """
    __tablename__ = "reply_objects"

    id = Column(Integer, primary_key=True, index=True)
    
    # Unique identifier used in responses (e.g., "flex_traffic", "image_1")
    # Referenced as $flex_traffic, $image_1 in auto_replies.response
    object_id = Column(String(100), unique=True, nullable=False, index=True)
    
    # Human-readable name for admin UI
    name = Column(String(255), nullable=False)
    
    # Category for organization (optional)
    category = Column(String(100), nullable=True)
    
    # Message type
    object_type = Column(Enum(ObjectType), nullable=False)
    
    # Payload data (structure depends on object_type)
    # For FLEX: Full Flex Message contents (bubble/carousel JSON)
    # For IMAGE: {"url": "https://...", "preview_url": "..."}
    # For STICKER: {"package_id": "...", "sticker_id": "..."}
    # For LOCATION: {"title": "...", "address": "...", "latitude": ..., "longitude": ...}
    payload = Column(JSONB, nullable=False)
    
    # Alt text for accessibility (used by Flex, Image)
    alt_text = Column(String(400), nullable=True)
    
    # Preview URL for admin UI (thumbnail)
    preview_url = Column(String(500), nullable=True)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ReplyObject ${self.object_id} ({self.object_type.value})>"
