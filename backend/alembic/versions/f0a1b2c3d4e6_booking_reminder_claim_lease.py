"""add reminder_claimed_at lease column to bookings

Revision ID: f0a1b2c3d4e6
Revises: f0a1b2c3d4e5
Create Date: 2026-11-20

F2: the reminder scheduler previously used `reminder_sent_at` as both the
"about to send" claim and the "delivery confirmed" marker. A push that failed
after the claim was committed was never retried. This column is the short-lived
claim; `reminder_sent_at` now records confirmed delivery only. Nullable with no
server default: every existing row starts unclaimed, and a default would make
new bookings look already claimed.

Idempotent so a partially-applied run can be re-run safely.
Downgrade: drop the column.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f0a1b2c3d4e6"
down_revision: Union[str, None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "bookings"
COLUMN = "reminder_claimed_at"


def _column_exists(connection, table: str, column: str) -> bool:
    return bool(
        connection.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = :table AND column_name = :column
                )
                """
            ),
            {"table": table, "column": column},
        ).scalar()
    )


def upgrade() -> None:
    connection = op.get_bind()
    if not _column_exists(connection, TABLE, COLUMN):
        op.add_column(TABLE, sa.Column(COLUMN, sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    connection = op.get_bind()
    if _column_exists(connection, TABLE, COLUMN):
        op.drop_column(TABLE, COLUMN)
