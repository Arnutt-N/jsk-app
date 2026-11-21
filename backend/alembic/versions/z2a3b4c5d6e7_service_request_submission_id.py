"""Deduplicate LIFF case retries with a client-supplied submission id.

Revision ID: z2a3b4c5d6e7
Revises: f0a1b2c3d4e6
Create Date: 2026-11-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'z2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'f0a1b2c3d4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('service_requests', sa.Column('submission_id', sa.String(length=36), nullable=True))
    op.create_index(
        'ix_service_requests_submission_id', 'service_requests', ['submission_id'], unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_service_requests_submission_id', table_name='service_requests')
    op.drop_column('service_requests', 'submission_id')
