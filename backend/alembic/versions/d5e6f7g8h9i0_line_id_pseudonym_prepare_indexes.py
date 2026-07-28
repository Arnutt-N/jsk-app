"""prepare unique indexes on user_id FK for pseudonym mode

Revision ID: d5e6f7g8h9i0
Revises: c4d5e6f7g8h9
Create Date: 2026-07-28

Prepare phase of the LINE ID pseudonymization contract.
Creates user_id-based unique/partial-unique indexes that mirror the existing
line_user_id-based constraints, so that when LINE_ID_STORAGE_MODE flips to
"pseudonym" the same uniqueness guarantees are enforced via the FK path.

Also validates data integrity: all users with a plaintext line_user_id must
have a populated line_user_id_hash (backfill complete).

Indexes created:
  - uq_chat_sessions_one_open_per_user  (partial unique: user_id WHERE open)
  - uq_user_rich_menu_links_user_id     (unique: user_id)

No columns dropped, no existing indexes removed — safe to run alongside
the current dual-mode production traffic.

Downgrade: drops the two new indexes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7g8h9i0"
down_revision: Union[str, None] = "c4d5e6f7g8h9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IX_OPEN_SESSION = "uq_chat_sessions_one_open_per_user"
IX_RICH_MENU = "uq_user_rich_menu_links_user_id"


def _index_exists(connection, index_name: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :name)"
        ),
        {"name": index_name},
    )
    return bool(result.scalar())


def _assert_backfill_complete(connection) -> None:
    """All users with plaintext line_user_id must have a hash populated."""
    row = connection.execute(
        sa.text(
            """
            SELECT COUNT(*) FROM users
            WHERE line_user_id IS NOT NULL
              AND line_user_id_hash IS NULL
            """
        )
    ).scalar()
    if row and row > 0:
        raise RuntimeError(
            f"Cannot prepare pseudonym indexes: {row} user(s) have "
            "line_user_id but NULL line_user_id_hash. Run the backfill "
            "before applying this migration."
        )


def _assert_no_duplicate_open_sessions_by_user(connection) -> None:
    duplicates = connection.execute(
        sa.text(
            """
            SELECT user_id, COUNT(*) AS cnt
            FROM chat_sessions
            WHERE status IN ('WAITING', 'ACTIVE')
              AND user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """
        )
    ).fetchall()
    if duplicates:
        sample = ", ".join(f"user_id={r.user_id} ({r.cnt})" for r in duplicates)
        raise RuntimeError(
            f"Cannot create {IX_OPEN_SESSION}: duplicate open sessions "
            f"per user exist: {sample}. Close duplicates first."
        )


def _assert_no_duplicate_rich_menu_links(connection) -> None:
    duplicates = connection.execute(
        sa.text(
            """
            SELECT user_id, COUNT(*) AS cnt
            FROM user_rich_menu_links
            WHERE user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """
        )
    ).fetchall()
    if duplicates:
        sample = ", ".join(f"user_id={r.user_id} ({r.cnt})" for r in duplicates)
        raise RuntimeError(
            f"Cannot create {IX_RICH_MENU}: duplicate rich menu links "
            f"per user exist: {sample}. Deduplicate first."
        )


def upgrade() -> None:
    connection = op.get_bind()

    _assert_backfill_complete(connection)

    if not _index_exists(connection, IX_OPEN_SESSION):
        _assert_no_duplicate_open_sessions_by_user(connection)
        op.create_index(
            IX_OPEN_SESSION,
            "chat_sessions",
            ["user_id"],
            unique=True,
            postgresql_where=sa.text("status IN ('WAITING', 'ACTIVE') AND user_id IS NOT NULL"),
        )

    if not _index_exists(connection, IX_RICH_MENU):
        _assert_no_duplicate_rich_menu_links(connection)
        op.create_index(
            IX_RICH_MENU,
            "user_rich_menu_links",
            ["user_id"],
            unique=True,
            postgresql_where=sa.text("user_id IS NOT NULL"),
        )


def downgrade() -> None:
    connection = op.get_bind()
    if _index_exists(connection, IX_RICH_MENU):
        op.drop_index(IX_RICH_MENU, table_name="user_rich_menu_links")
    if _index_exists(connection, IX_OPEN_SESSION):
        op.drop_index(IX_OPEN_SESSION, table_name="chat_sessions")
