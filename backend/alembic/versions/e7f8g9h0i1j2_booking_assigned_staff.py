"""Assign bookings to counter staff.

Revision ID: e7f8g9h0i1j2
Revises: d7e8f9a0b1c2
Create Date: 2026-10-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7f8g9h0i1j2'
down_revision: Union[str, Sequence[str], None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('assigned_staff_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_bookings_assigned_staff',
        'bookings',
        'users',
        ['assigned_staff_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        op.f('ix_bookings_assigned_staff_id'),
        'bookings',
        ['assigned_staff_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_bookings_assigned_staff_id'), table_name='bookings')
    op.drop_constraint('fk_bookings_assigned_staff', 'bookings', type_='foreignkey')
    op.drop_column('bookings', 'assigned_staff_id')
