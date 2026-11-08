"""Date-window filters for the friend event history list.

Same contract as the requests-list date tests: explicit YYYY-MM-DD bounds
become shared Bangkok half-open [start, end) UTC bounds via
``day_bounds_utc``, each bound is independent (lone end_date is an upper
cap), and a reversed pair is rejected with 400 before any DB work.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.friend_service import friend_service


def _event_row(**overrides):
    values = dict(
        id=1,
        user_id=5,
        event_type="FOLLOW",
        source="line",
        refollow_count=0,
        event_data=None,
        created_at=datetime(2026, 9, 2, 10, 0, tzinfo=timezone.utc),
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def _db_with_events(rows):
    """Fake DB that routes by statement kind, not call order.
        side_effect lists break the moment the service reorders its queries
        (count-first vs page-first bit us twice). String matching on the
        compiled statement is order-proof: count queries carry func.count,
        page queries carry LIMIT, decrypt selects hit the identity table.
    """
    db = AsyncMock()
    page_result = MagicMock()
    page_result.all.return_value = [(row, "Tester", None) for row in rows]
    count_result = MagicMock()
    count_result.scalar.return_value = len(rows)
    decrypt_result = MagicMock()
    decrypt_result.all.return_value = []

    async def _route(stmt, *args, **kwargs):
        sql = str(stmt)
        if "func.count" in sql or "count(" in sql.lower():
            return count_result
        if "LIMIT" in sql:
            return page_result
        return decrypt_result

    db.execute = AsyncMock(side_effect=_route)
    return db


@pytest.mark.asyncio
async def test_history_list_date_filter_bounds():
    db = _db_with_events([_event_row()])
    events, total = await friend_service.get_all_friend_events(
        db,
        start_dt=datetime(2026, 8, 31, 17, 0, tzinfo=timezone.utc),
        end_dt=datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc),
    )
    assert total == 1
    assert len(events) == 1
    # The page query is the one with LIMIT; the count wrapper shares the
    # same filtered subquery, so either proves the bounds.
    page_sql = next(
        str(c.args[0])
        for c in db.execute.call_args_list
        if "LIMIT" in str(c.args[0])
    )
    assert "created_at >=" in page_sql
    assert "created_at <" in page_sql


@pytest.mark.asyncio
async def test_history_list_lone_end_date_is_upper_cap():
    db = _db_with_events([_event_row()])
    events, total = await friend_service.get_all_friend_events(
        db,
        end_dt=datetime(2026, 9, 3, 17, 0, tzinfo=timezone.utc),
    )
    assert total == 1
    page_sql = next(
        str(c.args[0])
        for c in db.execute.call_args_list
        if "LIMIT" in str(c.args[0])
    )
    assert "created_at <" in page_sql
    assert "created_at >=" not in page_sql


def test_history_endpoint_reversed_dates_returns_400():
    from fastapi.testclient import TestClient

    from app.api import deps
    from app.db.session import get_db as session_get_db
    from app.main import app
    from app.models.user import UserRole

    async def _override_get_db():
        yield _db_with_events([])

    async def _override_admin():
        return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_admin

    client = TestClient(app)
    try:
        response = client.get(
            "/api/v1/admin/friends/history?start_date=2026-09-05&end_date=2026-09-01"
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["detail"] == "start_date must not be after end_date"
