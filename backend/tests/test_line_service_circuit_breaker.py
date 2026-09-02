"""Tests for LINE API circuit breaker behavior."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.services.line_service import LineService


@pytest.mark.asyncio
async def test_circuit_opens_after_failure_threshold_and_fast_fails():
    service = LineService()
    service._cb_failure_threshold = 2
    service._cb_recovery_timeout_seconds = 60
    service._api = AsyncMock()
    service._api.reply_message = AsyncMock(side_effect=RuntimeError("line down"))

    with pytest.raises(RuntimeError):
        await service.reply_text("token", "hello")
    with pytest.raises(RuntimeError):
        await service.reply_text("token", "hello")

    # Third call should fast-fail without invoking API again.
    with pytest.raises(RuntimeError, match="circuit is open"):
        await service.reply_text("token", "hello")

    assert service._api.reply_message.await_count == 2
    assert service._cb_open_until is not None


@pytest.mark.asyncio
async def test_circuit_recovers_after_timeout_and_success():
    service = LineService()
    service._cb_failure_threshold = 1
    service._cb_recovery_timeout_seconds = 1
    service._api = AsyncMock()
    service._api.reply_message = AsyncMock(side_effect=RuntimeError("line down"))

    with pytest.raises(RuntimeError):
        await service.reply_text("token", "hello")

    service._cb_open_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    service._api.reply_message = AsyncMock(return_value=None)
    await service.reply_text("token", "hello")

    assert service._cb_open_until is None
    assert service._cb_failures == 0



async def _fake_db_execute_first_row(rows):
    """Build a stand-in db whose execute returns a result with .scalars().first()."""
    class _Scalars:
        def first(self_inner):
            return rows[0] if rows else None

    class _Result:
        def scalars(self_inner):
            return _Scalars()

    class _DB:
        async def execute(self, stmt):
            return _Result()

        async def commit(self):
            pass

    return _DB()


@pytest.mark.asyncio
async def test_get_incoming_message_by_line_message_id_tolerates_duplicate_rows(monkeypatch):
    """Review finding L1: payload->>'line_message_id' is not unique — a second
    matching row must not raise MultipleResultsFound; the first row wins."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    service = LineService()

    async def _resolve(db, line_user_id):
        return SimpleNamespace(id=7)

    def _child_filter(model, line_user_id, user_id):
        from sqlalchemy import true
        return true()

    monkeypatch.setattr(
        "app.services.user_identity_service.resolve_by_line_id", _resolve
    )
    monkeypatch.setattr(
        "app.services.user_identity_service.child_filter", _child_filter
    )
    rows = [SimpleNamespace(id=1), SimpleNamespace(id=2)]  # duplicate rows
    db = await _fake_db_execute_first_row(rows)

    msg = await service.get_incoming_message_by_line_message_id(db, "U" + "0" * 32, "m-1")

    assert msg is not None and msg.id == 1
