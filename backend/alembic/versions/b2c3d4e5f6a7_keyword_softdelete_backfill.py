"""soft-delete support for intent keywords + backfill is_active flags

Revision ID: b2c3d4e5f6a7
Revises: z1a2b3c4d5e6
Create Date: 2026-10-23

Context: user decision 2026-10-23 (hide-only deletes, restorable;
see .agents/PRPs/2026-10-23-leave-confirm-soft-delete.prd.md).
`DELETE /admin/intents/keywords/{id}` must hide instead of destroying the
row, but `intent_keywords` has no `is_active` column, so this migration
adds it (NOT NULL DEFAULT true — existing rows stay visible).

Same migration backfills the three older soft-delete flags that were
created nullable without a backfill (thermo review P7): legacy rows with
NULL currently read as *inactive* (invisible to the bot) while still
squatting unique names. After the backfill every flag is NOT NULL
DEFAULT true, matching the taxonomy tables.

`downgrade()` drops only the added keyword column; the backfilled values
and NOT NULL guards stay (data-preserving — downgrade never silently
re-hides rows).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "533db9188e4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(connection, table_name: str, column_name: str) -> bool:
    return any(
        col["name"] == column_name
        for col in sa.inspect(connection).get_columns(table_name)
    )


def upgrade() -> None:
    connection = op.get_bind()

    if not _has_column(connection, "intent_keywords", "is_active"):
        op.add_column(
            "intent_keywords",
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )

    for table in ("intent_categories", "intent_responses", "auto_replies"):
        op.execute(
            sa.text(f"UPDATE {table} SET is_active = true WHERE is_active IS NULL")
        )

    for table in ("intent_categories", "intent_responses", "auto_replies"):
        op.alter_column(
            table,
            "is_active",
            existing_type=sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        )


def downgrade() -> None:
    # Data-preserving: keep backfilled values and NOT NULL guards; only the
    # keyword column added here is dropped (its rows were all visible).
    connection = op.get_bind()
    if _has_column(connection, "intent_keywords", "is_active"):
        op.drop_column("intent_keywords", "is_active")
