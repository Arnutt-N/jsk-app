"""24-hour business hours — the chatbot serves around the clock.

A close time of "24:00" expresses "open until midnight". These tests pin the
two consumers that previously could not represent it: the within-hours check
(handoff gating) and the "next open time" phrasing shown to LINE users.
"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.business_hours import BusinessHours
from app.services.business_hours_service import BANGKOK_TZ, business_hours_service


def _row(open_time="00:00", close_time="24:00", is_open=True, day_of_week=2):
    return BusinessHours(
        day_of_week=day_of_week,
        open_time=open_time,
        close_time=close_time,
        is_open=is_open,
    )


def _db_returning(row):
    db = AsyncMock()
    result = MagicMock()  # scalar_one_or_none() is a sync call in the service
    result.scalar_one_or_none.return_value = row
    db.execute.return_value = result
    return db


def _freeze(local: datetime):
    """Pin `datetime.now` inside the service to a Bangkok wall-clock time."""
    return patch(
        "app.services.business_hours_service.datetime",
        now=lambda tz=None: local if tz is None else local.astimezone(tz),
    )


def _at(hour: int, minute: int, second: int = 0) -> datetime:
    # 2026-08-12 is a Wednesday (weekday 2, matching _row's default).
    return BANGKOK_TZ.localize(datetime(2026, 8, 12, hour, minute, second))


@pytest.mark.asyncio
async def test_open_until_24_00_covers_the_last_minute_of_the_day():
    db = _db_returning(_row())
    with _freeze(_at(23, 59, 30)):
        assert await business_hours_service.is_within_business_hours(db) is True


@pytest.mark.asyncio
async def test_open_until_24_00_covers_midnight_start():
    db = _db_returning(_row())
    with _freeze(_at(0, 0, 0)):
        assert await business_hours_service.is_within_business_hours(db) is True


@pytest.mark.asyncio
async def test_normal_close_time_still_excludes_time_after_close():
    db = _db_returning(_row(open_time="08:00", close_time="17:00"))
    with _freeze(_at(17, 30)):
        assert await business_hours_service.is_within_business_hours(db) is False


@pytest.mark.asyncio
async def test_next_open_time_reports_24_00_close():
    db = _db_returning(_row())
    with _freeze(_at(23, 0)):
        assert await business_hours_service.get_next_open_time(db) == (
            "เปิดให้บริการอยู่ (ถึง 24:00 น.)"
        )
