"""create taxonomy categories and topics with frozen seed"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "babccf229c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TOPIC_SEED: dict[str, list[str]] = {
    "แจ้งเบาะแสยาเสพติด": [
        "ปัญหายาเสพติด",
        "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย",
        "ขอความช่วยเหลือบำบัดผู้เสพ",
        "ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด",
    ],
    "กองทุนยุติธรรม": [
        "ค่าจ้างทนายความ",
        "ค่าธรรมเนียมศาล",
        "เงินประกันตัว",
        "อื่นๆ",
    ],
    "เงินเยียวยาเหยื่ออาชญากรรม": [
        "กรณีถูกทำร้ายร่างกาย/ถูกลูกหลง",
        "กรณีอุบัติเหตุจราจร",
        "กรณีอุบัติเหตุอื่นๆ/ไม่ทราบผู้กระทำผิด",
        "อื่นๆ",
    ],
    "พยานในคดีอาญา": [
        "ค่าพาหนะ/ค่าที่พัก/ค่าอาหาร (พยาน)",
        "ค่าตอบแทนความเสียหาย (พยาน)",
        "การคุ้มครองพยาน",
    ],
    "ไกล่เกลี่ยระงับข้อพิพาท": [
        "หนี้สิน",
        "ที่ดิน",
        "มรดก",
        "อื่นๆ",
    ],
    "รับเรื่องราวร้องทุกข์": [
        "ขอถวายฎีกา/รื้อฟื้นคดี",
        "การบังคับคดี",
        "ความขัดแย้งกับหน่วยงานรัฐ",
        "อื่นๆ",
    ],
    "ให้คำปรึกษากฎหมาย": [
        "แพ่ง",
        "อาญา",
        "อื่นๆ",
    ],
}


def _has_table(connection, table_name: str) -> bool:
    return sa.inspect(connection).has_table(table_name)


def upgrade() -> None:
    connection = op.get_bind()

    if not _has_table(connection, "taxonomy_categories"):
        op.create_table(
            "taxonomy_categories",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("name", name="uq_taxonomy_categories_name"),
        )
        op.create_index("ix_taxonomy_categories_name", "taxonomy_categories", ["name"])
        op.create_index(
            "ix_taxonomy_categories_sort_order", "taxonomy_categories", ["sort_order"]
        )

    if not _has_table(connection, "taxonomy_topics"):
        op.create_table(
            "taxonomy_topics",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "category_id",
                sa.Integer(),
                sa.ForeignKey("taxonomy_categories.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("category_id", "name", name="uq_taxonomy_topics_category_name"),
        )
        op.create_index("ix_taxonomy_topics_category_id", "taxonomy_topics", ["category_id"])
        op.create_index(
            "ix_taxonomy_topics_sort_order", "taxonomy_topics", ["sort_order"]
        )

    for cat_order, (category_name, topics) in enumerate(TOPIC_SEED.items()):
        row = connection.execute(
            sa.text("SELECT id FROM taxonomy_categories WHERE name = :name"),
            {"name": category_name},
        ).fetchone()
        if row is None:
            row = connection.execute(
                sa.text(
                    "INSERT INTO taxonomy_categories (name, sort_order, is_active)"
                    " VALUES (:name, :sort_order, true) RETURNING id"
                ),
                {"name": category_name, "sort_order": cat_order},
            ).fetchone()
        category_id = row[0]
        for topic_order, topic_name in enumerate(topics):
            exists = connection.execute(
                sa.text(
                    "SELECT 1 FROM taxonomy_topics"
                    " WHERE category_id = :cid AND name = :name"
                ),
                {"cid": category_id, "name": topic_name},
            ).fetchone()
            if exists is None:
                connection.execute(
                    sa.text(
                        "INSERT INTO taxonomy_topics"
                        " (category_id, name, sort_order, is_active)"
                        " VALUES (:cid, :name, :sort_order, true)"
                    ),
                    {
                        "cid": category_id,
                        "name": topic_name,
                        "sort_order": topic_order,
                    },
                )


def downgrade() -> None:
    connection = op.get_bind()
    if _has_table(connection, "taxonomy_topics"):
        op.drop_table("taxonomy_topics")
    if _has_table(connection, "taxonomy_categories"):
        op.drop_table("taxonomy_categories")
