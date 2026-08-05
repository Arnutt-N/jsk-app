from enum import Enum
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.base import Base

class Provider(str, Enum):
    LINE = "LINE"
    TELEGRAM = "TELEGRAM"
    N8N = "N8N"
    GOOGLE_SHEETS = "GOOGLE_SHEETS"
    CUSTOM = "CUSTOM"

class Credential(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    provider = Column(String(50), nullable=False, index=True)
    credentials = Column(Text, nullable=False)  # Encrypted
    metadata_json = Column(JSONB, name="metadata", nullable=True)
    is_active = Column(Boolean, default=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
