from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import admin_broadcast


@pytest.mark.asyncio
async def test_stale_sending_second_page_uses_database_paging(monkeypatch):
    rows = [SimpleNamespace(id=i) for i in range(70)]

    async def fake_page(db, *, skip=0, limit=50, older_than_seconds=180):
        return rows[skip:skip + limit], len(rows)

    monkeypatch.setattr(
        admin_broadcast.broadcast_service, "get_stale_sending_page", fake_page,
        raising=False,
    )
    monkeypatch.setattr(
        admin_broadcast.BroadcastResponse, "model_validate", lambda row: row,
    )
    monkeypatch.setattr(
        admin_broadcast, "BroadcastListResponse", lambda **kwargs: SimpleNamespace(**kwargs)
    )

    result = await admin_broadcast.list_stale_sending(
        skip=50,
        limit=50,
        db=AsyncMock(),
        current_admin=SimpleNamespace(role="SUPER_ADMIN"),
    )

    assert [row.id for row in result.items] == list(range(50, 70))
    assert result.total == 70
    assert result.skip == 50
