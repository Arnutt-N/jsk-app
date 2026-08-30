"""Availability range: per-day open/full status for the LIFF date strip.

The strip must disable closed/full days *before* the citizen taps them. The
service reuses the single-day pure engine (`compute_slots`) per day, but the
database cost must stay flat: exactly two queries (business hours + grouped
booked counts) no matter how long the requested window is.
"""
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.api.v1.endpoints import liff_bookings
from app.models.business_hours import BusinessHours
from app.services import booking_service
from app.services.booking_service import (
    BookingConfig,
    UnknownServiceTypeError,
    get_availability_range,
)


NOW = datetime(2026, 8, 12, 9, 15)  # Wednesday, 09:15 local
TODAY = date(2026, 8, 12)
SERVICE = "ปรึกษากฎหมาย"


def _config(**overrides):
    defaults = dict(
        enabled=True,
        service_types=(SERVICE,),
        slot_minutes=30,
        slot_capacity=2,
        advance_days=14,
        blackout_dates=frozenset(),
        reminder_enabled=False,
        reminder_lead_value=1,
        reminder_lead_unit=booking_service.ReminderUnit.DAY,
    )
    defaults.update(overrides)
    return BookingConfig(**defaults)


def _hours(weekday, is_open=True, open_time="08:00", close_time="17:00"):
    return BusinessHours(
        day_of_week=weekday, open_time=open_time, close_time=close_time, is_open=is_open
    )


def _db(hours=None, count_rows=None):
    """AsyncSession stub answering exactly two queries: hours, then counts."""
    db = AsyncMock()
    hours_result = MagicMock()
    hours_result.scalars.return_value.all.return_value = list(hours or [])
    counts_result = MagicMock()
    counts_result.all.return_value = list(count_rows or [])
    db.execute = AsyncMock(side_effect=[hours_result, counts_result])
    return db


async def _run(db, *, start=TODAY, end=TODAY + timedelta(days=13), config=None):
    with patch.object(booking_service, "local_now", return_value=NOW):
        return await get_availability_range(
            db,
            service_type=SERVICE,
            start_date=start,
            end_date=end,
            config=config or _config(),
        )


def _slot_times(day_hours):
    """The slot grid `compute_slots` will produce for the given hours row."""
    from datetime import datetime as dt

    times = []
    cursor = dt.combine(TODAY, time.fromisoformat(day_hours.open_time))
    if day_hours.close_time == "24:00":
        closing = dt.combine(TODAY + timedelta(days=1), time(0, 0))
    else:
        closing = dt.combine(TODAY, time.fromisoformat(day_hours.close_time))
    while cursor + timedelta(minutes=30) <= closing:
        times.append(cursor.time())
        cursor += timedelta(minutes=30)
    return times


@pytest.mark.asyncio
async def test_an_open_day_reports_is_open_and_summed_remaining():
    hours = _hours(TODAY.weekday())
    db = _db(hours=[hours])

    days = await _run(db, start=TODAY, end=TODAY)

    day = days[0]
    assert day.is_open is True
    assert day.remaining == sum(slot.remaining for slot in day.slots)
    assert day.remaining == len(day.slots) * 2  # every slot free, capacity 2


@pytest.mark.asyncio
async def test_a_weekday_with_no_business_hours_row_is_closed():
    db = _db(hours=[])  # no rows at all

    days = await _run(db, start=TODAY, end=TODAY)

    assert days[0].is_open is False
    assert days[0].remaining == 0


@pytest.mark.asyncio
async def test_a_closed_day_is_closed():
    db = _db(hours=[_hours(TODAY.weekday(), is_open=False)])

    days = await _run(db, start=TODAY, end=TODAY)

    assert days[0].is_open is False
    assert days[0].remaining == 0


@pytest.mark.asyncio
async def test_a_blackout_date_is_closed():
    db = _db(hours=[_hours(TODAY.weekday())])

    days = await _run(db, config=_config(blackout_dates=frozenset({TODAY})), start=TODAY, end=TODAY)

    assert days[0].is_open is False
    assert days[0].remaining == 0


@pytest.mark.asyncio
async def test_dates_outside_the_advance_window_or_in_the_past_are_closed():
    hours = _hours(TODAY.weekday())
    db = _db(hours=[hours])

    days = await _run(db, start=TODAY - timedelta(days=1), end=TODAY + timedelta(days=15))

    # One row per requested day, ascending, regardless of open/closed.
    expected = [TODAY - timedelta(days=1) + timedelta(days=i) for i in range(17)]
    assert [day.date for day in days] == expected
    # Yesterday: closed. The last day (beyond advance_days=14): closed.
    assert days[0].is_open is False
    assert days[-1].is_open is False
    # Today itself (inside the window): open.
    assert days[1].is_open is True


@pytest.mark.asyncio
async def test_a_full_day_is_open_with_zero_remaining():
    """is_open means 'accepts bookings at all' — a full day is open but has
    zero remaining, which is what the frontend disables on."""
    hours = _hours(TODAY.weekday())
    count_rows = [(TODAY, slot_time, 2) for slot_time in _slot_times(hours)]
    db = _db(hours=[hours], count_rows=count_rows)

    days = await _run(db, start=TODAY, end=TODAY)

    day = days[0]
    assert day.is_open is True
    assert day.remaining == 0
    assert all(slot.is_full for slot in day.slots)


