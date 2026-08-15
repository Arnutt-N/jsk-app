"""Booking list filtering: the 'คิว' Flex reply and /liff/bookings/me must
show only the citizen's upcoming, still-valid appointments.

The bug (issue-booking-list-filter.md): `list_user_bookings` filtered by
user_id alone, so past and cancelled bookings leaked into the reply — and the
`limit 10` quota could be eaten by old rows, pushing real upcoming bookings
out of the list entirely.
"""
from datetime import date, datetime, time
import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1.endpoints import liff_bookings
from app.models.booking import Booking, BookingStatus
from app.services import booking_service


def _booking(booking_date, booking_time, status=BookingStatus.CONFIRMED, user_id=7):
    return Booking(
        id=1,
        user_id=user_id,
        service_type="ปรึกษากฎหมาย",
        booking_date=booking_date,
        booking_time=booking_time,
        status=status,
    )


def _db_returning(rows):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db.execute.return_value = result
    return db


def _captured_stmt(db):
    """The Select statement that was passed to db.execute, compiled to SQL."""
    stmt = db.execute.call_args.args[0]
    return str(
        stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )


@pytest.mark.asyncio
async def test_list_user_bookings_filters_to_confirmed_upcoming_only():
    """The query itself must carry the status and time filters — the Flex
    builder does not re-filter, so presentation-level filtering would still
    let old rows eat the limit quota."""
    db = _db_returning([])

    await booking_service.list_user_bookings(db, user_id=7)

    sql = _captured_stmt(db)
    assert "bookings.status = 'CONFIRMED'" in sql
    assert "bookings.booking_date + bookings.booking_time >" in sql


@pytest.mark.asyncio
async def test_list_user_bookings_orders_soonest_first():
    """'Upcoming' means the nearest appointment leads the list."""
    db = _db_returning([])

    await booking_service.list_user_bookings(db, user_id=7)

    sql = _captured_stmt(db)
    assert "ORDER BY bookings.booking_date, bookings.booking_time" in sql
    assert "DESC" not in sql


@pytest.mark.asyncio
async def test_include_past_skips_the_status_and_time_filters():
    """The full-history mode must not filter — that is the point of the flag."""
    db = _db_returning([])

    await booking_service.list_user_bookings(db, user_id=7, include_past=True)

    sql = _captured_stmt(db)
    assert "bookings.status = 'CONFIRMED'" not in sql
    assert "bookings.booking_date + bookings.booking_time >" not in sql


@pytest.mark.asyncio
async def test_me_endpoint_defaults_to_the_filtered_view():
    """/liff/bookings/me must show the same upcoming-only list as the 'คิว'
    reply — the citizen's history is not what this endpoint promises."""
    # The FastAPI default is the contract: no query param = filtered view.
    param = inspect.signature(liff_bookings.list_my_bookings).parameters["include_past"]
    assert param.default.default is False

    with patch(
        "app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
        new=AsyncMock(return_value=SimpleNamespace(id=7)),
    ), patch(
        "app.api.v1.endpoints.liff_bookings.booking_service.list_user_bookings",
        new=AsyncMock(return_value=[]),
    ) as list_mock:
        await liff_bookings.list_my_bookings(
            db=AsyncMock(), line_user_id="U1", include_past=False
        )

    assert list_mock.await_args.kwargs.get("include_past") is False


@pytest.mark.asyncio
async def test_me_endpoint_passes_include_past_through():
    """The opt-in history view is reachable from the API."""
    with patch(
        "app.api.v1.endpoints.liff_bookings.resolve_by_line_id",
        new=AsyncMock(return_value=SimpleNamespace(id=7)),
    ), patch(
        "app.api.v1.endpoints.liff_bookings.booking_service.list_user_bookings",
        new=AsyncMock(return_value=[]),
    ) as list_mock:
        await liff_bookings.list_my_bookings(db=AsyncMock(), line_user_id="U1", include_past=True)

    assert list_mock.await_args.kwargs["include_past"] is True
