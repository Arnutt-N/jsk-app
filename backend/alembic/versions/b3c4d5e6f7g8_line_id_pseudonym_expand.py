"""add line_id pseudonymization columns (expand phase)

Revision ID: b3c4d5e6f7g8
Revises: a2b3c4d5e6f7
Create Date: 2026-07-21

PR A (Expand) of the LINE user ID pseudonymization rollout
(LINE_ID_STORAGE_MODE flag, mirrors COOKIE_AUTH_MODE pattern).

Adds to ``users``:
  - line_user_id_hash   String(64) UNIQUE INDEX NULLABLE  (HMAC-SHA256)
  - line_user_id_encrypted  Text NULLABLE                 (Fernet token)
  - line_key_version    Integer NOT NULL DEFAULT 1

Adds ``user_id`` (Integer FK users.id, indexed, nullable) to 6 child tables:
  messages, chat_sessions, service_requests, friend_events,
  csat_responses, user_rich_menu_links.

Purely additive — no columns dropped, no constraints tightened.
Existing plaintext ``line_user_id`` columns and their indexes are untouched.
The unique/partial-unique indexes on ``user_id`` are deferred to PR C (contract).

Idempotent: existence guards skip already-present columns/indexes.
Downgrade: drops the new indexes then columns (safe reverse of additive).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c4d5e6f7g8"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CHILD_TABLES = [
    "messages",
    "chat_sessions",
    "service_requests",
    "friend_events",
    "csat_responses",
    "user_rich_menu_links",
]


def _column_exists(connection, table: str, column: str) -> bool:
    insp = sa.inspect(connection)
    if not insp.has_table(table):
        return False
    return column in [c["name"] for c in insp.get_columns(table)]


def _index_exists(connection, index_name: str) -> bool:
    insp = sa.inspect(connection)
    return index_name in [ix["name"] for ix in insp.get_indexes("users")]


def upgrade() -> None:
    connection = op.get_bind()

    # --- users: 3 new columns ---
    if not _column_exists(connection, "users", "line_user_id_hash"):
        op.add_column("users", sa.Column("line_user_id_hash", sa.String(64), nullable=True))
    if not _index_exists(connection, "ix_users_line_user_id_hash"):
        op.create_index("ix_users_line_user_id_hash", "users", ["line_user_id_hash"], unique=True)

    if not _column_exists(connection, "users", "line_user_id_encrypted"):
        op.add_column("users", sa.Column("line_user_id_encrypted", sa.Text(), nullable=True))

    if not _column_exists(connection, "users", "line_key_version"):
        op.add_column(
            "users",
            sa.Column("line_key_version", sa.Integer(), nullable=False, server_default="1"),
        )

    # --- 6 child tables: user_id FK + index ---
    for table in _CHILD_TABLES:
        if not _column_exists(connection, table, "user_id"):
            op.add_column(table, sa.Column("user_id", sa.Integer(), nullable=True))
            op.create_foreign_key(
                f"fk_{table}_user_id_users", table, "users", ["user_id"], ["id"]
            )
        idx_name = f"ix_{table}_user_id"
        insp = sa.inspect(connection)
        existing_indexes = [ix["name"] for ix in insp.get_indexes(table)]
        if idx_name not in existing_indexes:
            op.create_index(idx_name, table, ["user_id"])


def downgrade() -> None:
    for table in reversed(_CHILD_TABLES):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_constraint(f"fk_{table}_user_id_users", table, type_="foreignkey")
        op.drop_column(table, "user_id")

    op.drop_index("ix_users_line_user_id_hash", table_name="users")
    op.drop_column("users", "line_key_version")
    op.drop_column("users", "line_user_id_encrypted")
    op.drop_column("users", "line_user_id_hash")
