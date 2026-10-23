"""Pure unit tests for shared admin date-window helpers (no DB needed)."""
from datetime import UTC, date, datetime, timedelta

from app.core.date_windows import (
    InvertedRangeError,
    bangkok_today_start_utc,
    day_bounds_utc,
    resolve_range,
)


def test_day_bounds_are_half_open_utc():
    start, end = day_bounds_utc(date(2026, 10, 23))
    assert start.tzinfo == UTC
    assert end.tzinfo == UTC
    # Bangkok midnight Oct 23 = Oct 22 17:00 UTC; next midnight = Oct 23 17:00 UTC.
    assert start == datetime(2026, 10, 22, 17, 0, tzinfo=UTC)
    assert end == datetime(2026, 10, 23, 17, 0, tzinfo=UTC)
    assert end - start == timedelta(days=1)


def test_resolve_range_explicit_dates():
    start, end = resolve_range(date(2026, 10, 20), date(2026, 10, 22), 7)
    assert start == datetime(2026, 10, 19, 17, 0, tzinfo=UTC)
    assert end == datetime(2026, 10, 22, 17, 0, tzinfo=UTC)


def test_resolve_range_falls_back_to_lookback():
    before = datetime.now(UTC)
    start, end = resolve_range(None, None, 7)
    after = datetime.now(UTC)
    assert before - timedelta(seconds=5) <= end <= after
    assert timedelta(days=6, hours=23) < end - start <= timedelta(days=7, seconds=5)


def test_resolve_range_rejects_inverted():
    try:
        resolve_range(date(2026, 10, 23), date(2026, 10, 20), 7)
    except InvertedRangeError:
        return
    raise AssertionError("expected InvertedRangeError")


def test_bangkok_today_start_is_bangkok_midnight():
    start = bangkok_today_start_utc()
    assert start.tzinfo == UTC
    # Convert back: must be midnight in Bangkok.
    from zoneinfo import ZoneInfo

    local = start.astimezone(ZoneInfo("Asia/Bangkok"))
    assert (local.hour, local.minute, local.second) == (0, 0, 0)
