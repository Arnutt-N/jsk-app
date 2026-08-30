"""rich menu images move into media_files (additive expand phase)

Adds rich_menus.image_media_id (UUID FK -> media_files.id, ondelete SET NULL)
and best-effort backfills existing rows whose disk file still exists. The old
image_path column is NOT dropped here: CD applies migrations before deploying
and Koyeb rolls instances, so dropping a column the running code still reads
would 500 mid-rollout. The drop is a follow-up PR once this one is verified
live (expand-contract; precedent: q8r9s0t1u2v3 staged its destructive drop).

Revision ID: s0t1u2v3w4x5
Revises: r9s0t1u2v3w4
Create Date: 2026-08-30
"""
import uuid
from pathlib import Path

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "s0t1u2v3w4x5"
down_revision = "r9s0t1u2v3w4"
branch_labels = None
depends_on = None

# Rich-menu images were only ever written as .png/.jpg on disk; anything else
# in legacy image_path values has no trustworthy mime and is left null.
_MIME_BY_EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def _backfill_image_media(connection) -> None:
    """Copy still-existing disk images into media_files, one row at a time.

    Paths resolve relative to THIS file (backend/), never the CWD — legacy
    code stored CWD-relative paths, but db_target.py runs alembic with
    cwd=backend so both land on backend/uploads/rich_menus; the file-relative
    form also stays correct if a future runner changes CWD. basename()
    neutralizes any `../` in stored values (defense in depth: image_path was
    written by a sanitized endpoint, but the migration must not trust the DB).
    """
    backend_root = Path(__file__).resolve().parents[2]
    base_dir = backend_root / "uploads" / "rich_menus"

    rows = connection.execute(
        sa.text("SELECT id, image_path FROM rich_menus WHERE image_path IS NOT NULL")
    ).fetchall()
    for menu_id, stored_path in rows:
        mime = _MIME_BY_EXT.get(Path(stored_path or "").suffix.lower())
        if not mime:
            continue
        file_path = base_dir / Path(stored_path).name
        if not file_path.is_file():
            continue  # lost file (ephemeral FS) — menu stays imageless
        data = file_path.read_bytes()
        media_id = uuid.uuid4()
        connection.execute(
            sa.text(
                "INSERT INTO media_files "
                "(id, filename, mime_type, data, size_bytes, category, is_public, created_at) "
                "VALUES (:id, :filename, :mime_type, :data, :size_bytes, 'IMAGE', false, now())"
            ),
            {
                "id": media_id,
                "filename": file_path.name,
                "mime_type": mime,
                "data": data,
                "size_bytes": len(data),
            },
        )
        connection.execute(
            sa.text("UPDATE rich_menus SET image_media_id = :mid WHERE id = :menu_id"),
            {"mid": media_id, "menu_id": menu_id},
        )


def upgrade() -> None:
    op.add_column(
        "rich_menus",
        sa.Column(
            "image_media_id",
            UUID(as_uuid=True),
            sa.ForeignKey("media_files.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    _backfill_image_media(op.get_bind())


def downgrade() -> None:
    op.drop_column("rich_menus", "image_media_id")
