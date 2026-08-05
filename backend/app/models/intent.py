from sqlalchemy import Column, String, Integer, DateTime, Boolean, Enum, Index, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.db.base import Base

class MatchType(str, enum.Enum):
    EXACT = "exact"
    CONTAINS = "contains"
    REGEX = "regex"
    STARTS_WITH = "starts_with"

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

class IntentCategory(Base):
    __tablename__ = "intent_categories"

    id = Column(Integer, primary_key=True, index=True)
    # The live schema separates uniqueness (a constraint) from the lookup index
    # (non-unique); `unique=True, index=True` would collapse them into one
    # unique index under a different name.
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    keywords = relationship("IntentKeyword", back_populates="category", cascade="all, delete-orphan")
    responses = relationship("IntentResponse", back_populates="category", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("name", name="intent_categories_name_key"),
        Index("ix_intent_categories_name", "name"),
    )

class IntentKeyword(Base):
    __tablename__ = "intent_keywords"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("intent_categories.id", ondelete="CASCADE"), nullable=False)
    keyword = Column(String, index=True, nullable=False)
    match_type = Column(Enum(MatchType), default=MatchType.CONTAINS, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("IntentCategory", back_populates="keywords")

class IntentResponse(Base):
    __tablename__ = "intent_responses"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("intent_categories.id", ondelete="CASCADE"), nullable=False)
    reply_type = Column(Enum(ReplyType), nullable=False)
    
    # Content fields
    text_content = Column(Text, nullable=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey("media_files.id"), nullable=True)
    payload = Column(JSONB, nullable=True)
    
    # Ordering if we want multiple responses in sequence
    order = Column(Integer, default=0)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("IntentCategory", back_populates="responses")
