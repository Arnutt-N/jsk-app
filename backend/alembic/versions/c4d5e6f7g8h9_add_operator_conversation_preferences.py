"""add operator_conversation_preferences table

Revision ID: c4d5e6f7g8h9
Revises: b3c4d5e6f7g8
Create Date: 2026-07-28

Adds the per-operator conversation preferences table backing the live-chat
sidebar actions (pin / mute / mark-as-spam). Keyed by the LINE customer's
``users.id`` (not the raw LINE ID) so it is unaffected by the
LINE_ID_STORAGE_MODE pseudonymization rollout. Purely additive.

Idempotent: the table-creation is guarded by a has_table check.
Downgrade: drops the table (safe reverse of additive).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7g8h9"
down_revision: Union[str, None] = "b3c4d5e6f7g8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    if sa.inspect(connection).has_table("operator_conversation_preferences"):
        return

    op.create_table(
        "operator_conversation_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("operator_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_muted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_spam", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operator_id", "user_id", name="uq_operator_conversation_pref"),
    )
    op.create_index(
        "ix_operator_conversation_preferences_operator_id",
        "operator_conversation_preferences",
        ["operator_id"],
    )
    op.create_index(
        "ix_operator_conversation_preferences_user_id",
        "operator_conversation_preferences",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_operator_conversation_preferences_user_id",
        table_name="operator_conversation_preferences",
    )
    op.drop_index(
        "ix_operator_conversation_preferences_operator_id",
        table_name="operator_conversation_preferences",
    )
    op.drop_table("operator_conversation_preferences")
