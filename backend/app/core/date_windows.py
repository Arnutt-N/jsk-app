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


def optional_range_utc(
    start_date: date | None,
    end_date: date | None,
) -> tuple[datetime | None, datetime | None]:
    """Per-bound Bangkok-day window for optional list-filter dates.

    Each bound is independent: a lone end_date is an upper cap with no
    invented lower bound (and vice versa). A reversed pair raises
    InvertedRangeError; callers map it to 400. Returns (start_dt, end_dt)
    with None on the open side. Non-date values (e.g. a raw Query() default
    seen by direct unit calls without FastAPI validation) count as absent.
    """
    has_start = isinstance(start_date, date)
    has_end = isinstance(end_date, date)
    if has_start and has_end and start_date > end_date:
        raise InvertedRangeError("start_date must not be after end_date")
    start_dt = day_bounds_utc(start_date)[0] if has_start else None
    end_dt = day_bounds_utc(end_date)[1] if has_end else None
    return start_dt, end_dt


def apply_optional_range(query, column, start_dt: datetime | None, end_dt: datetime | None):
    """Append a half-open [start_dt, end_dt) window to a SQLAlchemy query.

    Each bound is independent; None means unbounded on that side. Returns
    the query so calls chain. One place for the four list endpoints that
    each hand-rolled the same two `where` clauses.
    """
    if start_dt is not None:
        query = query.where(column >= start_dt)
    if end_dt is not None:
        query = query.where(column < end_dt)
    return query
