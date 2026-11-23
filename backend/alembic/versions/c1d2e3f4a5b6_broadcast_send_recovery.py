"""Add broadcast payload version, send lease, and per-chunk attempts.

Revision ID: c1d2e3f4a5b6
Revises: a3b4c5d6e7f8
Create Date: 2026-11-23

F06 compares payload_version in every schedule/edit/delete/send claim.
F07 persists each provider attempt before the outbound call and uses the
lease owner to decide which worker may finalize a SENDING broadcast.

ALTER TYPE ... ADD VALUE cannot be followed by DDL using the new enum labels
inside the same transaction, so upgrade() commits after the enum change.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE broadcaststatus ADD VALUE IF NOT EXISTS 'INVALID'")
    op.execute("ALTER TYPE broadcaststatus ADD VALUE IF NOT EXISTS 'UNKNOWN'")
    op.execute("COMMIT")

    op.add_column(
        "broadcasts",
        sa.Column("payload_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("broadcasts", sa.Column("send_lease_owner", sa.String(length=64), nullable=True))

    op.create_table(
        "broadcast_send_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "broadcast_id",
            sa.Integer(),
            sa.ForeignKey("broadcasts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payload_version", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("token_hashes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("retry_key", sa.String(length=64), nullable=False),
        sa.Column("attempt_state", sa.String(length=16), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "broadcast_id",
            "payload_version",
            "chunk_index",
            "attempt_no",
            name="uq_broadcast_send_attempt",
        ),
    )
    op.create_index(
        "ix_broadcast_send_attempts_broadcast_id",
        "broadcast_send_attempts",
        ["broadcast_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_broadcast_send_attempts_broadcast_id", table_name="broadcast_send_attempts")
    op.drop_table("broadcast_send_attempts")
    op.drop_column("broadcasts", "send_lease_owner")
    op.drop_column("broadcasts", "payload_version")
    # PostgreSQL cannot drop an enum label; INVALID/UNKNOWN remain after downgrade.
