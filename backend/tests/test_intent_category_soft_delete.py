"""Real-session test: DELETE intent category soft-hides, keeps children.

Policy (user decision 2026-10-23): admin delete buttons only hide
(`is_active=False`); hidden rows must be restorable via PUT. Children
(keywords/responses) stay untouched — a flag flip never triggers the
`delete-orphan` cascade. Recipe from
test_taxonomy_patch_regression.py:1-60 (real session, never mocked).
"""
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.deps import get_current_admin
from app.api.v1.endpoints import admin_intents as admin_intents_module
from app.core.config import settings
from app.main import app
from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, ReplyType
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _fake_user():
    return SimpleNamespace(
        id=1, role=UserRole.SUPER_ADMIN, username="pytest", display_name="pytest"
    )


async def _serviceable(session: AsyncSession, cat_id: int) -> bool:
    """Mirror of the public serviceable gate (category active AND >=1
    active response)."""
    cat = await session.get(IntentCategory, cat_id)
    if cat is None or not cat.is_active:
        return False
    active_count = await session.scalar(
        select(func.count(IntentResponse.id)).where(
            IntentResponse.category_id == cat_id,
            IntentResponse.is_active.is_(True),
        )
    )
    return bool(active_count)


@pytest.mark.asyncio
async def test_delete_intent_category_soft_keeps_children():
    marker = f"isoft{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(IntentCategory(name=f"cat-{marker}", is_active=True))
        await session.flush()
        cat_id = (
            await session.execute(
                select(IntentCategory.id).where(
                    IntentCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()
        session.add(IntentKeyword(category_id=cat_id, keyword=f"kw-{marker}"))
        session.add(
            IntentResponse(
                category_id=cat_id,
                reply_type=ReplyType.TEXT,
                text_content=f"resp-{marker}",
                is_active=True,
            )
        )
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_intents_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        res = client.delete(f"/api/v1/admin/intents/categories/{cat_id}")
        assert res.status_code == 204, res.text

        async with Session() as session:
            cat = await session.get(IntentCategory, cat_id)
            assert cat is not None
            assert cat.is_active is False
            kw_count = await session.scalar(
                select(func.count(IntentKeyword.id)).where(
                    IntentKeyword.category_id == cat_id
                )
            )
            assert kw_count == 1
            assert await _serviceable(session, cat_id) is False

        res = client.put(
            f"/api/v1/admin/intents/categories/{cat_id}",
            json={"is_active": True},
        )
        assert res.status_code == 200, res.text

        async with Session() as session:
            assert await _serviceable(session, cat_id) is True
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(admin_intents_module.get_db, None)
        async with Session() as session:
            await session.execute(
                delete(IntentKeyword).where(IntentKeyword.category_id == cat_id)
            )
            await session.execute(
                delete(IntentResponse).where(
                    IntentResponse.category_id == cat_id
                )
            )
            await session.execute(
                delete(IntentCategory).where(IntentCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_reactivate_category_without_active_response_is_400():
    marker = f"isoft400{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(IntentCategory(name=f"cat-{marker}", is_active=False))
        await session.flush()
        cat_id = (
            await session.execute(
                select(IntentCategory.id).where(
                    IntentCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()
        session.add(
            IntentResponse(
                category_id=cat_id,
                reply_type=ReplyType.TEXT,
                text_content=f"resp-{marker}",
                is_active=False,
            )
        )
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_intents_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        res = client.put(
            f"/api/v1/admin/intents/categories/{cat_id}",
            json={"is_active": True},
        )
        assert res.status_code == 400, res.text
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(admin_intents_module.get_db, None)
        async with Session() as session:
            await session.execute(
                delete(IntentResponse).where(
                    IntentResponse.category_id == cat_id
                )
            )
            await session.execute(
                delete(IntentCategory).where(IntentCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()
