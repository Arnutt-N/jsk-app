"""Deduplicate counter retries with a client-supplied idempotency key.

Revision ID: h8i9j0k1l2m4
Revises: f7g8h9i0j1k2
Create Date: 2026-10-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8i9j0k1l2m4'
down_revision: Union[str, Sequence[str], None] = 'f7g8h9i0j1k2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('idempotency_key', sa.String(length=36), nullable=True))
    op.create_index("ix_bookings_idempotency_key", "bookings", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_bookings_idempotency_key", table_name='bookings')
    op.drop_column('bookings', 'idempotency_key')
