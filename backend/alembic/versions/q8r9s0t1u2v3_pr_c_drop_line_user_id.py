"""PR C: drop plaintext line_user_id from 7 tables

Revision ID: q8r9s0t1u2v3
Revises: e6f7g8h9i0j1
Create Date: 2026-08-16

Destructive phase of the LINE ID pseudonymization contract.

Drops the plaintext ``line_user_id`` column (and its indexes) from:
  users, messages, chat_sessions, service_requests, friend_events,
  csat_responses, user_rich_menu_links

All user_id-based indexes already exist (b3c4d5e6f7g8 created
``ix_<table>_user_id`` for the 6 child tables; d5e6f7g8h9i0 created
``uq_chat_sessions_one_open_per_user`` and ``uq_user_rich_menu_links_user_id``),
so this migration only adds ``ix_messages_user_created`` on
``(user_id, created_at DESC)`` to replace the line_user_id-based composite.

The ``daily_message_stats`` materialized view references
``messages.line_user_id``; it is recreated keyed on ``user_id`` so no raw
LINE ID remains at rest. No application code reads this view today.

Hand-written (never autogenerate — ORM/live-schema drift, PR #183 lesson).
Requires LINE_ID_STORAGE_MODE != "plaintext" as a runtime precondition:
the dual-write/fallback code must already be gone from the running app.

Downgrade restores column/index shape (nullable, no data — plaintext values
are not recoverable from the DB once dropped).
"""
from typing import Sequence, Union

import os

from alembic import op
import sqlalchemy as sa


revision: str = "q8r9s0t1u2v3"
down_revision: Union[str, Sequence[str], None] = "e6f7g8h9i0j1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MV_NAME = "daily_message_stats"

MV_SQL_USER_ID = sa.text(
    """
    CREATE MATERIALIZED VIEW daily_message_stats AS
    SELECT
        date_trunc('day', created_at) AS day,
        user_id,
        COUNT(*) AS message_count,
        COUNT(*) FILTER (WHERE direction = 'INCOMING') AS incoming_count,
        COUNT(*) FILTER (WHERE direction = 'OUTGOING') AS outgoing_count
    FROM messages
    GROUP BY 1, 2
    """
)

MV_SQL_LINE_USER_ID = sa.text(
    """
    CREATE MATERIALIZED VIEW daily_message_stats AS
    SELECT
        date_trunc('day', created_at) AS day,
        line_user_id,
        COUNT(*) AS message_count,
        COUNT(*) FILTER (WHERE direction = 'INCOMING') AS incoming_count,
        COUNT(*) FILTER (WHERE direction = 'OUTGOING') AS outgoing_count
    FROM messages
    GROUP BY 1, 2
    """
)


def _assert_not_plaintext() -> None:
    mode = os.environ.get("LINE_ID_STORAGE_MODE", "plaintext")
    assert mode != "plaintext", (
        "PR C cannot run while LINE_ID_STORAGE_MODE=plaintext — "
        "backfill/cutover incomplete"
    )


def _has_column(conn, table: str, column: str) -> bool:
    return bool(conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar())


def _has_index(conn, index: str) -> bool:
    return bool(conn.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :i"),
        {"i": index},
    ).scalar())


def _mv_exists(conn) -> bool:
    return bool(conn.execute(
        sa.text(
            "SELECT 1 FROM pg_matviews "
            "WHERE schemaname = 'public' AND matviewname = :n"
        ),
        {"n": MV_NAME},
    ).scalar())


