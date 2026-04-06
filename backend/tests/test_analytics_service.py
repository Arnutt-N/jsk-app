"""Unit tests for analytics service abandonment metrics."""
import pytest
from unittest.mock import AsyncMock
from types import SimpleNamespace

from sqlalchemy.dialects import postgresql

from app.services.analytics_service import AnalyticsService


@pytest.fixture
def service():
    return AnalyticsService()


@pytest.mark.asyncio
async def test_abandonment_rate_zero_when_no_sessions(service):
    mock_db = AsyncMock()
    mock_db.scalar.side_effect = [0, 0]  # abandoned, claimed

    rate = await service.calculate_abandonment_rate(mock_db, days=7)
    assert rate == 0.0


@pytest.mark.asyncio
async def test_abandonment_rate_calculation(service):
    mock_db = AsyncMock()
    mock_db.scalar.side_effect = [2, 8]  # abandoned, claimed

    rate = await service.calculate_abandonment_rate(mock_db, days=7)
    assert rate == 20.0


@pytest.mark.asyncio
async def test_emit_live_kpis_update_broadcasts_to_subscribers(service):
    mock_db = AsyncMock()
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(service, "get_live_kpis", AsyncMock(return_value={"waiting": 1, "active": 2}))
        mock_ws_manager = AsyncMock()
        mp.setattr("app.core.websocket_manager.ws_manager", mock_ws_manager)
        await service.emit_live_kpis_update(mock_db)

    mock_ws_manager.broadcast_analytics_update.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_operator_availability_map_returns_zero_when_redis_disconnected(service):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.services.analytics_service.redis_client._redis", None)
        result = await service.get_operator_availability_map([1, 2], days=7)

    assert result["1"]["availability_seconds"] == 0.0
    assert result["2"]["availability_percent"] == 0.0


@pytest.mark.asyncio
async def test_get_operator_performance_includes_availability_and_queue_wait(service):
    mock_db = AsyncMock()
    query_result = SimpleNamespace(
        all=lambda: [
            SimpleNamespace(
                operator_id=7,
                total_sessions=3,
                avg_frt=15.0,
                avg_resolution=120.0,
                avg_queue_wait=30.0,
            )
        ]
    )
    mock_db.execute.return_value = query_result

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            service,
            "get_operator_availability_map",
            AsyncMock(
                return_value={
                    "7": {
                        "availability_seconds": 7200.0,
                        "availability_percent": 4.2,
                    }
                }
            ),
        )
        data = await service.get_operator_performance(mock_db, days=2)

    assert len(data) == 1
    assert data[0]["operator_name"] == "Operator 7"
    assert data[0]["avg_queue_wait_seconds"] == 30.0
    assert data[0]["availability_seconds"] == 7200.0
    assert data[0]["availability_percent"] == 4.2


@pytest.mark.asyncio
async def test_calculate_sla_breach_events_sums_all_categories(service):
    mock_db = AsyncMock()
    mock_db.scalar.side_effect = [1, 2, 3]  # queue wait, frt, resolution

    total = await service.calculate_sla_breach_events(mock_db, hours=24)

    assert total == 6


@pytest.mark.asyncio
async def test_get_session_volume_uses_literal_day_bucket(service):
    captured = {}

    class _FakeResult:
        def all(self):
            return []

    async def _capture(stmt):
        captured["stmt"] = stmt
        return _FakeResult()

    mock_db = AsyncMock()
    mock_db.execute.side_effect = _capture

    series = await service.get_session_volume(mock_db, days=7)

    compiled = str(
        captured["stmt"].compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "date_trunc('day', chat_sessions.started_at)" in compiled
    assert series[-1]["sessions"] == 0
