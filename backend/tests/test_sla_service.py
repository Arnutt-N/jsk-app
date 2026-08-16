"""Unit tests for SLA alert service."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.sla_service import SLAService


def _db_mock_without_user():
    """DB mock whose user lookup misses: decrypt_line_id_for_user returns None
    (user row absent) instead of crashing on a MagicMock Fernet token."""
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    return db


@pytest.mark.asyncio
async def test_queue_wait_breach_emits_ws_alert():
    service = SLAService()
    session = SimpleNamespace(
        id=101,
        user_id=1,
        started_at=datetime.now(timezone.utc) - timedelta(minutes=8),
        claimed_at=datetime.now(timezone.utc),
    )

    with pytest.MonkeyPatch.context() as mp:
        broadcast = AsyncMock()
        mp.setattr("app.services.sla_service.ws_manager.broadcast_to_all", broadcast)
        mp.setattr("app.services.sla_service.settings.SLA_MAX_QUEUE_WAIT_SECONDS", 300)
        mp.setattr("app.services.sla_service.settings.SLA_ALERT_TELEGRAM_ENABLED", False)

        await service.check_queue_wait_on_claim(session, _db_mock_without_user())

    broadcast.assert_awaited_once()
    payload = broadcast.await_args.args[0]
    assert payload["type"] == "sla_alert"
    assert payload["payload"]["metric"] == "queue_wait_seconds"


@pytest.mark.asyncio
async def test_resolution_within_threshold_does_not_emit_alert():
    service = SLAService()
    now = datetime.now(timezone.utc)
    session = SimpleNamespace(
        id=202,
        user_id=2,
        started_at=now - timedelta(minutes=5),
        closed_at=now,
    )

    with pytest.MonkeyPatch.context() as mp:
        broadcast = AsyncMock()
        mp.setattr("app.services.sla_service.ws_manager.broadcast_to_all", broadcast)
        mp.setattr("app.services.sla_service.settings.SLA_MAX_RESOLUTION_SECONDS", 1800)

        await service.check_resolution_on_close(session, _db_mock_without_user())

    broadcast.assert_not_awaited()


@pytest.mark.asyncio
async def test_frt_breach_sends_telegram_when_enabled():
    service = SLAService()
    now = datetime.now(timezone.utc)
    session = SimpleNamespace(
        id=303,
        user_id=3,
        claimed_at=now - timedelta(minutes=3),
        first_response_at=now,
    )

    with pytest.MonkeyPatch.context() as mp:
        broadcast = AsyncMock()
        telegram_send = AsyncMock(return_value=True)
        mp.setattr("app.services.sla_service.ws_manager.broadcast_to_all", broadcast)
        mp.setattr("app.services.sla_service.telegram_service.send_alert_message", telegram_send)
        mp.setattr("app.services.sla_service.settings.SLA_MAX_FRT_SECONDS", 120)
        mp.setattr("app.services.sla_service.settings.SLA_ALERT_TELEGRAM_ENABLED", True)

        await service.check_frt_on_first_response(session, _db_mock_without_user())

    broadcast.assert_awaited_once()
    telegram_send.assert_awaited_once()
