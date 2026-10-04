"""Live KPIs: 120s cache-aside + 10 parallel session-per-query fetches (R3-M20)."""
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from app.services import analytics_service as analytics_mod
from app.services.analytics_service import CACHE_TTL_SECONDS, AnalyticsService


def _session_cm(session):
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=session)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


@pytest.mark.asyncio
async def test_cache_hit_returns_cached_payload_without_sessions():
    redis = Mock()
    redis.get = AsyncMock(return_value='{"waiting": 1}')
    svc = AnalyticsService()
    with (
        patch.object(analytics_mod, "redis_client", redis),
        patch.object(analytics_mod, "AsyncSessionLocal", Mock()) as mock_factory,
    ):
        result = await svc.get_live_kpis(AsyncMock())
    assert result["cache_hit"] is True
    assert result["waiting"] == 1
    mock_factory.assert_not_called()


def _miss_mocks(canned=4):
    """Shared mock session: gather makes cross-query call order
    nondeterministic, so every call returns the SAME canned scalar and the
    test asserts aggregate shape + 10 session opens."""
    result = MagicMock()
    result.scalar.return_value = canned
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=canned)
    session.execute = AsyncMock(return_value=result)
    factory = Mock(return_value=_session_cm(session))
    redis = Mock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()
    return factory, redis


@pytest.mark.asyncio
async def test_cache_miss_computes_caches_and_opens_ten_sessions():
    factory, redis = _miss_mocks()
    svc = AnalyticsService()
    with (
        patch.object(analytics_mod, "redis_client", redis),
        patch.object(analytics_mod, "AsyncSessionLocal", factory),
        patch.object(svc, "calculate_fcr_rate", new=AsyncMock(return_value=1.0)),
        patch.object(svc, "calculate_abandonment_rate", new=AsyncMock(return_value=2.0)),
        patch.object(svc, "calculate_sla_breach_events", new=AsyncMock(return_value=3)),
    ):
        result = await svc.get_live_kpis(AsyncMock())

    assert result["cache_hit"] is False
    assert result["waiting"] == 4
    assert result["active"] == 4
    assert result["avg_first_response_seconds"] == 4
    assert result["avg_resolution_seconds"] == 4
    assert result["csat_average"] == 4
    assert result["csat_percentage"] == 80.0
    assert result["fcr_rate"] == 1.0
    assert result["abandonment_rate"] == 2.0
    assert result["sla_breach_events_24h"] == 3
    assert result["sessions_today"] == 4
    assert result["human_mode_users"] == 4
    assert isinstance(result["timestamp"], str)
    factory.assert_called()
    assert factory.call_count == 10
    redis.setex.assert_awaited_once()
    args = redis.setex.await_args.args
    assert args[0] == "analytics:live_kpis"
    assert args[1] == CACHE_TTL_SECONDS


@pytest.mark.asyncio
async def test_decimal_averages_survive_cache_round_trip_as_numbers():
    """F1: func.avg yields Decimal — cached payload must hold numbers, not strings."""
    import json
    from decimal import Decimal

    factory, redis = _miss_mocks()
    svc = AnalyticsService()
    with (
        patch.object(analytics_mod, "redis_client", redis),
        patch.object(analytics_mod, "AsyncSessionLocal", factory),
        patch.object(analytics_mod, "_kpi_avg_frt", new=AsyncMock(return_value=Decimal("12.34"))),
        patch.object(analytics_mod, "_kpi_avg_resolution", new=AsyncMock(return_value=Decimal("56.78"))),
        patch.object(analytics_mod, "_kpi_csat_avg", new=AsyncMock(return_value=Decimal("4.5"))),
        patch.object(svc, "calculate_fcr_rate", new=AsyncMock(return_value=1.0)),
        patch.object(svc, "calculate_abandonment_rate", new=AsyncMock(return_value=2.0)),
        patch.object(svc, "calculate_sla_breach_events", new=AsyncMock(return_value=3)),
    ):
        result = await svc.get_live_kpis(AsyncMock())

    assert result["avg_first_response_seconds"] == 12.3
    assert isinstance(result["avg_first_response_seconds"], float)
    cached = json.loads(redis.setex.await_args.args[2])
    assert cached["avg_first_response_seconds"] == 12.3
    assert isinstance(cached["avg_first_response_seconds"], float)
    assert isinstance(cached["avg_resolution_seconds"], float)
    assert isinstance(cached["csat_average"], float)


@pytest.mark.asyncio
async def test_corrupt_cache_treated_as_miss():
    """F10: unparseable cache value recomputes (fail-open) and evicts the key."""
    factory, redis = _miss_mocks()
    redis.get = AsyncMock(return_value="{not-json")
    redis.delete = AsyncMock()
    svc = AnalyticsService()
    with (
        patch.object(analytics_mod, "redis_client", redis),
        patch.object(analytics_mod, "AsyncSessionLocal", factory),
        patch.object(svc, "calculate_fcr_rate", new=AsyncMock(return_value=1.0)),
        patch.object(svc, "calculate_abandonment_rate", new=AsyncMock(return_value=2.0)),
        patch.object(svc, "calculate_sla_breach_events", new=AsyncMock(return_value=3)),
    ):
        result = await svc.get_live_kpis(AsyncMock())  # must not raise

    assert result["cache_hit"] is False
    assert result["waiting"] == 4
    redis.delete.assert_awaited_once_with("analytics:live_kpis")


@pytest.mark.asyncio
async def test_redis_down_still_computes():
    factory, redis = _miss_mocks()
    redis.get = AsyncMock(side_effect=ConnectionError("redis down"))
    redis.setex = AsyncMock(side_effect=ConnectionError("redis down"))
    svc = AnalyticsService()
    with (
        patch.object(analytics_mod, "redis_client", redis),
        patch.object(analytics_mod, "AsyncSessionLocal", factory),
        patch.object(svc, "calculate_fcr_rate", new=AsyncMock(return_value=1.0)),
        patch.object(svc, "calculate_abandonment_rate", new=AsyncMock(return_value=2.0)),
        patch.object(svc, "calculate_sla_breach_events", new=AsyncMock(return_value=3)),
    ):
        result = await svc.get_live_kpis(AsyncMock())  # must not raise

    assert result["cache_hit"] is False
    assert result["waiting"] == 4
    assert factory.call_count == 10
