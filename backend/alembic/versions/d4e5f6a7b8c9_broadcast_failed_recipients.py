"""create broadcast_failed_recipients (C2 failed-token store)."""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "a7b8c9d0e1f2"  # single head verified 2026-09-22
# NOTE: plan said b8c9d0e1f2a3 but that ID is already taken by
# add_debt_mediation_requests — rebased to d4e5f6a7b8c9 (no other change).
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "broadcast_failed_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("broadcast_id", sa.Integer(),
                  sa.ForeignKey("broadcasts.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("broadcast_id", "token_hash",
                            name="uq_broadcast_failed_recipient"),
    )


def downgrade() -> None:
    op.drop_table("broadcast_failed_recipients")
