"""Store an optional contact email per booking.

Revision ID: f7g8h9i0j1k2
Revises: e7f8g9h0i1j2
Create Date: 2026-10-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7g8h9i0j1k2'
down_revision: Union[str, Sequence[str], None] = 'e7f8g9h0i1j2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('email', sa.String(length=254), nullable=True))


def downgrade() -> None:
    op.drop_column('bookings', 'email')
