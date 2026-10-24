"""Partial unique indexes so hidden rows stop squatting names (follow-up batch).

User decision 2026-10-23 (Q1... revisited as follow-up #2): hidden rows are
kept forever (never delete), so a plain UNIQUE on (name) permanently burns
every hidden name. These partial indexes enforce uniqueness only among
VISIBLE rows (`WHERE is_active`), letting an admin reuse a hidden name
while history stays intact.

Tables touched: intent_categories(name), taxonomy_categories(name),
taxonomy_topics(category_id, name). intent_keywords and auto_replies have
no DB-level uniqueness (keyword checks live in the endpoints, now scoped
to active rows) — nothing to do here for them.

Downgrade note: re-creating the plain UNIQUE constraints fails if hidden
duplicates accumulated meanwhile. Resolve (rename/remove the hidden rows)
before downgrading past this revision.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "intent_categories_name_key", "intent_categories", type_="unique"
    )
    op.create_index(
        "uq_intent_categories_name_active",
        "intent_categories",
        ["name"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.drop_constraint(
        "uq_taxonomy_categories_name", "taxonomy_categories", type_="unique"
    )
    op.create_index(
        "uq_taxonomy_categories_name_active",
        "taxonomy_categories",
        ["name"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.drop_constraint(
        "uq_taxonomy_topics_category_name", "taxonomy_topics", type_="unique"
    )
    op.create_index(
        "uq_taxonomy_topics_category_name_active",
        "taxonomy_topics",
        ["category_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_taxonomy_topics_category_name_active", table_name="taxonomy_topics"
    )
    op.create_unique_constraint(
        "uq_taxonomy_topics_category_name",
        "taxonomy_topics",
        ["category_id", "name"],
    )

    op.drop_index(
        "uq_taxonomy_categories_name_active", table_name="taxonomy_categories"
    )
    op.create_unique_constraint(
        "uq_taxonomy_categories_name", "taxonomy_categories", ["name"]
    )

    op.drop_index(
        "uq_intent_categories_name_active", table_name="intent_categories"
    )
    op.create_unique_constraint(
        "intent_categories_name_key", "intent_categories", ["name"]
    )
