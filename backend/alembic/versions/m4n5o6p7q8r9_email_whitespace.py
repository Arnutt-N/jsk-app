"""align email whitespace policy with the application

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-11-28

The earlier canonicalization used one-argument ``btrim`` (spaces only), while
the application strips every ASCII whitespace character. Legacy rows padded
with a tab or newline could therefore escape the backfill and the unique index.
This re-runs the backfill and recreates the index with the same explicit set
(F16). It never prints an address: only a duplicate-group count.
"""
from typing import Sequence, Union

from sqlalchemy import text

from alembic import op

revision: str = "m4n5o6p7q8r9"
down_revision: Union[str, Sequence[str], None] = "l3m4n5o6p7q8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_WS = r"E' \t\n\r\f\v'"


def upgrade() -> None:
    conn = op.get_bind()
    dup_count = conn.execute(
        text(
            "SELECT count(*) FROM ("
            f"  SELECT lower(btrim(email, {_WS})) AS canonical FROM users"
            f"  WHERE btrim(email, {_WS}) <> ''"
            "  GROUP BY 1 HAVING count(*) > 1"
            ") AS duplicates"
        )
    ).scalar_one()
    if dup_count:
        raise RuntimeError(
            f"Cannot canonicalize emails: {dup_count} duplicate group(s) differ only "
            "by case or surrounding whitespace. Resolve with the documented "
            "duplicate-email query, then rerun the migration."
        )

    op.execute(text(f"UPDATE users SET email = NULL WHERE btrim(email, {_WS}) = ''"))
    op.execute(
        text(
            f"UPDATE users SET email = lower(btrim(email, {_WS})) "
            "WHERE email IS NOT NULL "
            f"AND email <> lower(btrim(email, {_WS}))"
        )
    )
    op.execute("DROP INDEX IF EXISTS uq_users_email_lower")
    op.create_index(
        "uq_users_email_lower",
        "users",
        [text(f"lower(btrim(email, {_WS}))")],
        unique=True,
        postgresql_where=text("email IS NOT NULL"),
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_email_lower")
    op.create_index(
        "uq_users_email_lower",
        "users",
        [text("lower(btrim(email))")],
        unique=True,
        postgresql_where=text("email IS NOT NULL"),
    )
