"""Loading the admin-editable booking configuration out of `system_settings`.

Settings are free-text rows an admin can edit, so every read has to survive
garbage: a malformed JSON list, a capacity someone typed as "three", a reminder
unit that no longer exists. The reminder scheduler re-reads this on every pass,
so a parse error that raised would take the background loop down — it must fall
back to a safe default and say so in the log instead.
"""
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.services import booking_settings
from app.services.booking_settings import DEFAULTS, load_booking_config
from app.services.booking_service import ReminderUnit


def _stub_settings(values):
    """Patch SettingsService.get_setting to serve `values` (key -> raw string)."""

    async def _get(db, key, default=""):
        return values.get(key, default)

    return patch.object(booking_settings.SettingsService, "get_setting", new=_get)


async def _load(values):
    with _stub_settings(values):
        return await load_booking_config(AsyncMock())


# --- defaults ---


@pytest.mark.asyncio
async def test_unset_settings_fall_back_to_defaults():
    config = await _load({})
    assert config.slot_minutes == DEFAULTS.slot_minutes
    assert config.slot_capacity == DEFAULTS.slot_capacity
    assert config.advance_days == DEFAULTS.advance_days
    assert config.reminder_lead_unit == DEFAULTS.reminder_lead_unit


@pytest.mark.asyncio
async def test_booking_is_disabled_by_default():
    """A half-configured feature must not quietly accept public bookings."""
    config = await _load({})
    assert config.enabled is False
    assert config.service_types == ()


# --- happy path ---


@pytest.mark.asyncio
async def test_values_are_parsed_into_typed_config():
    config = await _load(
        {
            "booking_enabled": "true",
            "booking_service_types": '["ปรึกษากฎหมาย", "ไกล่เกลี่ยข้อพิพาท"]',
            "booking_slot_minutes": "45",
            "booking_slot_capacity": "5",
            "booking_advance_days": "30",
            "booking_blackout_dates": '["2026-12-05", "2026-12-10"]',
            "booking_reminder_enabled": "true",
            "booking_reminder_lead_value": "2",
            "booking_reminder_lead_unit": "HOUR",
        }
    )
    assert config.enabled is True
    assert config.service_types == ("ปรึกษากฎหมาย", "ไกล่เกลี่ยข้อพิพาท")
    assert config.slot_minutes == 45
    assert config.slot_capacity == 5
    assert config.advance_days == 30
    assert config.blackout_dates == frozenset({date(2026, 12, 5), date(2026, 12, 10)})
    assert config.reminder_enabled is True
    assert config.reminder_lead_value == 2
    assert config.reminder_lead_unit is ReminderUnit.HOUR


@pytest.mark.parametrize(
    "raw,expected", [("true", True), ("True", True), ("1", True), ("false", False), ("0", False), ("", False)]
)
@pytest.mark.asyncio
async def test_boolean_parsing_accepts_what_admins_actually_type(raw, expected):
    config = await _load({"booking_enabled": raw})
    assert config.enabled is expected


@pytest.mark.asyncio
async def test_reminder_lead_converts_to_a_timedelta():
    day = await _load({"booking_reminder_lead_value": "1", "booking_reminder_lead_unit": "DAY"})
    hour = await _load({"booking_reminder_lead_value": "3", "booking_reminder_lead_unit": "HOUR"})
    assert day.reminder_lead == timedelta(days=1)
    assert hour.reminder_lead == timedelta(hours=3)


# --- malformed input must not crash the caller ---


@pytest.mark.asyncio
async def test_malformed_json_falls_back_to_the_default(caplog):
    config = await _load({"booking_service_types": "not json at all"})
    assert config.service_types == DEFAULTS.service_types
    assert "booking_service_types" in caplog.text, "a bad value must be logged, not swallowed"


@pytest.mark.asyncio
async def test_json_of_the_wrong_shape_falls_back():
    config = await _load({"booking_service_types": '{"a": 1}'})
    assert config.service_types == DEFAULTS.service_types


@pytest.mark.asyncio
async def test_non_numeric_integer_falls_back(caplog):
    config = await _load({"booking_slot_capacity": "three"})
    assert config.slot_capacity == DEFAULTS.slot_capacity
    assert "booking_slot_capacity" in caplog.text


@pytest.mark.asyncio
async def test_unknown_reminder_unit_falls_back(caplog):
    config = await _load({"booking_reminder_lead_unit": "FORTNIGHT"})
    assert config.reminder_lead_unit == DEFAULTS.reminder_lead_unit
    assert "booking_reminder_lead_unit" in caplog.text


@pytest.mark.asyncio
async def test_unparseable_blackout_date_is_dropped_not_fatal(caplog):
    config = await _load({"booking_blackout_dates": '["2026-12-05", "the 5th"]'})
    assert config.blackout_dates == frozenset({date(2026, 12, 5)})
    assert "the 5th" in caplog.text


@pytest.mark.asyncio
async def test_nonsensical_numbers_are_clamped_to_something_usable():
    """A zero or negative slot length would make the slot loop spin forever."""
    config = await _load({"booking_slot_minutes": "0", "booking_slot_capacity": "-4"})
    assert config.slot_minutes >= 1
    assert config.slot_capacity >= 0
