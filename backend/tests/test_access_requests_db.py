"""Real-session tests for the access-request and password-reset flows.

Why a real session: the fake-DB tests replay queued results and cannot see
unique constraints, rowcount-gated claims, or token invalidation. These tests
hit the real endpoints over HTTP with a NullPool session (same recipe as
test_taxonomy_patch_regression.py): uniquely-marked rows, dependency
overrides, marker cleanup afterwards. TestClient is used without lifespan
(no startup bootstrap), exactly like the exemplar.
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.core.config import settings
from app.core.security import get_password_hash
from app.main import app
from app.models.access_request import AccessRequest, AccessRequestStatus
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User, UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _admin_override(admin_id: int, username: str):
    def _admin_user():
        return SimpleNamespace(
            id=admin_id,
            username=username,
            display_name=username,
            role=UserRole.SUPER_ADMIN,
        )

    return _admin_user


@pytest.mark.asyncio
async def test_approve_creates_user_and_second_approve_conflicts():
    marker = f"qx{uuid.uuid4().hex[:8]}"
    username = f"req_{marker}"
    adm_username = f"adm_{marker}"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        session.add(
            User(
                username=adm_username,
                hashed_password=get_password_hash("adminpass12"),
                display_name=f"Admin {marker}",
                email=f"admin-{marker}@example.com",
                role=UserRole.SUPER_ADMIN,
                is_active=True,
            )
        )
        await session.commit()
        admin_id = (
            await session.execute(select(User.id).where(User.username == adm_username))
        ).scalar_one()
        session.add(
            AccessRequest(
                display_name=f"Req {marker}",
                username=username,
                email=f"{marker}@example.com",
                requested_role=UserRole.AGENT,
                status=AccessRequestStatus.PENDING,
            )
        )
        await session.commit()
        request_id = (
            await session.execute(
                select(AccessRequest.id).where(AccessRequest.username == username)
            )
        ).scalar_one()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_user] = _admin_override(admin_id, adm_username)
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            first = client.post(
                f"/api/v1/admin/access-requests/{request_id}/approve",
                json={"password": "secret1234"},
            )
            second = client.post(
                f"/api/v1/admin/access-requests/{request_id}/approve",
                json={"password": "secret1234"},
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert first.status_code == 200, first.text
        assert first.json()["status"] == "APPROVED"
        assert second.status_code == 409

        async with Session() as session:
            result = await session.execute(select(User.id).where(User.username == username))
            assert result.scalar_one_or_none() is not None
    finally:
        async with Session() as session:
            await session.execute(
                delete(AccessRequest).where(AccessRequest.username == username)
            )
            await session.execute(delete(User).where(User.username == username))
            await session.execute(delete(User).where(User.username == adm_username))
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_reset_password_consumes_token_and_kills_siblings():
    marker = f"qr{uuid.uuid4().hex[:8]}"
    username = f"rst_{marker}"
    email = f"{marker}@example.com"
    raw_keep = f"keep-token-{marker}-0123456789abcdef"
    raw_use = f"use-token-{marker}-0123456789abcdef"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        session.add(
            User(
                username=username,
                hashed_password=get_password_hash("oldpass12"),
                display_name=f"Reset {marker}",
                email=email,
                role=UserRole.AGENT,
                is_active=True,
            )
        )
        await session.flush()
        user_id = (
            await session.execute(select(User.id).where(User.username == username))
        ).scalar_one()
        expires = datetime.now(timezone.utc) + timedelta(minutes=30)
        session.add_all(
            [
                PasswordResetToken(
                    user_id=user_id,
                    token_hash=hashlib.sha256(raw_keep.encode()).hexdigest(),
                    expires_at=expires,
                ),
                PasswordResetToken(
                    user_id=user_id,
                    token_hash=hashlib.sha256(raw_use.encode()).hexdigest(),
                    expires_at=expires,
                ),
            ]
        )
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            first = client.post(
                "/api/v1/auth/reset-password",
                json={"token": raw_use, "new_password": "brandnew12"},
            )
            second = client.post(
                "/api/v1/auth/reset-password",
                json={"token": raw_use, "new_password": "another123"},
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert first.status_code == 200, first.text

        async with Session() as session:
            result = await session.execute(
                select(PasswordResetToken.used_at).where(
                    PasswordResetToken.user_id == user_id
                )
            )
            assert all(row[0] is not None for row in result.all())

        assert second.status_code == 400
    finally:
        async with Session() as session:
            await session.execute(
                delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id)
            )
            await session.execute(delete(User).where(User.username == username))
            await session.commit()
        await engine.dispose()
