"""add starts_with to matchtype

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-05-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'p6q7r8s9t0u1'
down_revision: Union[str, None] = 'o5p6q7r8s9t0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add STARTS_WITH to matchtype enum if not already present
    op.execute("ALTER TYPE matchtype ADD VALUE IF NOT EXISTS 'starts_with'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values
    # Downgrade would require recreating the enum type
    pass
