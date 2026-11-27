"""add atomic webhook claim marker

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-11-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i0j1k2l3m4n5"
down_revision: Union[str, Sequence[str], None] = "h9i0j1k2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "webhook_events",
        sa.Column("inbound_claimed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("webhook_events", "inbound_claimed_at")
