"""Shared harness for soft-delete real-session endpoint tests.

Recipe (from test_taxonomy_patch_regression.py:1-60): throwaway NullPool
engine (fresh connection per checkout, created in the loop that uses it)
+ uniquely-marked rows + real HTTP via plain TestClient with the get_db
and auth gates overridden + marker cleanup. New soft-delete tests should
use this instead of copy-pasting the ~30-line setup.
"""
import uuid
from contextlib import contextmanager
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.user import UserRole


def fresh_engine():
    """Throwaway NullPool engine — see recipe note above."""
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


def fake_admin():
    return SimpleNamespace(
        id=1, role=UserRole.SUPER_ADMIN, username="pytest", display_name="pytest"
    )


def unique_marker(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


@contextmanager
def admin_client(Session, get_db_dep, *, raise_server_exceptions=True):
    """Yield a TestClient whose requests hit a real session from a
    throwaway engine with the admin auth gates overridden. Pops all
    overrides on exit."""
    app.dependency_overrides[get_current_admin] = fake_admin
    app.dependency_overrides[deps.get_current_user] = fake_admin

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db_dep] = _fresh_get_db
    try:
        client = TestClient(app, raise_server_exceptions=raise_server_exceptions)
        try:
            yield client
        finally:
            client.close()
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(deps.get_current_user, None)
        app.dependency_overrides.pop(get_db_dep, None)
