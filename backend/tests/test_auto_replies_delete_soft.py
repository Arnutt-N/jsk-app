"""Real-session test: DELETE auto-reply rule soft-hides instead of removing.

Policy (user decision 2026-10-23): admin delete buttons only hide
(`is_active=False`); nothing is permanently deleted and every hidden row
must be restorable via PUT. Uses the throwaway NullPool engine + marker
cleanup recipe from test_taxonomy_patch_regression.py:1-60 (never mocks
the service layer).
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
from app.api.deps import get_current_admin
from app.api.v1.endpoints import admin_auto_replies as admin_auto_replies_module
from app.core.config import settings
from app.main import app
from app.models.auto_reply import AutoReply, MatchType, ReplyType
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _fake_user():
    return SimpleNamespace(
        id=1, role=UserRole.SUPER_ADMIN, username="pytest", display_name="pytest"
    )


@pytest.mark.asyncio
async def test_delete_auto_reply_soft_hides_and_restores():
    marker = f"soft{uuid.uuid4().hex[:8]}"
    keyword = f"{marker}-rule"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        session.add(
            AutoReply(
                keyword=keyword,
                match_type=MatchType.CONTAINS,
                reply_type=ReplyType.TEXT,
                text_content="pytest fixture",
                is_active=True,
            )
        )
        await session.commit()
        rule_id = (
            await session.execute(
                select(AutoReply.id).where(AutoReply.keyword == keyword)
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_current_admin] = _fake_user
    app.dependency_overrides[deps.get_current_user] = _fake_user
    app.dependency_overrides[admin_auto_replies_module.get_db] = _fresh_get_db
    try:
        client = TestClient(app)
        res = client.delete(f"/api/v1/admin/auto-replies/{rule_id}")
        assert res.status_code == 204, res.text

        async with Session() as session:
            row = await session.get(AutoReply, rule_id)
            assert row is not None
            assert row.is_active is False

        async with Session() as session:
            public_hit = (
                await session.execute(
                    select(AutoReply.id).where(
                        AutoReply.keyword == keyword,
                        AutoReply.is_active == True,
                    )
                )
            ).scalar_one_or_none()
            assert public_hit is None

        res = client.put(
            f"/api/v1/admin/auto-replies/{rule_id}", json={"is_active": True}
        )
        assert res.status_code == 200, res.text

        async with Session() as session:
            public_hit = (
                await session.execute(
                    select(AutoReply.id).where(
                        AutoReply.keyword == keyword,
                        AutoReply.is_active == True,
                    )
                )
            ).scalar_one_or_none()
            assert public_hit == rule_id
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(admin_auto_replies_module.get_db, None)
        async with Session() as session:
            await session.execute(
                delete(AutoReply).where(AutoReply.keyword == keyword)
            )
            await session.commit()
        await engine.dispose()
