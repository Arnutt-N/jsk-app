"""add category, is_public, public_token, thumbnail_url to media_files

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-03-20 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "l2m3n4o5p6q7"
down_revision: Union[str, Sequence[str], None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the enum type first
    filecategory = sa.Enum(
        "DOCUMENT", "IMAGE", "VIDEO", "AUDIO", "OTHER",
        name="filecategory",
    )
    filecategory.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "media_files",
        sa.Column("category", filecategory, nullable=False, server_default="OTHER"),
    )
    op.add_column(
        "media_files",
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "media_files",
        sa.Column("public_token", sa.String(), nullable=True),
    )
    op.add_column(
        "media_files",
        sa.Column("thumbnail_url", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_media_files_public_token",
        "media_files",
        ["public_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_media_files_public_token", table_name="media_files")
    op.drop_column("media_files", "thumbnail_url")
    op.drop_column("media_files", "public_token")
    op.drop_column("media_files", "is_public")
    op.drop_column("media_files", "category")
    sa.Enum(name="filecategory").drop(op.get_bind(), checkfirst=True)
