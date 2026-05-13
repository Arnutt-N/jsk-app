"""recategorize existing media_files where category=OTHER using filename extension

Round 4 of PR #54 (PRD A — Request Management UI Polish). The
`detect_category` helper now falls back to filename-based MIME guessing
when the uploader sent ``application/octet-stream`` (or no MIME at all),
but existing rows uploaded before that fix are still stuck in OTHER even
when their filenames make the correct category obvious.

This migration only **upgrades** OTHER rows to a more specific category
when the extension is clearly identifiable. Rows whose extension truly
is ambiguous (``.bin``, ``.dat``, no extension at all) stay in OTHER. We
never downgrade rows away from a specific category — the upgrade path
only adds information, it does not remove existing correctness.

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "o5p6q7r8s9t0"
down_revision: Union[str, Sequence[str], None] = "n4o5p6q7r8s9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Extension → target category. Keep this list explicit (not a regex over
# `mime_type`) so the migration is auditable and reversible. Anything
# not listed here stays in OTHER.
_IMAGE_EXTS = (
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".tiff",
    ".tif",
    ".heic",
    ".heif",
    ".avif",
)
_VIDEO_EXTS = (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".3gp")
_AUDIO_EXTS = (".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus")
_DOCUMENT_EXTS = (
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".rtf",
    ".txt",
    ".csv",
    ".md",
)


def _build_update_sql(target_category: str, exts: tuple[str, ...]) -> str:
    """Return a single SQL update that bumps rows whose filename ends with
    any of the given extensions (case-insensitive) and whose current
    category is OTHER. Using LOWER + LIKE OR-chain keeps the query
    index-friendlier than a regex match on Postgres.
    """
    conditions = " OR ".join(f"LOWER(filename) LIKE '%{ext}'" for ext in exts)
    return (
        "UPDATE media_files "
        f"SET category = '{target_category}' "
        f"WHERE category = 'OTHER' AND ({conditions})"
    )


def upgrade() -> None:
    op.execute(_build_update_sql("IMAGE", _IMAGE_EXTS))
    op.execute(_build_update_sql("VIDEO", _VIDEO_EXTS))
    op.execute(_build_update_sql("AUDIO", _AUDIO_EXTS))
    op.execute(_build_update_sql("DOCUMENT", _DOCUMENT_EXTS))


def downgrade() -> None:
    # We can't reliably reverse the upgrade because rows that legitimately
    # belong to a specific category from before this migration are
    # indistinguishable from rows we upgraded. Treat downgrade as a no-op
    # rather than risking data loss by force-resetting categories.
    pass
