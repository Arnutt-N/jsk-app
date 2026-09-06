"""add index on service_requests.created_at

Revision ID: t1u2v3w4x5y6
Revises: c9d0e1f2a3b4
Create Date: 2026-09-06 00:00:00.000000

The admin requests list, the bot's "my requests" command, and admin reports
all ORDER BY created_at DESC — the table's other hot columns are indexed but
this one was missed, forcing sequential scans + sorts as the table grows.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 't1u2v3w4x5y6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f('ix_service_requests_created_at'),
        'service_requests',
        ['created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_service_requests_created_at'), table_name='service_requests')
