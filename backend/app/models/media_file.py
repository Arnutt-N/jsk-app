import enum
import mimetypes
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, LargeBinary, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base


class FileCategory(str, enum.Enum):
    DOCUMENT = "DOCUMENT"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    AUDIO = "AUDIO"
    OTHER = "OTHER"


# MIME types that count as documents. Kept as a module-level frozenset so it
# is built once and the lookup is O(1) inside `detect_category`.
_DOCUMENT_MIMES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/rtf",
    }
)


def detect_category(mime_type: str | None, filename: str | None = None) -> FileCategory:
    """Map a MIME type (with an optional filename fallback) to a `FileCategory`.

    Browsers usually populate ``Content-Type`` based on the file's extension,
    but some sources (Finder/Explorer drag-and-drop from network shares,
    files renamed without an extension, very old browsers) send
    ``application/octet-stream`` or no MIME at all. When that happens we
    rescue the detection by asking Python's stdlib ``mimetypes`` to guess
    from the filename — this keeps ``.jpg``/``.png`` uploads from getting
    miscategorised as ``OTHER``.
    """
    mt = (mime_type or "").strip().lower()

    # Generic/empty MIME → try a filename-based guess before falling through
    # to OTHER. We DO NOT override a specific MIME the upload already gave
    # us — that would let a malicious or quirky client mislabel content.
    if (not mt or mt == "application/octet-stream") and filename:
        guessed, _encoding = mimetypes.guess_type(filename)
        if guessed:
            mt = guessed.lower()

    if not mt:
        return FileCategory.OTHER
    if mt.startswith("image/"):
        return FileCategory.IMAGE
    if mt.startswith("video/"):
        return FileCategory.VIDEO
    if mt.startswith("audio/"):
        return FileCategory.AUDIO
    if mt.startswith("text/") or mt in _DOCUMENT_MIMES:
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
