"""ensure one open chat session per LINE user

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-07-02

Adds a partial unique index so a LINE user cannot have more than one
WAITING/ACTIVE live-chat session. This closes the race where concurrent
handoff/create flows can both observe "no active session" and insert duplicate
open sessions before either transaction commits.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "v2w3x4y5z6a7"
down_revision: Union[str, None] = "u1v2w3x4y5z6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "uq_chat_sessions_one_open_per_line_user"


def _index_exists(connection, index_name: str) -> bool:
    result = connection.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :index_name)"
        ),
        {"index_name": index_name},
    )
    return bool(result.scalar())


def _assert_no_duplicate_open_sessions(connection) -> None:
    duplicates = connection.execute(
        sa.text(
            """
            SELECT line_user_id, COUNT(*) AS open_count
            FROM chat_sessions
            WHERE status IN ('WAITING', 'ACTIVE')
            GROUP BY line_user_id
            HAVING COUNT(*) > 1
            LIMIT 10
            """
        )
    ).fetchall()
    if duplicates:
        sample = ", ".join(
            f"{row.line_user_id} ({row.open_count})" for row in duplicates
        )
        raise RuntimeError(
            "Cannot create uq_chat_sessions_one_open_per_line_user while "
            f"duplicate open chat sessions exist: {sample}. Close or merge "
            "duplicates before applying this migration."
        )


def upgrade() -> None:
    connection = op.get_bind()
    if _index_exists(connection, INDEX_NAME):
        return

    _assert_no_duplicate_open_sessions(connection)
    op.create_index(
        INDEX_NAME,
        "chat_sessions",
        ["line_user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('WAITING', 'ACTIVE')"),
    )


def downgrade() -> None:
    connection = op.get_bind()
    if _index_exists(connection, INDEX_NAME):
        op.drop_index(INDEX_NAME, table_name="chat_sessions")
