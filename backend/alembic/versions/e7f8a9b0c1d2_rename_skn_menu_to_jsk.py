"""rename skn_menu seed to jsk_menu (DB data fix, idempotent)

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c0
Create Date: 2026-10-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE reply_objects
        SET object_id = 'jsk_menu',
            name = REPLACE(name, 'SKN', 'JSK')
        WHERE object_id = 'skn_menu'
        """
    )
    op.execute(
        """
        UPDATE reply_objects
        SET name = REPLACE(name, 'SKN', 'JSK')
        WHERE object_id = 'jsk_menu' AND name LIKE '%SKN%'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE reply_objects
        SET object_id = 'skn_menu',
            name = REPLACE(name, 'JSK', 'SKN')
        WHERE object_id = 'jsk_menu'
        """
    )
