"""rich_menus display settings (additive expand phase)

Adds display_mode / display_start_at / display_end_at for OA Manager-style
display control (PRD 2026-09-02-rich-menu-display-schedule): ALWAYS keeps the
pre-PR behavior for every existing row via the server default, SCHEDULED is
driven by the display scheduler task, MANUAL never auto-publishes.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-02
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rich_menus",
        sa.Column(
            "display_mode",
            sa.String(9),
            nullable=False,
            server_default="ALWAYS",
        ),
    )
    op.add_column("rich_menus", sa.Column("display_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rich_menus", sa.Column("display_end_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("rich_menus", "display_end_at")
    op.drop_column("rich_menus", "display_start_at")
    op.drop_column("rich_menus", "display_mode")
