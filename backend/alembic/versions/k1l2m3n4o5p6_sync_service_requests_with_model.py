"""sync service_requests with current model

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-03-16 22:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, Sequence[str], None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Bring service_requests in line with the current ORM model."""
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_type
                WHERE typname = 'requestpriority'
            ) THEN
                CREATE TYPE requestpriority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_type
                WHERE typname = 'requeststatus'
            ) AND NOT EXISTS (
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'requeststatus'
                  AND e.enumlabel = 'AWAITING_APPROVAL'
            ) THEN
                ALTER TYPE requeststatus ADD VALUE 'AWAITING_APPROVAL';
            END IF;
        END $$;
        """
    )

    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS line_user_id VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS province VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS district VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS sub_district VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS prefix VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS firstname VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS lastname VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS topic_category VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS topic_subcategory VARCHAR;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS attachments JSONB;")
    op.execute(
        """
        ALTER TABLE service_requests
        ADD COLUMN IF NOT EXISTS priority requestpriority DEFAULT 'MEDIUM';
        """
    )
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;")
    op.execute("ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS assigned_by_id INTEGER;")

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = 'public'
                  AND table_name = 'service_requests'
                  AND constraint_name = 'service_requests_assigned_by_id_fkey'
            ) THEN
                ALTER TABLE service_requests
                ADD CONSTRAINT service_requests_assigned_by_id_fkey
                FOREIGN KEY (assigned_by_id) REFERENCES users(id);
            END IF;
        END $$;
        """
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_service_requests_line_user_id ON service_requests (line_user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_service_requests_priority ON service_requests (priority);"
    )


def downgrade() -> None:
    """Best-effort downgrade for columns added by this migration."""
    op.execute("DROP INDEX IF EXISTS ix_service_requests_priority;")
    op.execute("DROP INDEX IF EXISTS ix_service_requests_line_user_id;")
    op.execute(
        """
        ALTER TABLE service_requests
        DROP CONSTRAINT IF EXISTS service_requests_assigned_by_id_fkey;
        """
    )

    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS assigned_by_id;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS completed_at;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS due_date;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS priority;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS attachments;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS topic_subcategory;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS topic_category;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS lastname;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS firstname;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS prefix;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS sub_district;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS district;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS province;")
    op.execute("ALTER TABLE service_requests DROP COLUMN IF EXISTS line_user_id;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_type
                WHERE typname = 'requestpriority'
            ) THEN
                DROP TYPE requestpriority;
            END IF;
        END $$;
        """
    )
