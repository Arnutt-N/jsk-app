"""add contact/reminder fields and lookup indexes to bookings

Revision ID: e6f7g8h9i0j1
Revises: d5e6f7g8h9i0
Create Date: 2026-08-12

The `bookings` table has existed since the initial migration (1349087a4a24) but
was never wired to any service, endpoint or UI. This migration extends it for
the appointment booking + reminder feature.

Columns added (all nullable — the table may already hold rows, and every one of
these is optional at the domain level):
  - contact_name      name to call out at the counter
  - phone_number      contact fallback when a LINE push fails
  - note              free-text detail from the citizen
  - reminder_sent_at  claim marker for the advance-reminder scheduler
  - cancelled_at      audit trail for cancellations
  - updated_at        mirrors the repo-wide convention

`reminder_sent_at` deliberately has **no** server_default: the scheduler's
double-send guard is `UPDATE ... WHERE reminder_sent_at IS NULL`, so a default
would make every existing and new booking look already-reminded.

Indexes added under explicit names (Alembic compares indexes by name — see
PR #183; anything created here must be declared in the model's __table_args__
under exactly these names):
  - ix_bookings_slot          (service_type, booking_date, booking_time)
  - ix_bookings_reminder_due  (status, reminder_sent_at, booking_date)

Both guards are idempotent, so a partially-applied run can be re-run safely.

Downgrade: drops the two indexes and the six columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f7g8h9i0j1"
down_revision: Union[str, None] = "d5e6f7g8h9i0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "bookings"

IX_SLOT = "ix_bookings_slot"
IX_REMINDER_DUE = "ix_bookings_reminder_due"

NEW_COLUMNS = (
    ("contact_name", sa.String(length=120)),
    ("phone_number", sa.String(length=20)),
    ("note", sa.Text()),
    ("reminder_sent_at", sa.DateTime(timezone=True)),
    ("cancelled_at", sa.DateTime(timezone=True)),
    ("updated_at", sa.DateTime(timezone=True)),
)


def _column_exists(connection, table: str, column: str) -> bool:
    result = connection.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = :table AND column_name = :column
            )
            """
        ),
        {"table": table, "column": column},
    )
    return bool(result.scalar())


def _index_exists(connection, index_name: str) -> bool:
    result = connection.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :name)"),
        {"name": index_name},
    )
    return bool(result.scalar())


def upgrade() -> None:
    connection = op.get_bind()

    for name, column_type in NEW_COLUMNS:
        if not _column_exists(connection, TABLE, name):
            op.add_column(TABLE, sa.Column(name, column_type, nullable=True))

    if not _index_exists(connection, IX_SLOT):
        op.create_index(
            IX_SLOT,
            TABLE,
            ["service_type", "booking_date", "booking_time"],
            unique=False,
        )

    if not _index_exists(connection, IX_REMINDER_DUE):
        op.create_index(
            IX_REMINDER_DUE,
            TABLE,
            ["status", "reminder_sent_at", "booking_date"],
            unique=False,
        )


def downgrade() -> None:
    connection = op.get_bind()

    if _index_exists(connection, IX_REMINDER_DUE):
        op.drop_index(IX_REMINDER_DUE, table_name=TABLE)
    if _index_exists(connection, IX_SLOT):
        op.drop_index(IX_SLOT, table_name=TABLE)

    for name, _ in reversed(NEW_COLUMNS):
        if _column_exists(connection, TABLE, name):
            op.drop_column(TABLE, name)
