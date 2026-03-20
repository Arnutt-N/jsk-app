"""add refollow_count and event_data to friend_events

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-03-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, Sequence[str], None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "friend_events",
        sa.Column("refollow_count", sa.Integer(), nullable=True, server_default="0"),
    )
    op.add_column(
        "friend_events",
        sa.Column("event_data", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("friend_events", "event_data")
    op.drop_column("friend_events", "refollow_count")
