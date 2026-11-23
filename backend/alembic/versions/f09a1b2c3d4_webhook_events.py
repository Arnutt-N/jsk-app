"""Durable, PII-free LINE webhook event records (F09).

Revision ID: f09a1b2c3d4
Revises: a3b4c5d6e7f8
Create Date: 2026-11-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f09a1b2c3d4"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "webhook_events",
        sa.Column("event_id", sa.String(length=64), primary_key=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("inbound_applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "reply_status",
            sa.Enum("none", "sent", "failed", name="webhookeventreplystatus"),
            server_default="none",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("webhook_events")
    sa.Enum(name="webhookeventreplystatus").drop(op.get_bind(), checkfirst=True)
