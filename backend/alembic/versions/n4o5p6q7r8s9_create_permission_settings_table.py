"""create permission_settings table

Stage 2 of the request workflow redesign: replaces the hardcoded
permission policy in app.core.permissions with a DB-backed table that
SUPER_ADMIN/ADMIN can edit at /admin/settings/permissions.

The table seeds with the same defaults the Stage 1 hardcoded constants
declared, so behavior is unchanged immediately after migration.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-05-04 13:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, Sequence[str], None] = "m3n4o5p6q7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "permission_settings",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column(
            "allowed_roles",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("key"),
    )

    # Seed defaults so the application has a sensible starting policy
    # immediately after migration. These match
    # app.core.permissions.DEFAULT_POLICY exactly.
    op.execute(
        """
        INSERT INTO permission_settings (key, allowed_roles, description)
        VALUES
            (
                'assign_request',
                '["SUPER_ADMIN","ADMIN","DIRECTOR","HEAD"]'::jsonb,
                'มอบหมายงานให้ผู้อื่น'
            ),
            (
                'self_assign_request',
                '["SUPER_ADMIN","ADMIN","DIRECTOR","HEAD"]'::jsonb,
                'รับเรื่องเอง (self-assign)'
            ),
            (
                'edit_permission_settings',
                '["SUPER_ADMIN","ADMIN"]'::jsonb,
                'แก้ไขการตั้งค่าสิทธิ์'
            )
        ON CONFLICT (key) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_table("permission_settings")
