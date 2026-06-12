"""add index on audit_logs.resource_id

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-06-13 06:40:00.000000

The request-detail timeline filters audit logs per resource
(WHERE resource_type = ? AND resource_id = ? AND action = ?) on every
page load and after every save — index resource_id before the table grows.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'q7r8s9t0u1v2'
down_revision: Union[str, None] = 'p6q7r8s9t0u1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f('ix_audit_logs_resource_id'),
        'audit_logs',
        ['resource_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_audit_logs_resource_id'), table_name='audit_logs')
