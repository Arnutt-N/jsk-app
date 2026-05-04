"""add ACKNOWLEDGED status and DIRECTOR/HEAD roles

Adds three enum values across two PostgreSQL ENUM types:
  - requeststatus: ACKNOWLEDGED (between PENDING and IN_PROGRESS in workflow)
  - userrole:     DIRECTOR, HEAD (between ADMIN and AGENT in privilege)

Data migration: any service_request currently in PENDING status with an
assigned_agent_id (i.e. a supervisor already assigned someone) is moved
to ACKNOWLEDGED. Rationale: the legacy system had no way to record
acknowledgement, so any assigned-but-not-yet-IN_PROGRESS row is
interpreted as "the assignee has implicitly acknowledged" -- safer than
leaving them in PENDING which now means "awaiting acknowledgement".

Notes on PostgreSQL constraints:
  - ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    Alembic wraps each migration in a transaction by default, so we use
    op.execute() with an explicit COMMIT to break out of the wrapping
    transaction before each ADD VALUE, then resume for data migration.
    Alternative: each ADD VALUE could live in its own migration file,
    but combining them keeps the deploy atomic (single alembic run).

Revision ID: m3n4o5p6q7r8
Revises: aafd62b6dfa5
Create Date: 2026-05-04 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "m3n4o5p6q7r8"
down_revision: Union[str, Sequence[str], None] = "aafd62b6dfa5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add ACKNOWLEDGED to requeststatus and DIRECTOR/HEAD to userrole.

    Idempotent: each ADD VALUE uses IF NOT EXISTS so re-running is safe.
    """
    # 1. Add ACKNOWLEDGED to requeststatus enum
    # IF NOT EXISTS makes this idempotent (safe to re-run)
    op.execute("ALTER TYPE requeststatus ADD VALUE IF NOT EXISTS 'ACKNOWLEDGED'")

    # 2. Add DIRECTOR and HEAD to userrole enum
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'DIRECTOR'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'HEAD'")

    # 3. Data migration: PENDING + has assignee -> ACKNOWLEDGED
    # Important: must commit the ALTER TYPE statements first so the new
    # 'ACKNOWLEDGED' value is visible in the same session.
    op.execute("COMMIT")

    op.execute(
        """
        UPDATE service_requests
        SET status = 'ACKNOWLEDGED'
        WHERE status = 'PENDING'
          AND assigned_agent_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Revert: collapse ACKNOWLEDGED back to PENDING.

    PostgreSQL does not support DROP VALUE on ENUM types, so we cannot
    fully remove the added values. The downgrade only reverts the data
    migration; the enum values remain orphaned but harmless.
    """
    # Revert data migration: ACKNOWLEDGED -> PENDING (assignee remains set)
    op.execute(
        """
        UPDATE service_requests
        SET status = 'PENDING'
        WHERE status = 'ACKNOWLEDGED'
        """
    )

    # Note: cannot DROP enum values in PostgreSQL. The added values
    # ACKNOWLEDGED, DIRECTOR, HEAD will linger in the type definition
    # but no rows will reference them after the data revert above.
    # If a clean revert is needed, recreate the ENUM type entirely.
