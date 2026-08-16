from sqlalchemy import Column, Integer, String, DateTime, Index, Text, ForeignKey, text
from sqlalchemy.sql import func
from app.db.base import Base


class UserRichMenuLink(Base):
    """Local cache of a per-user rich menu assignment.

    LINE lets us bind a specific rich menu to a single user (overriding the
    default menu). We cache that binding here, keyed by the ``user_id`` FK
    (U + 32 hex LINE IDs are resolved to users via HMAC hash). One active
    assignment per user, so ``user_id`` is unique; unlinking is a hard
    delete of the row.
    """

    __tablename__ = "user_rich_menu_links"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
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

    __table_args__ = (
        # One assignment per user (PR C — line_user_id column dropped).
        # Created by migration d5e6f7g8h9i0.
        Index(
            "uq_user_rich_menu_links_user_id",
            "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
    )
