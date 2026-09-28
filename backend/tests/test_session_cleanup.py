"""Unit tests for session cleanup abandonment handling."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.session_cleanup import _process_inactive_sessions
from app.models.chat_session import SessionStatus
from app.services.user_identity_service import decrypt_line_ids_for_users_tolerant


def _mock_result_with_sessions(sessions):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = sessions
    result.scalars.return_value = scalars
    return result


@pytest.mark.asyncio
async def test_commit_before_announce_order():
    waiting = MagicMock()
    waiting.id = 99
    waiting.user_id = 123
    inactive = MagicMock()
    inactive.id = 7
    inactive.user_id = 7

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [
        _mock_result_with_sessions([inactive]),
        _mock_result_with_sessions([waiting]),
    ]

    events: list[str] = []
    with patch("app.tasks.session_cleanup._mutate_close_inactive", new=AsyncMock()) as mutate_close, patch(
        "app.tasks.session_cleanup._mutate_mark_abandoned", new=AsyncMock()
    ) as mutate_abandoned, patch(
        "app.tasks.session_cleanup._announce_close", new=AsyncMock()
    ) as announce_close, patch(
        "app.tasks.session_cleanup._announce_abandoned", new=AsyncMock()
    ) as announce_abandoned, patch(
        "app.tasks.session_cleanup.decrypt_line_ids_for_users_tolerant",
        new=AsyncMock(return_value={123: "Uxxx"}),
    ) as tolerant, patch(
        "app.tasks.session_cleanup.analytics_service.emit_live_kpis_update", new=AsyncMock()
    ):
        mock_db.commit.side_effect = lambda *a, **k: events.append("commit")
        announce_close.side_effect = lambda *a, **k: events.append("announce")
        announce_abandoned.side_effect = lambda *a, **k: events.append("announce")
        await _process_inactive_sessions(mock_db)

    mock_db.commit.assert_awaited_once()
    tolerant.assert_awaited_once_with(mock_db, [7, 123])
    mutate_close.assert_awaited_once_with(inactive, mock_db)
    mutate_abandoned.assert_awaited_once_with(waiting, mock_db)
    announce_close.assert_awaited_once_with(inactive, None)
    announce_abandoned.assert_awaited_once_with(waiting, "Uxxx")
    assert events[0] == "commit" and set(events[1:]) == {"announce"}

@pytest.mark.asyncio
async def test_501_row_scan_processes_500_and_warns(caplog):
    sessions = []
    for i in range(501):
        s = MagicMock()
        s.id = i
        s.user_id = None
        sessions.append(s)

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [
        _mock_result_with_sessions(sessions),
        _mock_result_with_sessions([]),
    ]

    with patch("app.tasks.session_cleanup._mutate_close_inactive", new=AsyncMock()) as mutate_close, patch(
        "app.tasks.session_cleanup._mutate_mark_abandoned", new=AsyncMock()
    ), patch(
        "app.tasks.session_cleanup._announce_close", new=AsyncMock()
    ) as announce_close, patch(
        "app.tasks.session_cleanup._announce_abandoned", new=AsyncMock()
    ), patch(
        "app.tasks.session_cleanup.decrypt_line_ids_for_users_tolerant",
        new=AsyncMock(return_value={}),
    ), patch(
        "app.tasks.session_cleanup.analytics_service.emit_live_kpis_update", new=AsyncMock()
    ):
        await _process_inactive_sessions(mock_db)

    assert mutate_close.await_count == 500
    assert announce_close.await_count == 500
    assert any("more remain" in r.message for r in caplog.records)

@pytest.mark.asyncio
async def test_tolerant_helper_skips_bad_rows():
    rows = [(1, "tok-ok"), (2, ""), (3, None), (4, "tok-bad")]
    result = MagicMock()
    result.all.return_value = rows
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=result)

    def fake_decrypt(token):
        if token == "tok-ok":
            return "U1"
        raise ValueError("bad token")

    with patch(
        "app.services.user_identity_service._decrypt_line_id", side_effect=fake_decrypt
    ):
        mapping = await decrypt_line_ids_for_users_tolerant(mock_db, [1, 2, 3, 4])

    assert mapping == {1: "U1"}

    empty_db = AsyncMock()
    assert await decrypt_line_ids_for_users_tolerant(empty_db, []) == {}
    empty_db.execute.assert_not_awaited()

