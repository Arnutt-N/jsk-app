import logging
import time

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.taxonomy import TaxonomyCategory, TaxonomyTopic

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60.0

_cached_map: dict[str, list[str]] | None = None
_cached_at = 0.0


def _clean_name(value: str | None, field: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError(f"{field} must not be empty")
    if len(cleaned) > 200:
        raise ValueError(f"{field} must be at most 200 characters")
    return cleaned


class TaxonomyService:
    async def get_taxonomy_map(self, db: AsyncSession) -> dict[str, list[str]]:
        global _cached_map, _cached_at
        now = time.time()
        if _cached_map is not None and (now - _cached_at) < _CACHE_TTL_SECONDS:
            return {category: list(topics) for category, topics in _cached_map.items()}

        cat_rows = (
            await db.execute(
                select(TaxonomyCategory).where(TaxonomyCategory.is_active.is_(True)).order_by(
                    TaxonomyCategory.sort_order.asc(), TaxonomyCategory.id.asc()
                )
            )
        ).scalars().all()
        topic_rows = (
            await db.execute(
                select(TaxonomyTopic).where(TaxonomyTopic.is_active.is_(True)).order_by(
                    TaxonomyTopic.sort_order.asc(), TaxonomyTopic.id.asc()
                )
            )
        ).scalars().all()

        by_category: dict[int, list[str]] = {}
        for topic in topic_rows:
            by_category.setdefault(topic.category_id, []).append(topic.name)
        table = {category.name: by_category.get(category.id, []) for category in cat_rows}

        _cached_map = {category: list(topics) for category, topics in table.items()}
        _cached_at = now
        return table

    async def get_admin_taxonomy(self, db: AsyncSession) -> list[TaxonomyCategory]:
        cat_rows = (
            await db.execute(
                select(TaxonomyCategory)
                .options(selectinload(TaxonomyCategory.topics))
                .order_by(
                    TaxonomyCategory.sort_order.asc(), TaxonomyCategory.id.asc()
                )
            )
        ).scalars().all()
        for category in cat_rows:
            category.topics.sort(key=lambda t: (t.sort_order, t.id))
        return list(cat_rows)

    def invalidate(self) -> None:
        global _cached_map, _cached_at
        _cached_map = None
        _cached_at = 0.0

    async def create_category(
        self,
        db: AsyncSession,
        name: str,
        sort_order: int = 0,
        is_active: bool = True,
    ) -> TaxonomyCategory:
        cleaned = _clean_name(name, "Category name")

        category = TaxonomyCategory(name=cleaned, sort_order=sort_order, is_active=is_active)
        db.add(category)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ValueError(f"Category '{cleaned}' already exists") from None
        await db.refresh(category)
        category.topics = []
        self.invalidate()
        return category

    async def update_category(
        self,
        db: AsyncSession,
        category_id: int,
        name: str | None = None,
        sort_order: int | None = None,
        is_active: bool | None = None,
    ) -> TaxonomyCategory:
        category = await db.get(TaxonomyCategory, category_id)
        if category is None:
            raise LookupError("Category not found")

        attempted_name: str | None = None
        if name is not None:
            cleaned = _clean_name(name, "Category name")
            category.name = cleaned
            attempted_name = cleaned
        if sort_order is not None:
            category.sort_order = sort_order
        if is_active is not None:
            category.is_active = is_active

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ValueError(f"Category '{attempted_name}' already exists") from None
        await db.refresh(category)
        self.invalidate()
        # Reload with topics: the instance above never loaded the collection,
        # so serializing it would lazy-load on AsyncSession (MissingGreenlet).
        reloaded = (
            await db.execute(
                select(TaxonomyCategory)
                .options(selectinload(TaxonomyCategory.topics))
                .where(TaxonomyCategory.id == category_id)
            )
        ).scalar_one()
        reloaded.topics.sort(key=lambda t: (t.sort_order, t.id))
        return reloaded

    async def delete_category(self, db: AsyncSession, category_id: int) -> bool:
        category = await db.get(TaxonomyCategory, category_id)
        if category is None:
            return False
        if not category.is_active:
            return True
        # Cascade-hide: user decision 2026-10-23 — hiding a category hides its
        # topics in the same commit so no active topic is stranded invisible.
        # Restore is per-row via PATCH (category first, then its topics).
        await db.execute(
            update(TaxonomyTopic)
            .where(TaxonomyTopic.category_id == category_id)
            .values(is_active=False)
        )
        category.is_active = False
        await db.commit()
        self.invalidate()
        return True

    async def create_topic(
        self,
        db: AsyncSession,
        category_id: int,
        name: str,
        sort_order: int = 0,
        is_active: bool = True,
    ) -> TaxonomyTopic:
        cleaned = _clean_name(name, "Topic name")
        category = await db.get(TaxonomyCategory, category_id)
        if category is None:
            raise LookupError("Category not found")
        if not category.is_active:
            raise ValueError(
                f"หมวด '{category.name}' ปิดใช้งานอยู่ ให้เปิดใช้งานก่อนเพิ่มหัวข้อ"
            )

        topic = TaxonomyTopic(
            category_id=category_id,
            name=cleaned,
            sort_order=sort_order,
            is_active=is_active,
        )
        db.add(topic)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ValueError(f"Topic '{cleaned}' already exists in this category") from None
        await db.refresh(topic)
        self.invalidate()
        return topic

    async def update_topic(
        self,
        db: AsyncSession,
        topic_id: int,
        category_id: int | None = None,
        name: str | None = None,
        sort_order: int | None = None,
        is_active: bool | None = None,
    ) -> TaxonomyTopic:
        topic = await db.get(TaxonomyTopic, topic_id)
        if topic is None:
            raise LookupError("Topic not found")

        if category_id is not None and category_id != topic.category_id:
            category = await db.get(TaxonomyCategory, category_id)
            if category is None:
                raise LookupError("Category not found")
            if not category.is_active:
                raise ValueError(
                    f"หมวด '{category.name}' ปิดใช้งานอยู่ ให้เปิดใช้งานก่อนย้ายหัวข้อ"
                )
            topic.category_id = category_id

        attempted_name: str | None = None
        if name is not None:
            cleaned = _clean_name(name, "Topic name")
            topic.name = cleaned
            attempted_name = cleaned
        if sort_order is not None:
            topic.sort_order = sort_order
        if is_active is not None:
            topic.is_active = is_active

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ValueError(f"Topic '{attempted_name}' already exists in this category") from None
        await db.refresh(topic)
        self.invalidate()
        return topic

    async def delete_topic(self, db: AsyncSession, topic_id: int) -> bool:
        topic = await db.get(TaxonomyTopic, topic_id)
        if topic is None:
            return False
        if not topic.is_active:
            return True
        topic.is_active = False
        await db.commit()
        self.invalidate()
        return True


taxonomy_service = TaxonomyService()
