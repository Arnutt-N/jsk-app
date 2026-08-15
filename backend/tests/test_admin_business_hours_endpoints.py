"""Admin business-hours endpoints — schema guards + upsert/audit behaviour.

Direct-call style with fake DB (mirrors test_admin_bookings_endpoints.py), so
no real database is required.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints import admin_business_hours
from app.models.business_hours import BusinessHours
from app.schemas.business_hours import BusinessHoursDay, BusinessHoursUpdate


def _day(day_of_week, is_open=True, open_time="08:00", close_time="17:00"):
    return {
        "day_of_week": day_of_week,
        "is_open": is_open,
        "open_time": open_time,
        "close_time": close_time,
    }


def _week(overrides_by_day=None):
    """A full Mon-Sun payload; individual days can be overridden by index."""
    overrides_by_day = overrides_by_day or {}
    days = [_day(i) for i in range(7)]
    for idx, overrides in overrides_by_day.items():
        days[idx] = {**days[idx], **overrides}
    return {"days": days}


def _db_with_rows(rows):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db.execute.return_value = result
    return db


# --- schema validation (the schema is the guard) ---


def test_valid_week_round_trips():
    payload = BusinessHoursUpdate(**_week())
    assert len(payload.days) == 7
    assert [d.day_of_week for d in payload.days] == list(range(7))


def test_24_00_is_accepted_as_close_time():
    payload = BusinessHoursUpdate(**_week({0: {"open_time": "00:00", "close_time": "24:00"}}))
    assert payload.days[0].close_time == "24:00"


@pytest.mark.parametrize(
    "field,value",
    [
        ("open_time", "8:00"),
        ("open_time", "25:00"),
        ("open_time", "24:00"),
        ("open_time", "aa:bb"),
        ("close_time", "00:00"),
        ("close_time", "17:5"),
        ("close_time", "24:01"),
    ],
)
def test_malformed_times_are_rejected(field, value):
    with pytest.raises(ValidationError):
        BusinessHoursDay(day_of_week=0, is_open=True, **{field: value})


def test_open_not_before_close_is_rejected():
    with pytest.raises(ValidationError):
        BusinessHoursDay(day_of_week=0, is_open=True, open_time="17:00", close_time="08:00")


def test_equal_open_and_close_is_rejected_for_open_days():
    with pytest.raises(ValidationError):
        BusinessHoursDay(day_of_week=0, is_open=True, open_time="08:00", close_time="08:00")


def test_closed_day_keeps_unordered_placeholder_times():
    day = BusinessHoursDay(day_of_week=5, is_open=False, open_time="17:00", close_time="08:00")
    assert day.is_open is False


def test_a_missing_day_is_rejected():
    week = _week()
    week["days"] = week["days"][:6]
    with pytest.raises(ValidationError):
        BusinessHoursUpdate(**week)


def test_a_duplicated_day_is_rejected():
    week = _week()
    week["days"][6] = _day(0)
    with pytest.raises(ValidationError):
        BusinessHoursUpdate(**week)


def test_day_of_week_out_of_range_is_rejected():
    with pytest.raises(ValidationError):
        BusinessHoursDay(day_of_week=7, is_open=True, open_time="08:00", close_time="17:00")


# --- GET ---


@pytest.mark.asyncio
async def test_get_returns_all_seven_days_from_db():
    rows = [
        BusinessHours(day_of_week=i, is_open=(i < 5), open_time="08:00", close_time="17:00")
        for i in range(7)
    ]
    db = _db_with_rows(rows)

    result = await admin_business_hours.get_business_hours(db=db, _staff=SimpleNamespace(id=1))

    assert len(result.days) == 7
    assert result.days[0].is_open is True
    assert result.days[5].is_open is False


@pytest.mark.asyncio
async def test_get_fills_missing_days_as_closed_placeholders():
    """A missing row behaves as 'closed' everywhere else; GET must say the same."""
    db = _db_with_rows(
        [BusinessHours(day_of_week=0, is_open=True, open_time="00:00", close_time="24:00")]
    )

    result = await admin_business_hours.get_business_hours(db=db, _staff=SimpleNamespace(id=1))

    assert len(result.days) == 7
    monday = result.days[0]
    assert (monday.is_open, monday.open_time, monday.close_time) == (True, "00:00", "24:00")
    tuesday = result.days[1]
    assert (tuesday.is_open, tuesday.open_time, tuesday.close_time) == (False, "08:00", "17:00")


# --- PUT ---


@pytest.mark.asyncio
async def test_put_updates_existing_rows_and_inserts_missing_ones():
    existing = BusinessHours(day_of_week=0, is_open=True, open_time="08:00", close_time="17:00")
    db = _db_with_rows([existing])
    payload = BusinessHoursUpdate(**_week({0: {"open_time": "00:00", "close_time": "24:00"}}))

    with patch.object(admin_business_hours, "create_audit_log", new=AsyncMock()) as audit:
        result = await admin_business_hours.update_business_hours(
            payload, db=db, admin=SimpleNamespace(id=5)
        )

    assert (existing.is_open, existing.open_time, existing.close_time) == (True, "00:00", "24:00")
    assert db.add.call_count == 6  # Tue-Sun did not exist yet
    kwargs = audit.await_args.kwargs
    assert kwargs["action"] == "update_business_hours"
    assert kwargs["resource_type"] == "business_hours"
    assert kwargs["admin_id"] == 5
    db.commit.assert_awaited()
    assert len(result.days) == 7


@pytest.mark.asyncio
async def test_put_returns_the_saved_week():
    db = _db_with_rows([])
    payload = BusinessHoursUpdate(**_week())

    with patch.object(admin_business_hours, "create_audit_log", new=AsyncMock()):
        result = await admin_business_hours.update_business_hours(
            payload, db=db, admin=SimpleNamespace(id=5)
        )

    assert [d.day_of_week for d in result.days] == list(range(7))
    assert db.add.call_count == 7
