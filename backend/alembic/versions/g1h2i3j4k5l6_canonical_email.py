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
    duplicate = conn.execute(
        text(
            "SELECT lower(btrim(email)) AS canonical FROM users "
            "WHERE btrim(email) <> '' GROUP BY 1 HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate is not None:
        raise RuntimeError(
            "Cannot canonicalize emails: duplicate addresses differ only by case "
            f"or surrounding whitespace ({duplicate[0]})"
        )

    op.execute(text("UPDATE users SET email = NULL WHERE btrim(email) = ''"))
    op.execute(
        text(
            "UPDATE users SET email = lower(btrim(email)) "
            "WHERE email IS NOT NULL AND email <> lower(btrim(email))"
        )
    )
    op.drop_index("ix_users_email", table_name="users")
    op.create_index(
        "uq_users_email_lower",
        "users",
        [text("lower(btrim(email))")],
        unique=True,
        postgresql_where=text("email IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_email_lower", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True, if_not_exists=True)
