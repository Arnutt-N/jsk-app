"""add template and text_v2 to objecttype enum

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-06-19 20:00:00.000000

Note: SQLAlchemy's Enum(ObjectType) persists the enum *member names* (uppercase),
so the new DB values must be 'TEMPLATE' and 'TEXT_V2' to match how the
`objecttype` type was originally created ('TEXT', 'FLEX', ...).
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 's9t0u1v2w3x4'
down_revision: Union[str, None] = 'r8s9t0u1v2w3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the two new reply-object types to the existing Postgres enum.
    # ADD VALUE cannot run inside a transaction that later uses the value,
    # so this migration only extends the enum (no data writes here).
    op.execute("ALTER TYPE objecttype ADD VALUE IF NOT EXISTS 'TEMPLATE'")
    op.execute("ALTER TYPE objecttype ADD VALUE IF NOT EXISTS 'TEXT_V2'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values in place.
    # Reverting would require recreating the enum type and rewriting columns.
    pass
