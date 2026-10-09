"""flip rich-menu image rows in media_files to public

Rich-menu menu art was stored with the MediaFile default is_public=false, but
the admin UI serves image_url through bare <img> tags (no auth, no token) and
GET /media/{id} answers 403 for private rows without a token — so every menu
thumbnail rendered as "Image Load Error". New uploads are public at write
time (RichMenuService.replace_image); this backfills rows uploaded before
that fix.

Data-only migration (no DDL): a single UPDATE scoped to media rows actually
referenced by rich_menus.image_media_id. The is_public=false predicate makes
it idempotent and narrows the write set; non-menu private rows are untouched.

Revision ID: babccf229c05
Revises: d4e5f6a7b8c9
Create Date: 2026-10-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "babccf229c05"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE media_files SET is_public = true "
        "WHERE is_public = false AND id IN "
        "(SELECT image_media_id FROM rich_menus "
        "WHERE image_media_id IS NOT NULL)"
    )


def downgrade() -> None:
    # No-op by design (precedent: o5p6q7r8s9t0): rows made public after this
    # upgrade are intentional, so a blind reset to false would re-break menu
    # previews. If a rollback is ever truly needed, write a new forward
    # migration that flips only explicitly chosen rows.
    pass
