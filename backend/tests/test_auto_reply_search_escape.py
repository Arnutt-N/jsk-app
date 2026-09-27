"""DB-backed regression test: literal ``%`` / ``_`` in auto-reply keyword
search (F1).

``list_auto_replies`` must wrap the keyword with ``escape_ilike`` and pass
``escape="\\\\"`` so SQL wildcards in the search term are treated as literal
characters. Real Postgres ilike semantics are required to prove this — the
``_FakeDB`` idiom (test_admin_requests_endpoints.py) records statements and
returns canned rows, so it cannot detect wildcard-vs-literal behavior.

Fixture strategy: insert uniquely-marked rows through a throwaway NullPool
engine (recipe from test_liff_token.py:37-44), query via the real HTTP
endpoint (TestClient + auth-gate dependency override only — the app's own
``get_db`` is left in place so the handler runs against the same Postgres),
then clean up by marker.
"""
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.auto_reply import AutoReply, MatchType, ReplyType


def _fresh_engine():
    # Same recipe as test_liff_token.py:37-44 — a throwaway NullPool engine
    # whose connections are created and disposed within this test's own
    # event loop (avoids cross-loop reuse of the shared app pool).
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def _fake_user():
    return SimpleNamespace(id=1, role="ADMIN", display_name="pytest")


def _row(keyword: str) -> AutoReply:
    return AutoReply(
        keyword=keyword,
        match_type=MatchType.CONTAINS,
        reply_type=ReplyType.TEXT,
        text_content="pytest fixture",
    )


@pytest.mark.asyncio
async def test_keyword_percent_and_underscore_match_literal_only():
    marker = f"esc{uuid.uuid4().hex[:8]}"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        session.add_all(
            [
                _row(f"{marker}100%"),  # literal percent
                _row(f"{marker}100X"),  # decoy: differs only at the wildcard
                _row(f"{marker}a_b"),   # literal underscore
                _row(f"{marker}aXb"),   # decoy: differs only at the wildcard
            ]
        )
        await session.commit()

    app.dependency_overrides[get_current_admin] = _fake_user
    try:
        with TestClient(app) as client:
            # Percent: a literal '%' in the term must match only the row that
            # actually contains '%'. Unescaped, '%{...}100%%' would also
            # match the '100X' decoy.
            response = client.get(
                "/api/v1/admin/auto-replies", params={"keyword": f"{marker}100%"}
            )
            assert response.status_code == 200, response.text
            keywords = [row["keyword"] for row in response.json()]
            assert keywords == [f"{marker}100%"], keywords

            # Underscore: a literal '_' must match only the row that actually
            # contains '_'. Unescaped, '%{...}a_%' would also match 'aXb'.
            response = client.get(
                "/api/v1/admin/auto-replies", params={"keyword": f"{marker}a_"}
            )
            assert response.status_code == 200, response.text
            keywords = [row["keyword"] for row in response.json()]
            assert keywords == [f"{marker}a_b"], keywords
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        async with Session() as session:
            await session.execute(
                delete(AutoReply).where(AutoReply.keyword.like(f"{marker}%"))
            )
            await session.commit()
        await engine.dispose()