@pytest.mark.asyncio
async def test_a_full_day_close_hours_row_produces_slots_until_midnight():
    hours = _hours(TODAY.weekday(), close_time="24:00")
    db = _db(hours=[hours])

    days = await _run(db, start=TODAY, end=TODAY)

    day = days[0]
    assert day.is_open is True
    assert day.slots[-1].start == time(23, 30)


@pytest.mark.asyncio
async def test_an_unknown_service_type_is_rejected_before_any_query():
    db = _db()

    with patch.object(booking_service, "local_now", return_value=NOW):
        with pytest.raises(UnknownServiceTypeError):
            await get_availability_range(
                db,
                service_type="บริการที่ไม่มีอยู่จริง",
                start_date=TODAY,
                end_date=TODAY,
                config=_config(),
            )

    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_the_window_is_served_by_exactly_two_queries():
    """Batching is the whole point: 14 days must not mean 28 queries."""
    db = _db(hours=[_hours(weekday) for weekday in range(7)])

    await _run(db)  # 14-day window

    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_the_counts_query_filters_by_service_window_and_active_status():
    db = _db(hours=[_hours(TODAY.weekday())])

    await _run(db, start=TODAY, end=TODAY + timedelta(days=13))

    stmt = db.execute.await_args_list[1].args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "bookings.service_type = 'ปรึกษากฎหมาย'" in sql
    assert "bookings.booking_date >=" in sql and "2026-08-12" in sql
    assert "bookings.booking_date <=" in sql and "2026-08-25" in sql
    assert "bookings.status IN ('CONFIRMED')" in sql
    assert "GROUP BY bookings.booking_date, bookings.booking_time" in sql


# --- endpoint: guards and shape (direct call, style of test_liff_bookings_endpoints.py) ---


def _enabled_config():
    return SimpleNamespace(enabled=True, service_types=(SERVICE,))


def _day(date_, is_open=True, remaining=4):
    return SimpleNamespace(date=date_, is_open=is_open, remaining=remaining)


@pytest.mark.asyncio
async def test_endpoint_rejects_a_missing_token_with_401():
    with pytest.raises(HTTPException) as exc:
        await liff_bookings.require_line_user_id(x_liff_id_token=None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_endpoint_returns_422_for_an_inverted_range():
    with pytest.raises(HTTPException) as exc:
        await liff_bookings.get_availability_range(
            service_type=SERVICE,
            range_start=TODAY,
            range_end=TODAY - timedelta(days=1),
            db=AsyncMock(),
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_endpoint_returns_422_for_a_window_longer_than_62_days():
    with pytest.raises(HTTPException) as exc:
        await liff_bookings.get_availability_range(
            service_type=SERVICE,
            range_start=TODAY,
            range_end=TODAY + timedelta(days=63),
            db=AsyncMock(),
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_endpoint_returns_503_while_booking_is_disabled():
    disabled = SimpleNamespace(enabled=False, service_types=())
    with patch.object(liff_bookings, "load_booking_config", new=AsyncMock(return_value=disabled)):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.get_availability_range(
                service_type=SERVICE,
                range_start=TODAY,
                range_end=TODAY,
                db=AsyncMock(),
            )
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_endpoint_maps_an_unknown_service_to_404():
    db = AsyncMock()
    with patch.object(liff_bookings, "load_booking_config", new=AsyncMock(return_value=_enabled_config())), \
         patch.object(
             liff_bookings.booking_service,
             "get_availability_range",
             new=AsyncMock(side_effect=UnknownServiceTypeError(SERVICE)),
         ):
        with pytest.raises(HTTPException) as exc:
            await liff_bookings.get_availability_range(
                service_type="บริการที่ไม่มีอยู่จริง",
                range_start=TODAY,
                range_end=TODAY,
                db=db,
            )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_maps_service_rows_into_the_day_schema_ascending():
    """Ordering is the service's contract (pinned in its own tests); the
    endpoint just maps rows into the response schema without reordering."""
    rows = [
        _day(TODAY, is_open=False, remaining=0),
        _day(TODAY + timedelta(days=1), is_open=True, remaining=6),
        _day(TODAY + timedelta(days=2), is_open=True, remaining=0),
    ]
    with patch.object(liff_bookings, "load_booking_config", new=AsyncMock(return_value=_enabled_config())), \
         patch.object(
             liff_bookings.booking_service,
             "get_availability_range",
             new=AsyncMock(return_value=rows),
         ):
        result = await liff_bookings.get_availability_range(
            service_type=SERVICE,
            range_start=TODAY,
            range_end=TODAY + timedelta(days=2),
            db=AsyncMock(),
        )

    assert result.service_type == SERVICE
    assert [(day.date, day.is_open, day.remaining) for day in result.days] == [
        (TODAY, False, 0),
        (TODAY + timedelta(days=1), True, 6),
        (TODAY + timedelta(days=2), True, 0),
    ]
