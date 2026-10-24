"""add VIEWER role + grant it view_reports

ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so COMMIT
first, then run the jsonb update.

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2026-10-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'VIEWER'")
    op.execute("COMMIT")
    op.execute(
        """
        UPDATE permission_settings
        SET allowed_roles = (allowed_roles || '"VIEWER"'::jsonb)
        WHERE key = 'view_reports'
          AND NOT (allowed_roles @> '"VIEWER"'::jsonb)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE permission_settings
        SET allowed_roles = (
            SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
            FROM jsonb_array_elements_text(allowed_roles) AS v
            WHERE v <> 'VIEWER'
        )
        WHERE key = 'view_reports'
        """
    )
