"""Shared date/bucketing helpers for report queries."""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func


def parse_dates(
    start_date: Optional[str],
    end_date: Optional[str],
    default_days: int = 30,
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)

    def _parse_value(value: str, is_end: bool) -> datetime:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            label = "end_date" if is_end else "start_date"
            raise HTTPException(status_code=422, detail=f"Invalid {label} format: {value}")

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)

        if "T" not in value:
            parsed = parsed.replace(hour=0, minute=0, second=0, microsecond=0)
            if is_end:
                parsed = parsed + timedelta(days=1)
        return parsed

    try:
        end = _parse_value(end_date, is_end=True) if end_date else now
        start = _parse_value(start_date, is_end=False) if start_date else end - timedelta(days=default_days)
    except HTTPException:
        raise
    return start, end


def time_range_for_day(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def bucket_expression(column, period: str):
    bucket = {"daily": "day", "weekly": "week", "monthly": "month"}[period]
    return func.date_trunc(bucket, column)


def format_bucket(bucket_value: datetime, period: str) -> str:
    normalized = bucket_value if bucket_value.tzinfo else bucket_value.replace(tzinfo=timezone.utc)
    normalized = normalized.astimezone(timezone.utc)
    if period == "monthly":
        return normalized.strftime("%Y-%m")
    if period == "weekly":
        iso = normalized.date().isocalendar()
        return f"{iso.year}-{iso.week:02d}"
    return normalized.strftime("%Y-%m-%d")
