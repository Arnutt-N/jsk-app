"""richmenu alias + per-user link tables

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-06-20

Adds two local-cache tables for Rich Menu tab switching + per-user assignment:
  - rich_menu_aliases    : alias_id -> rich_menu (for `richmenuswitch` actions)
  - user_rich_menu_links : line_user_id -> rich_menu (per-user override)

Both reference rich_menus.id with ON DELETE RESTRICT so a menu cannot be
deleted out from under an alias/assignment (the API also pre-checks and
returns 409). Per-table existence guards make the migration safe to re-run
after a partial apply.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 't0u1v2w3x4y5'
down_revision: Union[str, Sequence[str], None] = 's9t0u1v2w3x4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(conn, name: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :n)"
    ), {"n": name}).scalar())


def upgrade() -> None:
    conn = op.get_bind()

    if not _has_table(conn, 'rich_menu_aliases'):
        op.create_table(
            'rich_menu_aliases',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('alias_id', sa.String(), nullable=False),
            sa.Column('rich_menu_id', sa.Integer(), nullable=False),
            sa.Column('sync_status', sa.String(), nullable=True, server_default='PENDING'),
            sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_sync_error', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['rich_menu_id'], ['rich_menus.id'], ondelete='RESTRICT'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_rich_menu_aliases_id'), 'rich_menu_aliases', ['id'], unique=False)
        op.create_index(op.f('ix_rich_menu_aliases_alias_id'), 'rich_menu_aliases', ['alias_id'], unique=True)
        op.create_index(op.f('ix_rich_menu_aliases_rich_menu_id'), 'rich_menu_aliases', ['rich_menu_id'], unique=False)

    # Independent guard (guards against a partial apply of the first table).
    if not _has_table(conn, 'user_rich_menu_links'):
        op.create_table(
            'user_rich_menu_links',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('line_user_id', sa.String(length=50), nullable=False),
            sa.Column('rich_menu_id', sa.Integer(), nullable=False),
            sa.Column('sync_status', sa.String(), nullable=True, server_default='PENDING'),
            sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_sync_error', sa.Text(), nullable=True),
            sa.Column('linked_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['rich_menu_id'], ['rich_menus.id'], ondelete='RESTRICT'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_user_rich_menu_links_id'), 'user_rich_menu_links', ['id'], unique=False)
        op.create_index(op.f('ix_user_rich_menu_links_line_user_id'), 'user_rich_menu_links', ['line_user_id'], unique=True)
        op.create_index(op.f('ix_user_rich_menu_links_rich_menu_id'), 'user_rich_menu_links', ['rich_menu_id'], unique=False)


def downgrade() -> None:
    conn = op.get_bind()

    # Drop child-style table first; FK RESTRICT blocks DELETE on parent rows,
    # not DROP TABLE, so order here is for cleanliness/idempotency.
    if _has_table(conn, 'user_rich_menu_links'):
        op.drop_index(op.f('ix_user_rich_menu_links_rich_menu_id'), table_name='user_rich_menu_links')
        op.drop_index(op.f('ix_user_rich_menu_links_line_user_id'), table_name='user_rich_menu_links')
        op.drop_index(op.f('ix_user_rich_menu_links_id'), table_name='user_rich_menu_links')
        op.drop_table('user_rich_menu_links')

    if _has_table(conn, 'rich_menu_aliases'):
        op.drop_index(op.f('ix_rich_menu_aliases_rich_menu_id'), table_name='rich_menu_aliases')
        op.drop_index(op.f('ix_rich_menu_aliases_alias_id'), table_name='rich_menu_aliases')
        op.drop_index(op.f('ix_rich_menu_aliases_id'), table_name='rich_menu_aliases')
        op.drop_table('rich_menu_aliases')
