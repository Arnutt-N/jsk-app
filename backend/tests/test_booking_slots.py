"""Slot availability engine — pure logic, no database.

Every hard rule of this feature lives at a boundary: a slot that would run past
closing time, a slot that started ten minutes ago, the last day inside the
booking window, a public holiday that day-of-week hours cannot express. Keeping
the engine pure lets all of them be pinned down cheaply.
"""
from datetime import date, datetime, time, timedelta

import pytest

from app.models.business_hours import BusinessHours
from app.services.booking_service import (
    BookingConfig,
    ReminderUnit,
    compute_slots,
)


TODAY = date(2026, 8, 12)  # a Wednesday
NOW = datetime(2026, 8, 12, 9, 15)  # 09:15 local, mid-morning


def _hours(open_time="08:00", close_time="17:00", is_open=True, day=TODAY):
    return BusinessHours(
        day_of_week=day.weekday(),
        open_time=open_time,
        close_time=close_time,
        is_open=is_open,
    )


def _hours_for(day):
    """The caller looks up the row for the right weekday; this mirrors that."""
    return _hours(day=day)


def _config(**overrides):
    defaults = dict(
        enabled=True,
        service_types=("ปรึกษากฎหมาย", "ไกล่เกลี่ยข้อพิพาท"),
        slot_minutes=30,
        slot_capacity=3,
        advance_days=14,
        blackout_dates=frozenset(),
        reminder_enabled=True,
        reminder_lead_value=1,
        reminder_lead_unit=ReminderUnit.DAY,
    )
    defaults.update(overrides)
    return BookingConfig(**defaults)


def _slots(target_date=None, day_hours=..., config=None, booked_counts=None, now=NOW):
    return compute_slots(
        target_date=target_date or date(2026, 8, 19),  # a week out, avoids "today"
        day_hours=_hours() if day_hours is ... else day_hours,
        config=config or _config(),
        booked_counts=booked_counts or {},
        now_local=now,
    )


# --- days with no bookable slots at all ---


def test_closed_day_has_no_slots():
    assert _slots(day_hours=_hours(is_open=False)) == []


def test_day_with_no_business_hours_row_has_no_slots():
    assert _slots(day_hours=None) == []


def test_blackout_date_has_no_slots():
    """business_hours only models day-of-week, so holidays need their own list."""
    holiday = date(2026, 8, 19)
    config = _config(blackout_dates=frozenset({holiday}))
    assert _slots(target_date=holiday, config=config) == []


def test_past_date_has_no_slots():
    assert _slots(target_date=date(2026, 8, 11)) == []


def test_booking_disabled_yields_no_slots():
    assert _slots(config=_config(enabled=False)) == []


# --- the booking window ---


def test_last_day_inside_the_window_is_bookable():
    last_day = TODAY + timedelta(days=14)
    assert _slots(target_date=last_day, day_hours=_hours_for(last_day)) != []


def test_one_day_past_the_window_is_not_bookable():
    too_far = TODAY + timedelta(days=15)
    assert _slots(target_date=too_far, day_hours=_hours_for(too_far)) == []


# --- slot generation ---


def test_slots_cover_opening_hours_at_the_configured_interval():
    slots = _slots()
    assert [s.start for s in slots][:3] == [time(8, 0), time(8, 30), time(9, 0)]
    # 08:00-17:00 in 30-minute steps = 18 slots, the last starting 16:30.
    assert len(slots) == 18
    assert slots[-1].start == time(16, 30)


def test_a_slot_that_would_run_past_closing_is_dropped():
    """With 45-minute slots and a 17:00 close, 16:30 would end at 17:15."""
    slots = _slots(config=_config(slot_minutes=45))
    assert slots[-1].start == time(16, 15)  # 16:15 + 45min = 17:00 exactly


def test_today_hides_slots_that_have_already_started():
    slots = _slots(target_date=TODAY, now=NOW)  # 09:15
    starts = [s.start for s in slots]
    assert time(9, 0) not in starts, "09:00 already started"
    assert starts[0] == time(9, 30)


def test_a_future_date_keeps_its_early_slots():
    """The 'already started' rule must not leak into other days."""
    slots = _slots(target_date=date(2026, 8, 19), now=NOW)
    assert slots[0].start == time(8, 0)


# --- capacity accounting ---


def test_slots_start_at_full_capacity_when_nothing_is_booked():
    slot = _slots()[0]
    assert slot.capacity == 3
    assert slot.booked == 0
    assert slot.remaining == 3
    assert slot.is_full is False


def test_existing_bookings_reduce_the_remaining_count():
    slots = _slots(booked_counts={time(8, 0): 2})
    assert slots[0].remaining == 1
    assert slots[0].is_full is False


def test_a_slot_at_capacity_is_full():
    slots = _slots(booked_counts={time(8, 0): 3})
    assert slots[0].remaining == 0
    assert slots[0].is_full is True


def test_remaining_never_goes_negative():
    """Capacity can be lowered in settings after bookings already exist."""
    slots = _slots(booked_counts={time(8, 0): 5})
    assert slots[0].remaining == 0
    assert slots[0].is_full is True


@pytest.mark.parametrize("unit", [ReminderUnit.DAY, ReminderUnit.HOUR])
def test_reminder_unit_is_part_of_the_config(unit):
    config = _config(reminder_lead_unit=unit)
    assert config.reminder_lead_unit is unit


def test_config_is_immutable():
    """Config is read fresh each scheduler pass; accidental mutation would stick."""
    config = _config()
    with pytest.raises(Exception):
        config.slot_capacity = 99
