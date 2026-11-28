"""add unknown reply delivery status

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-11-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "j1k2l3m4n5o6"
down_revision: Union[str, Sequence[str], None] = "i0j1k2l3m4n5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL 16 permits ADD VALUE without COMMIT when the new label is not
    # used in the same transaction; Alembic commits this migration normally.
    op.execute("ALTER TYPE webhookeventreplystatus ADD VALUE IF NOT EXISTS 'unknown'")


def downgrade() -> None:
    # PostgreSQL cannot remove an enum label. Keep it for compatibility.
    pass
