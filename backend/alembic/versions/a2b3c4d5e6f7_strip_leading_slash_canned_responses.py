"""strip leading slash from canned_responses.shortcut

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5e6
Create Date: 2026-07-19

The canned-response seed data originally stored shortcuts WITH the live-chat
trigger prefix already included (e.g. ``/greeting``). The admin UI then
re-added the ``/`` at display time, producing ``//greeting`` in the table.

Fix the source of truth: the stored shortcut must never contain the trigger
prefix. This migration strips any number of leading ``/`` characters from
every existing row in ``canned_responses.shortcut`` so the admin table and the
CannedResponsePicker both render consistently (``/greeting`` once, not twice).

A companion code change in ``canned_response_service._normalize_shortcut``
ensures future create/update calls also strip the prefix, so this migration
is a one-shot backfill of legacy rows only.

Idempotent: re-running is safe (no leading ``/`` left → no rows updated).
Downgrade is a no-op — the original value is lost, and restoring the bug is
never desirable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "z1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()

    # PostgreSQL LTRIM(string, chars) removes any of `chars` from the left
    # repeatedly, so '//thanks' -> 'thanks' and '/' -> ''. The extra guard
    # `WHERE shortcut LIKE '/%'` keeps the UPDATE a no-op on rows that are
    # already clean (the common path for DBs seeded AFTER this fix lands).
    connection.execute(
        sa.text(
            """
            UPDATE canned_responses
               SET shortcut = LTRIM(shortcut, '/')
             WHERE shortcut LIKE '/%'
            """
        )
    )


def downgrade() -> None:
    # Intentional no-op: restoring the leading '/' would re-introduce the
    # double-slash rendering bug and is never desirable.
    pass