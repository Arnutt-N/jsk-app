"""rename remaining skn reply objects to jsk (DB data fix, idempotent)

Revision ID: f0a1b2c3d4e5
Revises: e7f8a9b0c1d2
Create Date: 2026-10-25 00:00:00.000000

The earlier e7f8a9b0c1d2 migration matched ``object_id = 'skn_menu'``
(without the ``$`` prefix the seeds actually store), so it renamed nothing
in production, and it never covered the ``$skn_<hash>`` carousel/image
objects or ``$skn_social``. This migration renames every ``$skn_`` object
to ``$jsk_`` (display name ``SKN`` -> ``JSK``) and rewrites the ``$skn_``
references stored in answer texts. Idempotent: re-running matches zero rows.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | Sequence[str] | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # '$skn_' is 5 chars; substr from 6 keeps the hash/suffix intact.
    op.execute(
        """
        UPDATE reply_objects
        SET object_id = '$jsk_' || substr(object_id, 6),
            name = REPLACE(name, 'SKN', 'JSK')
        WHERE starts_with(object_id, '$skn_')
        """
    )
    # Names the earlier migration may have missed (already-$jsk_ rows).
    op.execute(
        """
        UPDATE reply_objects
        SET name = REPLACE(name, 'SKN', 'JSK')
        WHERE starts_with(object_id, '$jsk_') AND name LIKE '%SKN%'
        """
    )
    # Answer texts embed "$skn_<hash>" refs (appended by the import script).
    op.execute(
        """
        UPDATE intent_responses
        SET text_content = REPLACE(text_content, '$skn_', '$jsk_')
        WHERE strpos(text_content, '$skn_') > 0
        """
    )
    op.execute(
        """
        UPDATE auto_replies
        SET text_content = REPLACE(text_content, '$skn_', '$jsk_')
        WHERE text_content IS NOT NULL AND strpos(text_content, '$skn_') > 0
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE reply_objects
        SET object_id = '$skn_' || substr(object_id, 6),
            name = REPLACE(name, 'JSK', 'SKN')
        WHERE starts_with(object_id, '$jsk_')
        """
    )
    op.execute(
        """
        UPDATE intent_responses
        SET text_content = REPLACE(text_content, '$jsk_', '$skn_')
        WHERE strpos(text_content, '$jsk_') > 0
        """
    )
    op.execute(
        """
        UPDATE auto_replies
        SET text_content = REPLACE(text_content, '$jsk_', '$skn_')
        WHERE text_content IS NOT NULL AND strpos(text_content, '$jsk_') > 0
        """
    )
