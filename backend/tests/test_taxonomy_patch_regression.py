"""Real-session regression tests for PATCH taxonomy writers (fixes 1 + 4).

Why a real session: the Unit-2 mocks in test_taxonomy.py use AsyncMock /
SimpleNamespace, which never expire attributes and never lazy-load — so
they cannot see MissingGreenlet (fix 1) or post-rollback expiry (fix 4).

Isolation recipe (from test_auto_reply_search_escape.py): a throwaway
NullPool engine from settings.DATABASE_URL — which conftest defaults to
the docker test DB, never the dev database — uniquely-marked rows, real
HTTP via TestClient with get_db + get_current_user overridden, marker
cleanup afterwards.
"""
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.core.config import settings
from app.main import app
from app.models.taxonomy import TaxonomyCategory, TaxonomyTopic
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _admin_user():
    return SimpleNamespace(id=1, username="t", display_name="T", role=UserRole.ADMIN)


@pytest.mark.asyncio
async def test_patch_category_returns_200_with_topics():
    marker = f"px{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        category = TaxonomyCategory(name=f"cat-{marker}", sort_order=0, is_active=True)
        session.add(category)
        await session.flush()
        category_id = category.id
        session.add_all(
            [
                TaxonomyTopic(category_id=category_id, name=f"top-a-{marker}", sort_order=0, is_active=True),
                TaxonomyTopic(category_id=category_id, name=f"top-b-{marker}", sort_order=1, is_active=True),
            ]
        )
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_user
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            response = client.patch(
                f"/api/v1/admin/taxonomy/categories/{category_id}",
                json={"name": f"cat-renamed-{marker}"},
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == f"cat-renamed-{marker}"
        assert sorted(t["name"] for t in body["topics"]) == sorted(
            [f"top-a-{marker}", f"top-b-{marker}"]
        )
    finally:
        async with Session() as session:
            await session.execute(
                delete(TaxonomyTopic).where(TaxonomyTopic.category_id == category_id)
            )
            await session.execute(
                delete(TaxonomyCategory).where(TaxonomyCategory.id == category_id)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_patch_category_duplicate_names_attempted_name():
    marker = f"dup{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        session.add_all(
            [
                TaxonomyCategory(name=f"taken-{marker}", sort_order=0, is_active=True),
                TaxonomyCategory(name=f"mine-{marker}", sort_order=1, is_active=True),
            ]
        )
        await session.commit()
        mine_id = (
            await session.execute(
                select(TaxonomyCategory.id).where(
                    TaxonomyCategory.name == f"mine-{marker}"
                )
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_user
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            response = client.patch(
                f"/api/v1/admin/taxonomy/categories/{mine_id}",
                json={"name": f"taken-{marker}"},
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert response.status_code == 409
        assert f"taken-{marker}" in response.json()["detail"]
    finally:
        async with Session() as session:
            await session.execute(
                delete(TaxonomyCategory).where(
                    TaxonomyCategory.name.in_([f"taken-{marker}", f"mine-{marker}"])
                )
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_topic_soft_hides_from_reads():
    marker = f"soft{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(TaxonomyCategory(name=f"cat-{marker}", sort_order=0, is_active=True))
        await session.flush()
        cat_id = (
            await session.execute(
                select(TaxonomyCategory.id).where(
                    TaxonomyCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()
        session.add(
            TaxonomyTopic(
                category_id=cat_id, name=f"top-{marker}", sort_order=0, is_active=True
            )
        )
        await session.commit()
        topic_id = (
            await session.execute(
                select(TaxonomyTopic.id).where(
                    TaxonomyTopic.name == f"top-{marker}"
                )
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_user
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            response = client.delete(f"/api/v1/admin/taxonomy/topics/{topic_id}")
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert response.status_code == 200, response.text
        async with Session() as session:
            row = await session.get(TaxonomyTopic, topic_id)
            assert row is not None
            assert row.is_active is False
            visible = (
                await session.execute(
                    select(TaxonomyTopic.id).where(
                        TaxonomyTopic.id == topic_id,
                        TaxonomyTopic.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            assert visible is None
    finally:
        async with Session() as session:
            await session.execute(
                delete(TaxonomyTopic).where(TaxonomyTopic.id == topic_id)
            )
            await session.execute(
                delete(TaxonomyCategory).where(TaxonomyCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_empty_category_soft_hides():
    marker = f"softcat{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(TaxonomyCategory(name=f"cat-{marker}", sort_order=0, is_active=True))
        await session.commit()
        cat_id = (
            await session.execute(
                select(TaxonomyCategory.id).where(
                    TaxonomyCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_user
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            response = client.delete(
                f"/api/v1/admin/taxonomy/categories/{cat_id}"
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert response.status_code == 200, response.text
        async with Session() as session:
            row = await session.get(TaxonomyCategory, cat_id)
            assert row is not None
            assert row.is_active is False
    finally:
        async with Session() as session:
            await session.execute(
                delete(TaxonomyCategory).where(TaxonomyCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_category_cascade_hides_topics():
    marker = f"softcasc{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(TaxonomyCategory(name=f"cat-{marker}", sort_order=0, is_active=True))
        await session.flush()
        cat_id = (
            await session.execute(
                select(TaxonomyCategory.id).where(
                    TaxonomyCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()
        session.add_all(
            [
                TaxonomyTopic(category_id=cat_id, name=f"top-a-{marker}", sort_order=0, is_active=True),
                TaxonomyTopic(category_id=cat_id, name=f"top-b-{marker}", sort_order=1, is_active=True),
            ]
        )
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_user
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            response = client.delete(
                f"/api/v1/admin/taxonomy/categories/{cat_id}"
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "hidden"
        async with Session() as session:
            cat = await session.get(TaxonomyCategory, cat_id)
            assert cat is not None
            assert cat.is_active is False
            visible_topics = (
                await session.execute(
                    select(func.count())
                    .select_from(TaxonomyTopic)
                    .where(
                        TaxonomyTopic.category_id == cat_id,
                        TaxonomyTopic.is_active.is_(True),
                    )
                )
            ).scalar()
            assert visible_topics == 0
    finally:
        async with Session() as session:
            await session.execute(
                delete(TaxonomyTopic).where(
                    TaxonomyTopic.category_id == cat_id
                )
            )
            await session.execute(
                delete(TaxonomyCategory).where(TaxonomyCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_patch_reopens_soft_deleted_topic():
    marker = f"softre{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        session.add(TaxonomyCategory(name=f"cat-{marker}", sort_order=0, is_active=True))
        await session.flush()
        cat_id = (
            await session.execute(
                select(TaxonomyCategory.id).where(
                    TaxonomyCategory.name == f"cat-{marker}"
                )
            )
        ).scalar_one()
        session.add(
            TaxonomyTopic(
                category_id=cat_id, name=f"top-{marker}", sort_order=0, is_active=False
            )
        )
        await session.commit()
        topic_id = (
            await session.execute(
                select(TaxonomyTopic.id).where(
                    TaxonomyTopic.name == f"top-{marker}"
                )
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_user
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            response = client.patch(
                f"/api/v1/admin/taxonomy/topics/{topic_id}",
                json={"is_active": True},
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert response.status_code == 200, response.text
        async with Session() as session:
            row = await session.get(TaxonomyTopic, topic_id)
            assert row is not None
            assert row.is_active is True
    finally:
        async with Session() as session:
            await session.execute(
                delete(TaxonomyTopic).where(TaxonomyTopic.id == topic_id)
            )
            await session.execute(
                delete(TaxonomyCategory).where(TaxonomyCategory.id == cat_id)
            )
            await session.commit()
        await engine.dispose()
