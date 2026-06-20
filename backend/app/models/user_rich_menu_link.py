from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base


class UserRichMenuLink(Base):
    """Local cache of a per-user rich menu assignment.

    LINE lets us bind a specific rich menu to a single user (overriding the
    default menu). We cache that binding here, keyed by `line_user_id`
    (U + 32 hex). One active assignment per user, so `line_user_id` is unique;
    unlinking is a hard delete of the row.
    """

    __tablename__ = "user_rich_menu_links"

    id = Column(Integer, primary_key=True, index=True)
    line_user_id = Column(String(50), unique=True, index=True, nullable=False)  # U + 32 hex
    rich_menu_id = Column(
        Integer,
        ForeignKey("rich_menus.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    # Sync tracking (per-user assignment state)
    sync_status = Column(String, default="PENDING")  # PENDING, SYNCED, FAILED
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)

    linked_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
