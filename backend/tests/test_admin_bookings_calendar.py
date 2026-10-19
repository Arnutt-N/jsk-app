from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_bookings
from app.services.booking_service import UnknownServiceTypeError


def _config(**overrides):
    values = {"calendar_enabled": True, "service_types": ["ปรึกษากฎหมาย"]}
    values.update(overrides)
    return SimpleNamespace(**values)


def _days():
    return [
        SimpleNamespace(date=date(2026, 10, 1), is_open=True, remaining=3),
        SimpleNamespace(date=date(2026, 10, 2), is_open=False, remaining=0),
    ]


def _call(db, **overrides):
    kwargs = {
        "service_type": "ปรึกษากฎหมาย",
        "range_start": date(2026, 10, 1),
        "range_end": date(2026, 10, 31),
        "db": db,
        "_staff": SimpleNamespace(id=1),
    }
    kwargs.update(overrides)
    return admin_bookings.counter_availability_range(**kwargs)


@pytest.mark.asyncio
async def test_range_returns_open_and_full_days():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service,
        "get_availability_range",
        new=AsyncMock(return_value=_days()),
    ) as get_range:
        result = await _call(db)

    get_range.assert_awaited_once()
    assert result.service_type == "ปรึกษากฎหมาย"
    assert [(d.date.isoformat(), d.is_open, d.remaining) for d in result.days] == [
        ("2026-10-01", True, 3),
        ("2026-10-02", False, 0),
    ]


@pytest.mark.asyncio
async def test_range_disabled_is_rejected_before_touching_the_database():
    db = AsyncMock()
    with patch.object(
        admin_bookings,
        "load_booking_config",
        new=AsyncMock(return_value=_config(calendar_enabled=False)),
    ), pytest.raises(HTTPException) as exc:
        await _call(db)
    assert exc.value.status_code == 403
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_range_rejects_an_inverted_window():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, range_start=date(2026, 10, 31), range_end=date(2026, 10, 1))
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_range_rejects_a_window_over_the_cap():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, range_start=date(2026, 10, 1), range_end=date(2027, 1, 1))
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_range_maps_unknown_service_to_404():
    db = AsyncMock()
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings.booking_service,
        "get_availability_range",
        new=AsyncMock(side_effect=UnknownServiceTypeError("x")),
    ), pytest.raises(HTTPException) as exc:
        await _call(db, service_type="ไม่มีบริการนี้")
    assert exc.value.status_code == 404
