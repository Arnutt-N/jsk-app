"""LINE channel toggle + quota readout for booking notifications.

Operator decisions 2026-10-21: channels send independently (both go out when
both are on), `line_enabled` defaults OFF (explicit opt-in from the settings
menu), quota display is read-only.
"""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_bookings
from app.schemas.booking import BookingSettingsIn
from app.services import booking_notifications
from app.services.booking_service import BookingConfig, ReminderUnit
from app.services.line_service import line_service


def _booking(**overrides):
    values = {
        "queue_number": "261019-002",
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": date(2026, 10, 21),
        "booking_time": time(9, 30),
        "contact_name": "สมชาย ใจดี",
        "email": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _config(**overrides):
    values = {"email_enabled": False, "line_enabled": True}
    values.update(overrides)
    return SimpleNamespace(**values)


def _full_config(**overrides):
    values = {
        "enabled": True,
        "service_types": ("ปรึกษากฎหมาย",),
        "slot_minutes": 30,
        "slot_capacity": 3,
        "advance_days": 14,
        "blackout_dates": frozenset(),
        "reminder_enabled": False,
        "reminder_lead_value": 1,
        "reminder_lead_unit": ReminderUnit.DAY,
        "walkin_enabled": True,
        "calendar_enabled": True,
        "resend_enabled": True,
        "assign_enabled": False,
        "email_enabled": False,
    }
    values.update(overrides)
    return BookingConfig(**values)


def test_line_toggle_defaults_off():
    assert _full_config().line_enabled is False


def test_settings_schema_accepts_the_line_toggle():
    assert BookingSettingsIn(**_settings_payload()).line_enabled is False
    assert BookingSettingsIn(**_settings_payload(line_enabled=True)).line_enabled is True


def test_settings_schema_omitted_line_toggle_stays_none():
    payload = _settings_payload()
    del payload["line_enabled"]
    assert BookingSettingsIn(**payload).line_enabled is None


def _settings_payload(**overrides):
    values = {
        "enabled": True,
        "service_types": ["ปรึกษากฎหมาย"],
        "slot_minutes": 30,
        "slot_capacity": 3,
        "advance_days": 14,
        "blackout_dates": [],
        "reminder_enabled": False,
        "reminder_lead_value": 1,
        "reminder_lead_unit": ReminderUnit.DAY,
        "email_enabled": False,
        "line_enabled": False,
    }
    values.update(overrides)
    return values


@pytest.mark.asyncio
async def test_line_toggle_off_skips_push_without_calling_line():
    db = AsyncMock()
    booking = _booking()
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config(line_enabled=False))
    ), patch.object(
        booking_notifications, "resolve_raw_for_push", new=AsyncMock(return_value="U1")
    ), patch.object(
        booking_notifications.line_service, "push_messages", new=AsyncMock()
    ) as push:
        assert await booking_notifications.notify_booking_confirmed(db, booking, SimpleNamespace(id=7)) is False
    push.assert_not_called()


@pytest.mark.asyncio
async def test_both_channels_on_sends_both():
    db = AsyncMock()
    booking = _booking(email="citizen@example.com")
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config(email_enabled=True, line_enabled=True))
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock(return_value=True)
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock(return_value=True)
    ) as push:
        assert await booking_notifications.notify_booking_confirmed(db, booking, SimpleNamespace()) is True
    mail.assert_awaited_once()
    push.assert_awaited_once()


@pytest.mark.asyncio
async def test_both_channels_off_sends_nothing():
    db = AsyncMock()
    booking = _booking(email="citizen@example.com")
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config(email_enabled=False, line_enabled=False))
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock()
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock(return_value=False)
    ) as push:
        assert await booking_notifications.notify_booking_confirmed(db, booking, SimpleNamespace()) is False
    mail.assert_not_awaited()
    push.assert_awaited_once()


