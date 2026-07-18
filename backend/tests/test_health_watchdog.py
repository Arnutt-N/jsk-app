"""Tests for the health watchdog background task (app/tasks/health_watchdog.py).

The watchdog's alert decisions are a state machine over component health:
alert on healthy->down transition, stay silent inside the cooldown window,
re-alert after cooldown, and send a recovery notice on down->healthy.
"""
from unittest.mock import AsyncMock

import pytest

from app.tasks.health_watchdog import HealthWatchdog


BASE = 1_000_000.0  # arbitrary reference timestamp


def make_watchdog(cooldown: int = 900) -> HealthWatchdog:
    return HealthWatchdog(alert_cooldown_seconds=cooldown)


def test_first_failure_emits_breach_alert():
    wd = make_watchdog()
    alerts = wd.evaluate({"database": False, "redis": True}, now=BASE)
    assert len(alerts) == 1
    assert "database" in alerts[0]
    assert "DOWN" in alerts[0]


def test_still_down_within_cooldown_is_silent():
    wd = make_watchdog(cooldown=900)
    wd.evaluate({"database": False, "redis": True}, now=BASE)
    alerts = wd.evaluate({"database": False, "redis": True}, now=BASE + 60)
    assert alerts == []


def test_still_down_after_cooldown_realerts():
    wd = make_watchdog(cooldown=900)
    wd.evaluate({"database": False, "redis": True}, now=BASE)
    alerts = wd.evaluate({"database": False, "redis": True}, now=BASE + 901)
    assert len(alerts) == 1
    assert "database" in alerts[0]


def test_recovery_emits_recovery_alert():
    wd = make_watchdog()
    wd.evaluate({"database": False, "redis": True}, now=BASE)
    alerts = wd.evaluate({"database": True, "redis": True}, now=BASE + 60)
    assert len(alerts) == 1
    assert "database" in alerts[0]
    assert "RECOVERED" in alerts[0]


def test_healthy_steady_state_is_silent():
    wd = make_watchdog()
    assert wd.evaluate({"database": True, "redis": True}, now=BASE) == []
    assert wd.evaluate({"database": True, "redis": True}, now=BASE + 60) == []


def test_multiple_components_alert_independently():
    wd = make_watchdog()
    alerts = wd.evaluate({"database": False, "redis": False}, now=BASE)
    assert len(alerts) == 2

    # redis recovers while database stays down (inside cooldown)
    alerts = wd.evaluate({"database": False, "redis": True}, now=BASE + 60)
    assert len(alerts) == 1
    assert "redis" in alerts[0]
    assert "RECOVERED" in alerts[0]


class _FakeRedis:
    """Minimal shared fake for SET NX EX (the claim_once primitive)."""

    def __init__(self):
        self.kv: dict[str, str] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.kv:
            return None
        self.kv[key] = value
        return True


@pytest.mark.asyncio
async def test_run_once_sends_alerts_via_telegram(monkeypatch):
    from app.core.config import settings
    from app.core.redis_client import redis_client
    from app.tasks import health_watchdog as hw

    monkeypatch.setattr(settings, "HEALTH_ALERT_TELEGRAM_ENABLED", True)
    # Redis down -> claim_once returns None -> send anyway (deterministic).
    monkeypatch.setattr(redis_client, "_redis", None)

    wd = make_watchdog()
    wd.check_components = AsyncMock(return_value={"database": False, "redis": True})
    send_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(hw.telegram_service, "send_alert_message", send_mock)

    await wd.run_once()

    send_mock.assert_awaited_once()
    sent_text = send_mock.await_args.kwargs.get("text") or send_mock.await_args.args[0]
    assert "database" in sent_text


@pytest.mark.asyncio
async def test_run_once_skips_telegram_when_disabled(monkeypatch):
    from app.core.config import settings
    from app.tasks import health_watchdog as hw

    monkeypatch.setattr(settings, "HEALTH_ALERT_TELEGRAM_ENABLED", False)

    wd = make_watchdog()
    wd.check_components = AsyncMock(return_value={"database": False, "redis": True})
    send_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(hw.telegram_service, "send_alert_message", send_mock)

    await wd.run_once()

    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_two_workers_send_alert_only_once(monkeypatch):
    """Simulate two worker processes sharing one Redis: the same DOWN
    transition must reach the operator chat exactly once, not per worker."""
    from app.core.config import settings
    from app.core.redis_client import redis_client
    from app.tasks import health_watchdog as hw

    monkeypatch.setattr(settings, "HEALTH_ALERT_TELEGRAM_ENABLED", True)
    monkeypatch.setattr(redis_client, "_redis", _FakeRedis())

    send_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(hw.telegram_service, "send_alert_message", send_mock)

    # Two independent watchdogs (their own per-process state machines).
    down = {"database": False, "redis": True}
    for _ in range(2):
        wd = make_watchdog()
        wd.check_components = AsyncMock(return_value=down)
        await wd.run_once()

    send_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_alert_sent_when_redis_unavailable(monkeypatch):
    """Redis down must not swallow the alert (claim_once -> None -> send)."""
    from app.core.config import settings
    from app.core.redis_client import redis_client
    from app.tasks import health_watchdog as hw

    monkeypatch.setattr(settings, "HEALTH_ALERT_TELEGRAM_ENABLED", True)
    monkeypatch.setattr(redis_client, "_redis", None)

    send_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(hw.telegram_service, "send_alert_message", send_mock)

    wd = make_watchdog()
    wd.check_components = AsyncMock(return_value={"database": False, "redis": True})
    await wd.run_once()

    send_mock.assert_awaited_once()
