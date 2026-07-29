from datetime import datetime, timezone

from app.services.report_service.helpers import format_bucket, parse_dates


def test_parse_dates_expands_date_only_end_to_exclusive_day_boundary():
    start, end = parse_dates("2026-04-01", "2026-04-05")

    assert start == datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 4, 6, 0, 0, 0, tzinfo=timezone.utc)


def test_format_bucket_returns_expected_labels():
    value = datetime(2026, 4, 5, 0, 0, 0, tzinfo=timezone.utc)

    assert format_bucket(value, "daily") == "2026-04-05"
    assert format_bucket(value, "monthly") == "2026-04"
