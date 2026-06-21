from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base


class RichMenuAlias(Base):
    """Local cache of a LINE Rich Menu alias.

    A LINE alias maps a stable alias_id (used by `richmenuswitch` actions) to a
    concrete rich menu. We mirror it locally so the admin UI can list/manage
    aliases without hitting the LINE API on every render and so we can track
    sync state. `alias_id` is immutable on LINE (only its target can change).
    """

    __tablename__ = "rich_menu_aliases"

    id = Column(Integer, primary_key=True, index=True)
    alias_id = Column(String, unique=True, index=True, nullable=False)
    rich_menu_id = Column(
        Integer,
        ForeignKey("rich_menus.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    # Sync tracking (mirror RichMenu)
    sync_status = Column(String, default="PENDING")  # PENDING, SYNCED, FAILED
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
