from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from app.db.base import Base
import enum

class RichMenuStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    INACTIVE = "INACTIVE"

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

    # Local Storage (Path A)
    image_path = Column(String, nullable=True)

    # Stored as VARCHAR(9), not a PostgreSQL enum type — same pattern as
    # ChatSession.status. RichMenuStatus is a str-enum, so assigning a member
    # writes its value and the Pydantic schema still validates on read.
    status = Column(String(9), default=RichMenuStatus.DRAFT.value)

    # Sync tracking for persistence
    sync_status = Column(String, default="PENDING")  # PENDING, SYNCED, FAILED
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
