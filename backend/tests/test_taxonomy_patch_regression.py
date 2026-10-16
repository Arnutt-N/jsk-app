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
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
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
