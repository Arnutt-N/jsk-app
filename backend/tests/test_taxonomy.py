"""Shared taxonomy tests — Unit 1: frozen seed equality (authoring-time).

The migration seed is a literal frozen copy of
frontend/lib/constants/categories.ts TOPIC_OPTIONS. This test hardcodes the
same literal so any drift in the migration file fails fast. It needs no DB.
"""

import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "d7e8f9a0b1c2_create_taxonomy_tables.py"
    )
    spec = importlib.util.spec_from_file_location("_taxonomy_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TOPIC_SEED = _load_migration().TOPIC_SEED


EXPECTED_TOPIC_OPTIONS: dict[str, list[str]] = {
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


def test_seed_matches_frozen_frontend_options():
    assert TOPIC_SEED == EXPECTED_TOPIC_OPTIONS


def test_seed_encodes_exactly_two_levels():
    assert len(TOPIC_SEED) == 7
    for category, topics in TOPIC_SEED.items():
        assert category.strip(), "category name must be non-empty"
        assert isinstance(topics, list) and topics, "each category needs topics"
        for topic in topics:
            assert isinstance(topic, str) and topic.strip()
    assert len(set(TOPIC_SEED)) == len(TOPIC_SEED)
