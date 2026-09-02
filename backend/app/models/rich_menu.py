import enum
import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, DateTime, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base

class RichMenuStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    INACTIVE = "INACTIVE"

class RichMenuSyncStatus(str, enum.Enum):
    PENDING = "PENDING"
    SYNCED = "SYNCED"
    FAILED = "FAILED"

class RichMenuDisplayMode(str, enum.Enum):
    """How the menu goes live (OA Manager's default-behavior + display-period
    parity): ALWAYS = live as soon as it syncs/publishes; SCHEDULED = the
    display scheduler sets/cancels the default inside [start, end]; MANUAL =
    synced but never auto-published (per-user/alias use only)."""
    ALWAYS = "ALWAYS"
    SCHEDULED = "SCHEDULED"
    MANUAL = "MANUAL"

class RichMenu(Base):
    __tablename__ = "rich_menus"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    chat_bar_text = Column(String, nullable=False)

    # LINE related
    line_rich_menu_id = Column(String, unique=True, index=True, nullable=True)

    # Layout and Actions (Stored as JSON)
    # { "size": {"width": 2500, "height": 1686}, "areas": [...] }
    config = Column(JSON, nullable=False)

    # Menu image bytes live in media_files (one pipeline with LIFF uploads and
    # the admin files page), served at /api/v1/media/{id}. Deliberately NO
    # relationship attribute: a lazy many-to-one traversal inside the event
    # loop raises MissingGreenlet — async code selects MediaFile explicitly by
    # this FK. ondelete SET NULL means a media row deleted from the admin
    # files page gracefully reverts the menu to "no image".
    image_media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media_files.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Stored as VARCHAR(9), not a PostgreSQL enum type — same pattern as
    # ChatSession.status. RichMenuStatus is a str-enum, so assigning a member
    # writes its value and the Pydantic schema still validates on read.
    status = Column(String(9), default=RichMenuStatus.DRAFT.value)

    # Sync tracking for persistence (RichMenuSyncStatus values; the column is
    # a plain String, same native_enum=False pattern as `status` above).
    sync_status = Column(String, default=RichMenuSyncStatus.PENDING.value)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)

    # Display settings (RichMenuDisplayMode values; plain String, same pattern
    # as status/sync_status). ALWAYS keeps pre-PR behavior for existing rows
    # via the server_default in the migration.
    display_mode = Column(
        String(9), default=RichMenuDisplayMode.ALWAYS.value,
        server_default=RichMenuDisplayMode.ALWAYS.value, nullable=False,
    )
    display_start_at = Column(DateTime(timezone=True), nullable=True)
    display_end_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
