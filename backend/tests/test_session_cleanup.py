"""Unit tests for session cleanup abandonment handling."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.session_cleanup import _process_inactive_sessions
from app.models.chat_session import SessionStatus


def _mock_result_with_sessions(sessions):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = sessions
    result.scalars.return_value = scalars
    return result


@pytest.mark.asyncio
async def test_process_inactive_sessions_handles_abandoned_waiting():
    now = datetime.now(timezone.utc)
    waiting_session = MagicMock()
    waiting_session.id = 99
    waiting_session.status = SessionStatus.WAITING
    waiting_session.claimed_at = None
    waiting_session.started_at = now - timedelta(minutes=20)
    waiting_session.user_id = 123

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [
        _mock_result_with_sessions([]),  # inactive active sessions
        _mock_result_with_sessions([waiting_session]),  # abandoned waiting sessions
    ]

    with patch("app.tasks.session_cleanup._mark_abandoned_waiting_session", new=AsyncMock()) as mark_abandoned, patch(
        "app.tasks.session_cleanup._close_inactive_session", new=AsyncMock()
    ) as close_inactive, patch(
        "app.tasks.session_cleanup.analytics_service.emit_live_kpis_update", new=AsyncMock()
    ) as emit_kpis:
        await _process_inactive_sessions(mock_db)

    mark_abandoned.assert_awaited_once_with(waiting_session, mock_db)
    close_inactive.assert_not_awaited()
    emit_kpis.assert_awaited_once_with(mock_db)
    mock_db.commit.assert_awaited_once()

