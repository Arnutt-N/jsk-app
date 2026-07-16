"""index expires_at on auth_sessions and ws_tickets

Revision ID: x9y0z1a2b3c4
Revises: w3x4y5z6a7b8
Create Date: 2026-07-16

Indexes `expires_at` on `auth_sessions` and `ws_tickets` so the opportunistic
retention DELETEs in `auth_session_service.mint_ws_ticket`
(`DELETE ... WHERE expires_at < now - retention`) use an index scan instead of a
sequential scan as the tables grow. NEW-2 from the PR 2A round-2 review: these
tables were created by `w3x4y5z6a7b8` with indexes only on `token_hash`,
`user_id` (and `family_id` for auth_sessions); `expires_at` was unindexed, so
every ws-ticket mint scanned the whole table on the retention cutoff.

Additive-only; `downgrade()` drops just these two indexes. Idempotent: each
create/drop is guarded by an inspect of existing index names so re-running
upgrade against a DB that already has the index (e.g. a partial manual apply)
is a no-op rather than an error.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "x9y0z1a2b3c4"
down_revision: Union[str, None] = "w3x4y5z6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_indexes(connection, table_name: str) -> set:
    """Return the set of index names currently on `table_name`."""
    inspector = sa.inspect(connection)
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    connection = op.get_bind()

    # auth_sessions.expires_at
    auth_indexes = _existing_indexes(connection, "auth_sessions")
    if "ix_auth_sessions_expires_at" not in auth_indexes:
        op.create_index(
            "ix_auth_sessions_expires_at",
            "auth_sessions",
            ["expires_at"],
        )

    # ws_tickets.expires_at
    ws_indexes = _existing_indexes(connection, "ws_tickets")
    if "ix_ws_tickets_expires_at" not in ws_indexes:
        op.create_index(
            "ix_ws_tickets_expires_at",
            "ws_tickets",
            ["expires_at"],
        )


def downgrade() -> None:
    connection = op.get_bind()

    auth_indexes = _existing_indexes(connection, "auth_sessions")
    if "ix_auth_sessions_expires_at" in auth_indexes:
        op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")

    ws_indexes = _existing_indexes(connection, "ws_tickets")
    if "ix_ws_tickets_expires_at" in ws_indexes:
        op.drop_index("ix_ws_tickets_expires_at", table_name="ws_tickets")
