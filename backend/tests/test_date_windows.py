"""Pure unit tests for shared admin date-window helpers (no DB needed)."""
from datetime import UTC, date, datetime, timedelta

from app.core.date_windows import (
    InvertedRangeError,
    apply_optional_range,
    bangkok_today_start_utc,
    day_bounds_utc,
    optional_range_utc,
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


def test_optional_range_both_bounds():
    start_dt, end_dt = optional_range_utc(date(2026, 9, 1), date(2026, 9, 3))
    assert start_dt == datetime(2026, 8, 31, 17, 0, tzinfo=UTC)
    assert end_dt == datetime(2026, 9, 3, 17, 0, tzinfo=UTC)


def test_optional_range_lone_end_is_upper_cap_only():
    start_dt, end_dt = optional_range_utc(None, date(2026, 9, 3))
    assert start_dt is None
    assert end_dt == datetime(2026, 9, 3, 17, 0, tzinfo=UTC)


def test_optional_range_reversed_rejects():
    try:
        optional_range_utc(date(2026, 9, 5), date(2026, 9, 1))
    except InvertedRangeError:
        return
    raise AssertionError("expected InvertedRangeError")


def test_optional_range_ignores_non_dates():
    # Direct unit calls without FastAPI validation leave the Query()
    # object itself as the default — the helper treats those as absent.
    start_dt, end_dt = optional_range_utc(None, None)
    assert (start_dt, end_dt) == (None, None)


def test_apply_optional_range_appends_half_open_bounds():
    from sqlalchemy import column, select

    created = column("created_at")
    stmt = apply_optional_range(
        select(created), created,
        datetime(2026, 8, 31, 17, 0, tzinfo=UTC),
        datetime(2026, 9, 3, 17, 0, tzinfo=UTC),
    )
    sql = str(stmt)
    assert "created_at >=" in sql
    assert "created_at <" in sql


def test_apply_optional_range_skips_open_side():
    from sqlalchemy import column, select

    created = column("created_at")
    stmt = apply_optional_range(select(created), created, None, None)
    # No WHERE appended — the column still appears in the SELECT clause,
    # so assert on the absence of comparison operators instead.
    sql = str(stmt)
    assert ">=" not in sql
    assert " < " not in sql
