import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

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
    # Uniqueness is enforced only among visible rows (partial unique index
    # WHERE is_active) so a hidden row never squats its name; the separate
    # non-unique lookup index below stays for plain name lookups.
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true", default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    keywords = relationship("IntentKeyword", back_populates="category", cascade="all, delete-orphan")
    responses = relationship("IntentResponse", back_populates="category", cascade="all, delete-orphan")

    __table_args__ = (
        Index(
            "uq_intent_categories_name_active",
            "name",
            unique=True,
            postgresql_where=text("is_active"),
        ),
        Index("ix_intent_categories_name", "name"),
    )

class IntentKeyword(Base):
    __tablename__ = "intent_keywords"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("intent_categories.id", ondelete="CASCADE"), nullable=False)
    keyword = Column(String, index=True, nullable=False)
    match_type = Column(Enum(MatchType), default=MatchType.CONTAINS, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="true", default=True)
    
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

    is_active = Column(Boolean, nullable=False, server_default="true", default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("IntentCategory", back_populates="responses")
