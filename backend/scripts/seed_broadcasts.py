"""Seed sample broadcast records for demo/testing purposes."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts._script_safety import print_dry_run_hint, print_script_header


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed sample broadcast records.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to the active database.",
    )
    return parser


SAMPLE_BROADCASTS = [
    {
        "title": "แจ้งเตือนวันหยุดราชการ เดือนเมษายน 2569",
        "message_type": "text",
        "content": {"text": "สวัสดีครับ/ค่ะ ขอแจ้งวันหยุดราชการประจำเดือนเมษายน: วันที่ 6 (วันจักรี), 13-15 (สงกรานต์) ติดต่อสอบถามได้ทางแชทนะคะ"},
        "target_audience": "all",
        "status": "completed",
        "total_recipients": 1250,
        "success_count": 1230,
        "failure_count": 20,
        "sent_at_offset_days": -5,
    },
    {
        "title": "ประชาสัมพันธ์บริการใหม่ กองทุนยุติธรรม",
        "message_type": "text",
        "content": {"text": "เปิดให้บริการยื่นคำร้องกองทุนยุติธรรมผ่าน LINE OA แล้ววันนี้! กดเมนูด้านล่างเพื่อเริ่มต้น"},
        "target_audience": "all",
        "status": "completed",
        "total_recipients": 980,
        "success_count": 975,
        "failure_count": 5,
        "sent_at_offset_days": -12,
    },
    {
        "title": "แจ้งปิดปรับปรุงระบบชั่วคราว",
        "message_type": "text",
        "content": {"text": "ระบบจะปิดปรับปรุงชั่วคราว วันที่ 15 เม.ย. เวลา 22:00-06:00 น. ขออภัยในความไม่สะดวกค่ะ"},
        "target_audience": "all",
        "status": "scheduled",
        "total_recipients": 0,
        "success_count": 0,
        "failure_count": 0,
        "scheduled_at_offset_days": 3,
    },
    {
        "title": "ข่าวสารสิทธิประชาชน ฉบับที่ 4/2569",
        "message_type": "flex",
        "content": {"type": "bubble", "body": {"type": "box", "layout": "vertical", "contents": []}},
        "target_audience": "all",
        "status": "draft",
        "total_recipients": 0,
        "success_count": 0,
        "failure_count": 0,
    },
    {
        "title": "สำรวจความพึงพอใจการใช้บริการ",
        "message_type": "text",
        "content": {"text": "ขอเชิญร่วมตอบแบบสำรวจความพึงพอใจการใช้บริการ เพื่อนำไปพัฒนาบริการให้ดียิ่งขึ้น"},
        "target_audience": "all",
        "status": "draft",
        "total_recipients": 0,
        "success_count": 0,
        "failure_count": 0,
    },
]


async def seed_broadcasts(*, apply: bool) -> int:
    from sqlalchemy import func, select

    from app.db.session import AsyncSessionLocal
    from app.models.broadcast import Broadcast

    print_script_header("Seed sample broadcasts", apply=apply)

    if not apply:
        print_dry_run_hint()
        return 0

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count()).select_from(Broadcast))
        if count and count > 0:
            print(f"Already {count} broadcast(s) in DB. Skipping seed.")
            return 0

        for item in SAMPLE_BROADCASTS:
            sent_at = None
            scheduled_at = None
            if "sent_at_offset_days" in item:
                sent_at = now + timedelta(days=item["sent_at_offset_days"])
            if "scheduled_at_offset_days" in item:
                scheduled_at = now + timedelta(days=item["scheduled_at_offset_days"])

            broadcast = Broadcast(
                title=item["title"],
                message_type=item["message_type"],
                content=item["content"],
                target_audience=item["target_audience"],
                status=item["status"],
                total_recipients=item["total_recipients"],
                success_count=item["success_count"],
                failure_count=item["failure_count"],
                sent_at=sent_at,
                scheduled_at=scheduled_at,
            )
            db.add(broadcast)

        await db.commit()
        print(f"Seeded {len(SAMPLE_BROADCASTS)} sample broadcasts.")

    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(seed_broadcasts(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
