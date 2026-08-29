"""add index on service_requests.assigned_agent_id

Revision ID: r9s0t1u2v3w4
Revises: q8r9s0t1u2v3
Create Date: 2026-08-29 00:00:00.000000

Kanban board and workload queries filter heavily on assigned_agent_id.
Without an index these degrade to sequential scans as the table grows.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'r9s0t1u2v3w4'
down_revision: Union[str, None] = 'q8r9s0t1u2v3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f('ix_service_requests_assigned_agent_id'),
        'service_requests',
        ['assigned_agent_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_service_requests_assigned_agent_id'), table_name='service_requests')
