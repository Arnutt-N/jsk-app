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


@pytest.mark.asyncio
async def test_run_once_sends_alerts_via_telegram(monkeypatch):
    from app.core.config import settings
    from app.tasks import health_watchdog as hw

    monkeypatch.setattr(settings, "HEALTH_ALERT_TELEGRAM_ENABLED", True)

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