@pytest.mark.asyncio
async def test_reminder_line_off_skips_push_but_email_still_goes():
    db = AsyncMock()
    booking = _booking(email="citizen@example.com")
    with patch.object(
        booking_notifications, "load_booking_config", new=AsyncMock(return_value=_config(email_enabled=True, line_enabled=False))
    ), patch.object(
        booking_notifications, "send_booking_email", new=AsyncMock(return_value=True)
    ) as mail, patch.object(
        booking_notifications, "_push_flex", new=AsyncMock(return_value=False)
    ) as push:
        assert await booking_notifications.send_booking_reminder(db, booking, SimpleNamespace()) is True
    mail.assert_awaited_once()
    push.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_settings_omitted_line_toggle_keeps_stored_value():
    db = AsyncMock()
    payload = BookingSettingsIn(**{k: v for k, v in _settings_payload().items() if k != "line_enabled"})
    assert payload.line_enabled is None
    captured = {}
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_full_config(line_enabled=True))
    ), patch.object(
        admin_bookings, "save_booking_config", new=AsyncMock(side_effect=lambda db, config: captured.update(config=config) or config)
    ), patch.object(
        admin_bookings, "create_audit_log", new=AsyncMock()
    ):
        result = await admin_bookings.update_booking_settings(payload, db=db, admin=SimpleNamespace(id=2))
    assert captured["config"].line_enabled is True
    assert result.line_enabled is True


@pytest.mark.asyncio
async def test_update_settings_explicit_line_toggle_is_honoured():
    db = AsyncMock()
    payload = BookingSettingsIn(**_settings_payload(line_enabled=True))
    captured = {}
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_full_config(line_enabled=False))
    ), patch.object(
        admin_bookings, "save_booking_config", new=AsyncMock(side_effect=lambda db, config: captured.update(config=config) or config)
    ), patch.object(
        admin_bookings, "create_audit_log", new=AsyncMock()
    ):
        result = await admin_bookings.update_booking_settings(payload, db=db, admin=SimpleNamespace(id=2))
    assert captured["config"].line_enabled is True
    assert result.line_enabled is True


def _reset_quota_cache():
    admin_bookings._cached_quota = None
    admin_bookings._cached_quota_at = 0.0


@pytest.mark.asyncio
async def test_line_quota_endpoint_returns_numbers_and_caches():
    _reset_quota_cache()
    db = AsyncMock()
    quota_resp = SimpleNamespace(value=500)
    consumption_resp = SimpleNamespace(total_usage=120)
    with patch.object(
        line_service, "_call_with_circuit", new=AsyncMock(side_effect=[quota_resp, consumption_resp])
    ) as circuit:
        first = await admin_bookings.get_line_quota(db=db, _staff=SimpleNamespace(id=2))
        second = await admin_bookings.get_line_quota(db=db, _staff=SimpleNamespace(id=2))
    assert (first.quota, first.consumption, first.remaining) == (500, 120, 380)
    assert (second.quota, second.consumption, second.remaining) == (500, 120, 380)
    assert circuit.await_count == 2
    _reset_quota_cache()


@pytest.mark.asyncio
async def test_line_quota_unlimited_plan_reports_none():
    _reset_quota_cache()
    db = AsyncMock()
    with patch.object(
        line_service, "_call_with_circuit", new=AsyncMock(side_effect=[SimpleNamespace(value=None), SimpleNamespace(total_usage=7)])
    ):
        result = await admin_bookings.get_line_quota(db=db, _staff=SimpleNamespace(id=2))
    assert result.quota is None
    assert result.consumption == 7
    assert result.remaining is None
    _reset_quota_cache()


@pytest.mark.asyncio
async def test_line_quota_upstream_failure_is_a_thai_502():
    _reset_quota_cache()
    db = AsyncMock()
    with patch.object(
        line_service, "_call_with_circuit", new=AsyncMock(side_effect=OSError("LINE down"))
    ), pytest.raises(HTTPException) as exc:
        await admin_bookings.get_line_quota(db=db, _staff=SimpleNamespace(id=2))
    assert exc.value.status_code == 502
    assert "LINE" in exc.value.detail
    _reset_quota_cache()
