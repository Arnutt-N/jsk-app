"""add geography tables (provinces, districts, sub_districts)

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-07-18

Adopts the three Thai-address reference tables that the ORM models in
`app.models.geography` have always declared but which no migration ever
created — the remaining live-schema drift from
docs/remediation/preflight-evidence-and-designs.md §8 (broadcasts, the fourth,
was fixed by `y0z1a2b3c4d5`).

IMPORTANT — unlike the broadcasts drift, these tables ALREADY EXIST and are
fully seeded on every live environment (verified 2026-07-18: provinces=77,
districts=928, sub_districts=7436 on both local docker and Supabase PROD; the
public `/api/v1/locations/*` endpoints return 200 with data). So this is an
"adoption" migration: on existing DBs `upgrade()` no-ops (guarded by a table
existence check) and Alembic simply records the revision as applied; on a
fresh DB built purely from migrations it creates the schema so the location
dropdowns work. The 8k+ rows of seed data are NOT part of this migration —
they are loaded by the separate geography seed step.

The `create_table` definitions mirror the LIVE schema (the source of truth for
what exists), not the ORM model, where they differ: the live FK columns
`districts.province_id` and `sub_districts.district_id` are NULLABLE, whereas
the model declares them `nullable=False`. Harmonising the model and the live
schema is a separate follow-up (do not silently NOT NULL live columns here).

`downgrade()` is intentionally a no-op: these are pre-existing seeded reference
tables that predate migration tracking, and dropping them would destroy the
seed data (which has no other migration-tracked source). Tearing a DB fully
down to base is not a real workflow here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "z1a2b3c4d5e6"
down_revision: Union[str, None] = "y0z1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(connection, table_name: str) -> bool:
    return sa.inspect(connection).has_table(table_name)


def upgrade() -> None:
    connection = op.get_bind()

    if not _has_table(connection, "provinces"):
        op.create_table(
            "provinces",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name_th", sa.String(), nullable=False),
            sa.Column("name_en", sa.String(), nullable=True),
        )
        op.create_index("ix_provinces_name_th", "provinces", ["name_th"])

    if not _has_table(connection, "districts"):
        op.create_table(
            "districts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "province_id",
                sa.Integer(),
                sa.ForeignKey("provinces.id"),
                nullable=True,
            ),
            sa.Column("name_th", sa.String(), nullable=False),
            sa.Column("name_en", sa.String(), nullable=True),
            sa.Column("code", sa.String(), nullable=True),
        )
        op.create_index("ix_districts_name_th", "districts", ["name_th"])
        op.create_index("ix_districts_province_id", "districts", ["province_id"])

    if not _has_table(connection, "sub_districts"):
        op.create_table(
            "sub_districts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "district_id",
                sa.Integer(),
                sa.ForeignKey("districts.id"),
                nullable=True,
            ),
            sa.Column("name_th", sa.String(), nullable=False),
            sa.Column("name_en", sa.String(), nullable=True),
            sa.Column("postal_code", sa.String(), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
        )
        op.create_index("ix_sub_districts_name_th", "sub_districts", ["name_th"])
        op.create_index(
            "ix_sub_districts_district_id", "sub_districts", ["district_id"]
        )


def downgrade() -> None:
    # Intentional no-op: see module docstring. These reference tables hold seed
    # data on all live environments and predate migration tracking; dropping
    # them on downgrade would be data loss with no migration-tracked recovery.
    pass
