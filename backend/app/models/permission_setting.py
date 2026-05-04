"""Editable permission policy stored in the database (Stage 2).

Each row defines which user roles are allowed to perform a given
action. The `key` is a stable identifier used by code (`can_assign`,
`can_self_assign`, etc.); `allowed_roles` is a JSONB list of
UserRole enum values.

Design choices:
  - JSONB array (not a junction table) because each permission has a
    handful of roles and we always read/write the full set together.
    Junction would force N queries per check.
  - `updated_by_id` for audit -- tracks who last changed each rule.
  - No history table yet; if change history is needed later, add a
    `permission_setting_history` companion table or use generic audit.

The application falls back to hardcoded defaults
(`app.core.permissions.DEFAULT_POLICY`) when a row is missing, so the
table can be empty in early environments without breaking auth.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class PermissionSetting(Base):
    __tablename__ = "permission_settings"

    # Logical key -- e.g. 'assign_request', 'self_assign_request',
    # 'edit_permission_settings'. Must match the keys consumed by
    # app/core/permissions.py.
    key = Column(String(100), primary_key=True)

    # JSONB list of UserRole enum values, e.g. ["SUPER_ADMIN", "ADMIN"].
    allowed_roles = Column(JSONB, nullable=False, default=list)

    # Human-readable Thai description shown in the Settings UI.
    description = Column(Text, nullable=True)

    # Audit: when was this last changed and by whom.
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = relationship("User", foreign_keys=[updated_by_id])
