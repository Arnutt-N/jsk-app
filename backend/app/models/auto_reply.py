from sqlalchemy import Column, String, Integer, DateTime, Boolean, Enum, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class ReplyType(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    LOCATION = "location"
    STICKER = "sticker"
    FLEX = "flex"
    TEMPLATE = "template"
    IMAGEMAP = "imagemap"

class MatchType(str, enum.Enum):
    EXACT = "exact"
    CONTAINS = "contains"
    REGEX = "regex"
    STARTS_WITH = "starts_with"

class AutoReply(Base):
    __tablename__ = "auto_replies"

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String, index=True, nullable=False)
    match_type = Column(Enum(MatchType), default=MatchType.CONTAINS, nullable=False)
    reply_type = Column(Enum(ReplyType), nullable=False)
    
    # Content fields
    text_content = Column(Text, nullable=True)
    
    # Media linkage (for Image/Video/Audio)
    media_id = Column(UUID(as_uuid=True), ForeignKey("media_files.id"), nullable=True)
    
    # Complex payloads (Flex, Sticker config, Location lat/long)
    payload = Column(JSONB, nullable=True) 
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
