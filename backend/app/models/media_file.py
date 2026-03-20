import uuid
import enum
from sqlalchemy import Column, String, Integer, DateTime, LargeBinary, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.base import Base


class FileCategory(str, enum.Enum):
    DOCUMENT = "DOCUMENT"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    AUDIO = "AUDIO"
    OTHER = "OTHER"


def detect_category(mime_type: str) -> FileCategory:
    """Auto-detect file category from MIME type."""
    if not mime_type:
        return FileCategory.OTHER
    mt = mime_type.lower()
    if mt.startswith("image/"):
        return FileCategory.IMAGE
    if mt.startswith("video/"):
        return FileCategory.VIDEO
    if mt.startswith("audio/"):
        return FileCategory.AUDIO
    if mt.startswith("text/") or mt in (
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/rtf",
    ):
        return FileCategory.DOCUMENT
    return FileCategory.OTHER


class MediaFile(Base):
    __tablename__ = "media_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    data = Column(LargeBinary, nullable=False)  # BLOB storage
    size_bytes = Column(Integer, nullable=False)
    category = Column(
        Enum(FileCategory, name="filecategory", create_constraint=False),
        nullable=False,
        default=FileCategory.OTHER,
        server_default="OTHER",
    )
    is_public = Column(Boolean, nullable=False, default=False, server_default="false")
    public_token = Column(String, unique=True, nullable=True, index=True)
    thumbnail_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
