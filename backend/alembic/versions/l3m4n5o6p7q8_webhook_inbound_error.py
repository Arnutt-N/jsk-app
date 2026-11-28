"""add terminal error marker to webhook events

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-11-28
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "l3m4n5o6p7q8"
down_revision: Union[str, Sequence[str], None] = "k2l3m4n5o6p7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "webhook_events",
        sa.Column("inbound_error", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("webhook_events", "inbound_error")
