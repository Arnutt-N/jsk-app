"""canonicalize staff email and enforce case-insensitive uniqueness

Revision ID: g1h2i3j4k5l6
Revises: f09a1b2c3d4
Create Date: 2026-11-26
"""
from typing import Sequence, Union

from sqlalchemy import text

from alembic import op

revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, Sequence[str], None] = "f09a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # One-argument btrim strips only spaces; use the same explicit ASCII
    # whitespace set the application and the unique index use (F16).
    dup_count = conn.execute(
        text(
            "SELECT count(*) FROM ("
            "  SELECT lower(btrim(email, E' \\t\\n\\r\\f\\v')) AS canonical FROM users"
            "  WHERE btrim(email, E' \\t\\n\\r\\f\\v') <> ''"
            "  GROUP BY 1 HAVING count(*) > 1"
            ") AS duplicates"
        )
    ).scalar_one()
    if dup_count:
        # Never print an address into deployment logs. Point at the remediation
        # query instead.
        raise RuntimeError(
            f"Cannot canonicalize emails: {dup_count} duplicate group(s) differ only "
            "by case or surrounding whitespace. Resolve with the documented "
            "duplicate-email query, then rerun the migration."
        )

    op.execute(text("UPDATE users SET email = NULL WHERE btrim(email, E' \\t\\n\\r\\f\\v') = ''"))
    op.execute(
        text(
            "UPDATE users SET email = lower(btrim(email, E' \\t\\n\\r\\f\\v')) "
            "WHERE email IS NOT NULL "
            "AND email <> lower(btrim(email, E' \\t\\n\\r\\f\\v'))"
        )
    )
    op.drop_index("ix_users_email", table_name="users")
    op.create_index(
        "uq_users_email_lower",
        "users",
        [text("lower(btrim(email, E' \\t\\n\\r\\f\\v'))")],
        unique=True,
        postgresql_where=text("email IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_email_lower", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True, if_not_exists=True)
