"""Real-session test: DELETE intent category soft-hides, keeps children.

Policy: user decision 2026-10-23, see .agents/PRPs/2026-10-23-leave-confirm-soft-delete.prd.md.
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
from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType, ReplyType
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

@pytest.mark.asyncio
async def test_live_keyword_wins_over_hidden_shadow():
    from app.services.message_intake.intent_matching import resolve_reply_responses

    marker = f"shadow{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(IntentCategory(name=f"hidden-{marker}", is_active=False))
        await session.flush()
        hidden_id = (
            await session.execute(
                select(IntentCategory.id).where(
                    IntentCategory.name == f"hidden-{marker}"
                )
            )
        ).scalar_one()
        session.add(
            IntentKeyword(
                category_id=hidden_id, keyword=f"kw-{marker}", is_active=True
            )
        )
        session.add(
            IntentCategory(name=f"live-{marker}", is_active=True)
        )
        await session.flush()
        live_id = (
            await session.execute(
                select(IntentCategory.id).where(
                    IntentCategory.name == f"live-{marker}"
                )
            )
        ).scalar_one()
        session.add(
            IntentKeyword(
                category_id=live_id, keyword=f"kw-{marker}", is_active=True
            )
        )
        session.add(
            IntentResponse(
                category_id=live_id,
                reply_type=ReplyType.TEXT,
                text_content=f"resp-{marker}",
                is_active=True,
            )
        )
        await session.commit()

    try:
        async with Session() as session:
            responses, category_name, keyword_match = await resolve_reply_responses(
                f"kw-{marker}", session
            )
            assert keyword_match is not None
            assert category_name == f"live-{marker}"
            assert [r.text_content for r in responses] == [f"resp-{marker}"]
    finally:
        async with Session() as session:
            await session.execute(
                delete(IntentKeyword).where(
                    IntentKeyword.keyword == f"kw-{marker}"
                )
            )
            await session.execute(
                delete(IntentResponse).where(
                    IntentResponse.category_id == live_id
                )
            )
            await session.execute(
                delete(IntentCategory).where(
                    IntentCategory.id.in_([hidden_id, live_id])
                )
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_hidden_keyword_never_matches_live_category():
    from app.services.message_intake.intent_matching import resolve_reply_responses

    marker = f"kwshadow{uuid.uuid4().hex[:8]}"
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
        session.add(
            IntentKeyword(
                category_id=cat_id,
                keyword=f"kw-{marker}",
                match_type=MatchType.EXACT,
                is_active=False,
            )
        )
        session.add(
            IntentResponse(
                category_id=cat_id,
                reply_type=ReplyType.TEXT,
                text_content=f"resp-{marker}",
                is_active=True,
            )
        )
        await session.commit()

    try:
        async with Session() as session:
            responses, category_name, keyword_match = await resolve_reply_responses(
                f"kw-{marker}", session
            )
            assert keyword_match is None
            assert responses == []
            assert category_name == ""
    finally:
        async with Session() as session:
            await session.execute(
                delete(IntentKeyword).where(
                    IntentKeyword.keyword == f"kw-{marker}"
                )
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
async def test_create_keyword_under_hidden_category_maps_to_409():
    marker = f"kw{uuid.uuid4().hex[:8]}"
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
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_intents_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        res = client.post(
            "/api/v1/admin/intents/keywords",
            json={"category_id": cat_id, "keyword": f"kw-{marker}"},
        )
        assert res.status_code == 409, res.text
        assert "เปิดใช้งานหมวดก่อน" in res.json()["detail"]
        async with Session() as session:
            row = (
                await session.execute(
                    select(IntentKeyword.id).where(
                        IntentKeyword.keyword == f"kw-{marker}"
                    )
                )
            ).scalar_one_or_none()
            assert row is None
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(admin_intents_module.get_db, None)
        async with Session() as session:
            await session.execute(
                delete(IntentCategory).where(IntentCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_response_under_hidden_category_recovers_restore():
    marker = f"rec{uuid.uuid4().hex[:8]}"
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
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_intents_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        res = client.post(
            "/api/v1/admin/intents/responses",
            json={
                "category_id": cat_id,
                "reply_type": "text",
                "text_content": f"resp-{marker}",
            },
        )
        assert res.status_code == 201, res.text

        res = client.put(
            f"/api/v1/admin/intents/categories/{cat_id}",
            json={"is_active": True},
        )
        assert res.status_code == 200, res.text
        async with Session() as session:
            cat = await session.get(IntentCategory, cat_id)
            assert cat is not None
            assert cat.is_active is True
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


@pytest.mark.asyncio
async def test_put_intent_category_rename_to_existing_maps_to_409():
    marker = f"ren{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(IntentCategory(name=f"taken-{marker}", is_active=True))
        session.add(IntentCategory(name=f"mine-{marker}", is_active=True))
        await session.commit()
        mine_id = (
            await session.execute(
                select(IntentCategory.id).where(
                    IntentCategory.name == f"mine-{marker}"
                )
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_intents_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        res = client.put(
            f"/api/v1/admin/intents/categories/{mine_id}",
            json={"name": f"taken-{marker}"},
        )
        assert res.status_code == 409, res.text
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(admin_intents_module.get_db, None)
        async with Session() as session:
            await session.execute(
                delete(IntentCategory).where(
                    IntentCategory.name.in_([f"taken-{marker}", f"mine-{marker}"])
                )
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_repeat_delete_hidden_category_stays_hidden():
    marker = f"rep{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(IntentCategory(name=f"cat-{marker}", is_active=True))
        await session.commit()
        cat_id = (
            await session.execute(
                select(IntentCategory.id).where(
                    IntentCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_intents_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        first = client.delete(f"/api/v1/admin/intents/categories/{cat_id}")
        second = client.delete(f"/api/v1/admin/intents/categories/{cat_id}")
        assert first.status_code == 204, first.text
        assert second.status_code == 204, second.text
        async with Session() as session:
            cat = await session.get(IntentCategory, cat_id)
            assert cat is not None
            assert cat.is_active is False
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(admin_intents_module.get_db, None)
        async with Session() as session:
            await session.execute(
                delete(IntentCategory).where(IntentCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()
