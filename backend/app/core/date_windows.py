"""Shared calendar-day windows for admin date filters.

Every admin UI date picker submits YYYY-MM-DD calendar days in Asia/Bangkok
time. These helpers turn them into half-open [start, end) UTC bounds so all
endpoints agree on what "today" or "last 7 days" means, regardless of the
database session timezone.
"""
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

BANGKOK = ZoneInfo("Asia/Bangkok")


class InvertedRangeError(ValueError):
    """Raised when start_date is after end_date; endpoints map it to 422."""


def day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """Half-open [start, end) UTC bounds for one Bangkok calendar day."""
    start_local = datetime.combine(day, time.min).replace(tzinfo=BANGKOK)
    return start_local.astimezone(UTC), (start_local + timedelta(days=1)).astimezone(UTC)


def bangkok_today_start_utc(now: datetime | None = None) -> datetime:
    """UTC instant of last midnight in Bangkok (for "today" counters)."""
    now = now or datetime.now(UTC)
    start_local, _ = day_bounds_utc(now.astimezone(BANGKOK).date())
    return start_local


def resolve_range(
    start_date: date | None,
    end_date: date | None,
    days: int,
) -> tuple[datetime, datetime]:
    """Resolve (start_date, end_date, days) to half-open [start, end) UTC bounds.

    Explicit dates win as Bangkok calendar days; otherwise fall back to the
    last-N-days lookback ending now (previous behavior, unchanged).
    """
    if start_date and end_date and start_date > end_date:
        raise InvertedRangeError("start_date must be on or before end_date")
    if start_date or end_date:
        end_day = end_date or datetime.now(BANGKOK).date()
        if start_date:
            start, _ = day_bounds_utc(start_date)
        else:
            _, end_cap = day_bounds_utc(end_day)
            start = end_cap - timedelta(days=days)
        _, end = day_bounds_utc(end_day)
        return start, end
    now = datetime.now(UTC)
    return now - timedelta(days=days), now
