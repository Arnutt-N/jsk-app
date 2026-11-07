"""Date-range filters for the bookings list (start_date/end_date on booking_date).

Same contract as the requests-list date tests: per-bound semantics (a lone
end_date is an upper cap, no invented lower bound), the legacy single-day
`date` param keeps working, and a reversed pair is rejected with 400 before
any DB work.
"""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1.endpoints import admin_bookings


def _staff():
    return SimpleNamespace(id=7, role="ADMIN")


def _booking_row(**overrides):
    values = dict(
        id=11,
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 9, 2),
        booking_time=time(9, 0),
        queue_number="260902-002",
        status="CONFIRMED",
        contact_name="สมชาย ใจดี",
        phone_number="0812345678",
        note=None,
        assigned_staff_id=None,
        reminder_sent_at=None,
        completed_at=None,
        cancelled_at=None,
        created_at=None,
        updated_at=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def _db_with_rows(rows):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db.execute = AsyncMock(return_value=result)
    return db


@pytest.mark.asyncio
async def test_bookings_list_date_range_bounds():
    db = _db_with_rows([_booking_row()])
    rows = await admin_bookings.list_bookings(
        booking_date=None,
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 3),
        status=None,
        service_type=None,
        search=None,
        unassigned_only=False,
        limit=100,
        offset=0,
        db=db,
        _staff=_staff(),
    )
    assert len(rows) == 1
    sql = str(db.execute.call_args_list[0].args[0])
    assert "booking_date >=" in sql
    assert "booking_date <=" in sql


@pytest.mark.asyncio
async def test_bookings_list_single_day_param_keeps_working():
    db = _db_with_rows([_booking_row()])
    rows = await admin_bookings.list_bookings(
        booking_date=date(2026, 9, 2),
        start_date=None,
        end_date=None,
        status=None,
        service_type=None,
        search=None,
        unassigned_only=False,
        limit=100,
        offset=0,
        db=db,
        _staff=_staff(),
    )
    assert len(rows) == 1
    sql = str(db.execute.call_args_list[0].args[0])
    assert "booking_date = " in sql


@pytest.mark.asyncio
async def test_bookings_list_lone_end_date_is_upper_cap():
    db = _db_with_rows([_booking_row()])
    rows = await admin_bookings.list_bookings(
        booking_date=None,
        start_date=None,
        end_date=date(2026, 9, 3),
        status=None,
        service_type=None,
        search=None,
        unassigned_only=False,
        limit=100,
        offset=0,
        db=db,
        _staff=_staff(),
    )
    assert len(rows) == 1
    sql = str(db.execute.call_args_list[0].args[0])
    assert "booking_date <=" in sql
    assert "booking_date >=" not in sql


@pytest.mark.asyncio
async def test_bookings_list_reversed_dates_returns_400():
    from fastapi import HTTPException

    db = _db_with_rows([])
    with pytest.raises(HTTPException) as exc:
        await admin_bookings.list_bookings(
            booking_date=None,
            start_date=date(2026, 9, 5),
            end_date=date(2026, 9, 1),
            status=None,
            service_type=None,
            search=None,
            unassigned_only=False,
            limit=100,
            offset=0,
            db=db,
            _staff=_staff(),
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "start_date must not be after end_date"
