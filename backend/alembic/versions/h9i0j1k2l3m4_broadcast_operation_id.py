"""add broadcast operation id for replay safety

Revision ID: h9i0j1k2l3m4
Revises: g1h2i3j4k5l6
Create Date: 2026-11-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h9i0j1k2l3m4"
down_revision: Union[str, Sequence[str], None] = "g1h2i3j4k5l6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("broadcasts", sa.Column("operation_id", sa.String(length=36), nullable=True))
    op.create_index(
        "ix_broadcasts_operation_id",
        "broadcasts",
        ["operation_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_broadcasts_operation_id", table_name="broadcasts")
    op.drop_column("broadcasts", "operation_id")