def upgrade() -> None:
    _assert_not_plaintext()
    conn = op.get_bind()

    # MV depends on messages.line_user_id — rebuild it on user_id first.
    if _mv_exists(conn):
        op.execute(sa.text(f"DROP MATERIALIZED VIEW {MV_NAME} CASCADE"))
        op.execute(MV_SQL_USER_ID)
        op.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_message_stats_day_user "
            "ON daily_message_stats(day, user_id)"
        ))
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS idx_daily_message_stats_day "
            "ON daily_message_stats(day)"
        ))

    # --- messages ---
    if _has_column(conn, "messages", "line_user_id"):
        if _has_index(conn, "ix_messages_line_user_id"):
            op.drop_index("ix_messages_line_user_id", table_name="messages")
        if _has_index(conn, "idx_messages_user_created"):
            op.drop_index("idx_messages_user_created", table_name="messages")
        if not _has_index(conn, "ix_messages_user_created"):
            op.create_index(
                "ix_messages_user_created", "messages",
                ["user_id", sa.text("created_at DESC")],
            )
        op.drop_column("messages", "line_user_id")

    # --- chat_sessions ---
    if _has_column(conn, "chat_sessions", "line_user_id"):
        for idx in ("ix_chat_sessions_line_user_id", "uq_chat_sessions_one_open_per_line_user"):
            if _has_index(conn, idx):
                op.drop_index(idx, table_name="chat_sessions")
        op.drop_column("chat_sessions", "line_user_id")

    # --- service_requests / friend_events / csat_responses ---
    # ix_<table>_user_id already exists (b3c4d5e6f7g8).
    for table in ("service_requests", "friend_events", "csat_responses"):
        if _has_column(conn, table, "line_user_id"):
            if _has_index(conn, f"ix_{table}_line_user_id"):
                op.drop_index(f"ix_{table}_line_user_id", table_name=table)
            op.drop_column(table, "line_user_id")

    # --- user_rich_menu_links ---
    # uq_user_rich_menu_links_user_id already exists (d5e6f7g8h9i0).
    if _has_column(conn, "user_rich_menu_links", "line_user_id"):
        if _has_index(conn, "ix_user_rich_menu_links_line_user_id"):
            op.drop_index(
                "ix_user_rich_menu_links_line_user_id",
                table_name="user_rich_menu_links",
            )
        op.drop_column("user_rich_menu_links", "line_user_id")

    # --- users ---
    if _has_column(conn, "users", "line_user_id"):
        if _has_index(conn, "ix_users_line_user_id"):
            op.drop_index("ix_users_line_user_id", table_name="users")
        op.drop_column("users", "line_user_id")


def downgrade() -> None:
    conn = op.get_bind()

    # --- users ---
    if not _has_column(conn, "users", "line_user_id"):
        op.add_column("users", sa.Column("line_user_id", sa.String(), nullable=True))
        if not _has_index(conn, "ix_users_line_user_id"):
            op.create_index(
                "ix_users_line_user_id", "users", ["line_user_id"], unique=True
            )

    # --- user_rich_menu_links ---
    if not _has_column(conn, "user_rich_menu_links", "line_user_id"):
        op.add_column(
            "user_rich_menu_links",
            sa.Column("line_user_id", sa.String(length=50), nullable=True),
        )
        if not _has_index(conn, "ix_user_rich_menu_links_line_user_id"):
            op.create_index(
                "ix_user_rich_menu_links_line_user_id",
                "user_rich_menu_links", ["line_user_id"], unique=True,
            )

    # --- service_requests / friend_events / csat_responses ---
    for table, col_type in (
        ("service_requests", sa.String()),
        ("friend_events", sa.String(length=50)),
        ("csat_responses", sa.String(length=50)),
    ):
        if not _has_column(conn, table, "line_user_id"):
            op.add_column(table, sa.Column("line_user_id", col_type, nullable=True))
            if not _has_index(conn, f"ix_{table}_line_user_id"):
                op.create_index(
                    f"ix_{table}_line_user_id", table, ["line_user_id"], unique=False
                )

    # --- chat_sessions ---
    if not _has_column(conn, "chat_sessions", "line_user_id"):
        op.add_column(
            "chat_sessions",
            sa.Column("line_user_id", sa.String(length=50), nullable=True),
        )
        if not _has_index(conn, "ix_chat_sessions_line_user_id"):
            op.create_index(
                "ix_chat_sessions_line_user_id", "chat_sessions",
                ["line_user_id"], unique=False,
            )

    # --- messages ---
    if not _has_column(conn, "messages", "line_user_id"):
        if _has_index(conn, "ix_messages_user_created"):
            op.drop_index("ix_messages_user_created", table_name="messages")
        op.add_column("messages", sa.Column("line_user_id", sa.String(), nullable=True))
        if not _has_index(conn, "ix_messages_line_user_id"):
            op.create_index(
                "ix_messages_line_user_id", "messages", ["line_user_id"], unique=False
            )
        if not _has_index(conn, "idx_messages_user_created"):
            op.execute(sa.text(
                "CREATE INDEX idx_messages_user_created "
                "ON messages (line_user_id, created_at DESC)"
            ))

    # Restore the MV to its original line_user_id-keyed shape.
    if _mv_exists(conn):
        op.execute(sa.text(f"DROP MATERIALIZED VIEW {MV_NAME} CASCADE"))
    op.execute(MV_SQL_LINE_USER_ID)
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_message_stats_day_user "
        "ON daily_message_stats(day, line_user_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_daily_message_stats_day "
        "ON daily_message_stats(day)"
    ))
