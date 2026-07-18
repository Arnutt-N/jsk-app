import logging
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.canned_response import CannedResponse

logger = logging.getLogger(__name__)


def _normalize_shortcut(shortcut: str) -> str:
    """Normalise a canned-response shortcut: strip surrounding whitespace and
    any number of leading ``/`` characters so the stored value never contains
    the trigger prefix. The live-chat composer re-adds the ``/`` at display
    time, so storing it here would produce ``//greeting`` in the admin table.

    Examples
    --------
    >>> _normalize_shortcut("/greeting")
    'greeting'
    >>> _normalize_shortcut("//thanks")
    'thanks'
    >>> _normalize_shortcut("  /wait  ")
    'wait'
    >>> _normalize_shortcut("/  greeting  ")
    'greeting'
    """
    return shortcut.strip().lstrip("/").strip()

DEFAULT_TEMPLATES = [
    {
        "shortcut": "greeting",
        "title": "ทักทาย",
        "content": "สวัสดีค่ะ ยินดีให้บริการค่ะ มีอะไรให้ช่วยเหลือคะ?",
        "category": "greeting"
    },
    {
        "shortcut": "closing",
        "title": "ปิดการสนทนา",
        "content": "ขอบคุณที่ใช้บริการค่ะ หากมีข้อสงสัยเพิ่มเติมสามารถติดต่อได้ตลอดเวลาค่ะ",
        "category": "closing"
    },
    {
        "shortcut": "wait",
        "title": "รอสักครู่",
        "content": "รบกวนรอสักครู่นะคะ กำลังตรวจสอบข้อมูลให้ค่ะ",
        "category": "info"
    },
    {
        "shortcut": "transfer",
        "title": "ส่งต่อเจ้าหน้าที่",
        "content": "กรุณารอสักครู่นะคะ จะติดต่อเจ้าหน้าที่ที่เกี่ยวข้องมาช่วยเหลือค่ะ",
        "category": "escalation"
    },
    {
        "shortcut": "hours",
        "title": "เวลาทำการ",
        "content": "เวลาทำการของเรา: จันทร์-ศุกร์ 08:00-17:00 น. ค่ะ",
        "category": "info"
    },
    {
        "shortcut": "contact",
        "title": "ช่องทางติดต่อ",
        "content": "สามารถติดต่อเราได้ที่:\nโทร: 02-xxx-xxxx\nอีเมล: support@example.com\nเว็บไซต์: www.example.com",
        "category": "info"
    },
    {
        "shortcut": "thanks",
        "title": "ขอบคุณ",
        "content": "ขอบคุณมากค่ะ",
        "category": "closing"
    },
    {
        "shortcut": "sorry",
        "title": "ขออภัย",
        "content": "ขออภัยในความไม่สะดวกค่ะ ทางเราจะรีบดำเนินการแก้ไขให้เร็วที่สุดค่ะ",
        "category": "info"
    },
]


class CannedResponseService:
    async def get_all(self, db: AsyncSession, category: Optional[str] = None) -> list[CannedResponse]:
        stmt = select(CannedResponse).where(CannedResponse.is_active == True)
        if category:
            stmt = stmt.where(CannedResponse.category == category)
        stmt = stmt.order_by(CannedResponse.category, CannedResponse.shortcut)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, id: int, db: AsyncSession) -> Optional[CannedResponse]:
        result = await db.execute(select(CannedResponse).where(CannedResponse.id == id))
        return result.scalar_one_or_none()

    async def get_by_shortcut(self, shortcut: str, db: AsyncSession) -> Optional[CannedResponse]:
        result = await db.execute(
            select(CannedResponse).where(
                CannedResponse.shortcut == shortcut,
                CannedResponse.is_active == True
            )
        )
        return result.scalar_one_or_none()

    async def create(self, data: dict, db: AsyncSession) -> CannedResponse:
        if "shortcut" in data and isinstance(data["shortcut"], str):
            data = {**data, "shortcut": _normalize_shortcut(data["shortcut"])}
        response = CannedResponse(**data)
        db.add(response)
        await db.commit()
        await db.refresh(response)
        return response

    async def update(self, id: int, data: dict, db: AsyncSession) -> Optional[CannedResponse]:
        response = await self.get_by_id(id, db)
        if not response:
            return None
        if "shortcut" in data and isinstance(data["shortcut"], str):
            data = {**data, "shortcut": _normalize_shortcut(data["shortcut"])}
        for key, value in data.items():
            if hasattr(response, key):
                setattr(response, key, value)
        await db.commit()
        await db.refresh(response)
        return response

    async def delete(self, id: int, db: AsyncSession) -> bool:
        response = await self.get_by_id(id, db)
        if not response:
            return False
        response.is_active = False
        await db.commit()
        return True

    async def increment_usage(self, id: int, db: AsyncSession) -> None:
        await db.execute(
            update(CannedResponse)
            .where(CannedResponse.id == id)
            .values(usage_count=CannedResponse.usage_count + 1)
        )
        await db.commit()

    async def initialize_defaults(self, db: AsyncSession) -> None:
        """Seed default templates if table is empty."""
        result = await db.execute(select(CannedResponse).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        for tmpl in DEFAULT_TEMPLATES:
            db.add(CannedResponse(**tmpl))
        await db.commit()
        logger.info(f"Seeded {len(DEFAULT_TEMPLATES)} default canned responses")


canned_response_service = CannedResponseService()
