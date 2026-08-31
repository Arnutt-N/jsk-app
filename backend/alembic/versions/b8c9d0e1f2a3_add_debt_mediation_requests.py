"""add debt_mediation_requests table (LIFF ขอแก้หนี้)

Revision ID: b8c9d0e1f2a3
Revises: s0t1u2v3w4x5
Create Date: 2026-08-31

Creates the `debt_mediation_requests` table backing the new LIFF
`/liff/debt-mediation` page (ขอแก้หนี้ / แจ้งความประสงค์ไกล่เคลียหนี้),
replacing the external Google Form registration flow.

Two new native enum types are created:
- `debtparty`  — submitter role: DEBTOR (ลูกหนี้) / CREDITOR (เจ้าหนี้)
- `debttype`   — หนี้นอกระบบ (INFORMAL) / หนี้ในระบบ (FORMAL)

The `status` column reuses the EXISTING `requeststatus` pg type from
`service_requests` (create_type=False) so a future admin pipeline can follow
the same ServiceRequest lifecycle without a second workflow enum.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "s0t1u2v3w4x5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    postgresql.ENUM("DEBTOR", "CREDITOR", name="debtparty").create(
        op.get_bind(), checkfirst=True
    )

    postgresql.ENUM("INFORMAL", "FORMAL", name="debttype").create(
        op.get_bind(), checkfirst=True
    )

    # Reuse the existing requeststatus type created with service_requests.
    status_enum = postgresql.ENUM(
        "PENDING",
        "ACKNOWLEDGED",
        "IN_PROGRESS",
        "AWAITING_APPROVAL",
        "COMPLETED",
        "REJECTED",
        name="requeststatus",
        create_type=False,
    )

    op.create_table(
        "debt_mediation_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        # create_type=False: the enums are created/dropped explicitly above/below
        # with checkfirst, so create_table must not try to CREATE TYPE them again
        # (same gotcha documented in y0z1a2b3c4d5_add_broadcasts_table.py).
        sa.Column(
            "submitter_type",
            postgresql.ENUM("DEBTOR", "CREDITOR", name="debtparty", create_type=False),
            nullable=False,
        ),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("phone_number", sa.String(), nullable=False),
        sa.Column("province", sa.String(), nullable=False),
        sa.Column("sub_district", sa.String(), nullable=True),
        sa.Column("debt_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "debt_type",
            postgresql.ENUM("INFORMAL", "FORMAL", name="debttype", create_type=False),
            nullable=False,
        ),
        sa.Column("counterparty_name", sa.String(), nullable=False),
        sa.Column("interest_rate", sa.String(), nullable=True),
        sa.Column("issue_category", sa.String(), nullable=False),
        sa.Column("issue_other", sa.String(), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("status", status_enum, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_debt_mediation_requests_id", "debt_mediation_requests", ["id"]
    )
    op.create_index(
        "ix_debt_mediation_requests_user_id", "debt_mediation_requests", ["user_id"]
    )
    op.create_index(
        "ix_debt_mediation_requests_submitter_type",
        "debt_mediation_requests",
        ["submitter_type"],
    )
    op.create_index(
        "ix_debt_mediation_requests_status", "debt_mediation_requests", ["status"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_debt_mediation_requests_status", table_name="debt_mediation_requests"
    )
    op.drop_index(
        "ix_debt_mediation_requests_submitter_type",
        table_name="debt_mediation_requests",
    )
    op.drop_index(
        "ix_debt_mediation_requests_user_id", table_name="debt_mediation_requests"
    )
    op.drop_index("ix_debt_mediation_requests_id", table_name="debt_mediation_requests")
    op.drop_table("debt_mediation_requests")

    postgresql.ENUM(name="debttype").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="debtparty").drop(op.get_bind(), checkfirst=True)
