"""LIFF booking GETs share a separate read bucket (R3-M12).

The 4 read GETs 429 before the per-hit LINE verify — without consuming the
tight 5/300 submit budget. TestClient direct (no test_client fixture: no DB).
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import liff_bookings
from app.db.session import get_db as session_get_db
from app.main import app

READ_PATHS = [
    "/api/v1/liff/bookings/options",
    "/api/v1/liff/bookings/availability?service_type=x&date=2026-01-15",
    "/api/v1/liff/bookings/availability/range?service_type=x&from=2026-01-15&to=2026-01-16",
    "/api/v1/liff/bookings/me",
]


@pytest.mark.parametrize("path", READ_PATHS)
def test_read_get_429s_before_line_verify(path):
    """Exhausted read bucket → 429 + Retry-After; LINE verify never runs.

    No auth header is sent on purpose: decorator deps solve before param
    deps, so the 429 wins over require_line_user_id's 401 — the same
    ordering the POST routes already rely on.
    """
    with patch(
        "app.core.http_rate_limit.redis_client.fixed_window_allow",
        new=AsyncMock(return_value=False),
    ) as allow, patch(
        "app.api.v1.endpoints.liff_bookings.verify_liff_token",
        new=AsyncMock(return_value="U1"),
    ) as verify:
        client = TestClient(app)
        try:
            resp = client.get(path)
        finally:
            client.close()

    assert resp.status_code == 429, resp.text
    assert resp.headers["retry-after"] == "60"
    verify.assert_not_awaited()
    allow.assert_awaited_once()
    assert allow.await_args.args[0].startswith("ratelimit:liff-booking-read:")


def test_read_bucket_is_separate_from_submit_bucket():
    """Structural pin: reads can never consume the submit budget (G2 R3)."""
    read_scope = liff_bookings._read_rate_limit.dependency.__rate_limit_scope__
    submit_scope = liff_bookings._submit_rate_limit.dependency.__rate_limit_scope__
    assert read_scope == "liff-booking-read"
    assert read_scope != submit_scope


def test_clean_read_traffic_unblocked():
    """Allowed bucket + valid token → 200 with the options payload."""
    config = SimpleNamespace(
        enabled=True,
        service_types=("ปรึกษากฎหมาย",),
        advance_days=3,
        blackout_dates=[],
    )

    async def _stub_db():
        yield AsyncMock()

    app.dependency_overrides[session_get_db] = _stub_db
    try:
        with patch(
            "app.core.http_rate_limit.redis_client.fixed_window_allow",
            new=AsyncMock(return_value=True),
        ), patch(
            "app.api.v1.endpoints.liff_bookings.verify_liff_token",
            new=AsyncMock(return_value="U1"),
        ), patch(
            "app.api.v1.endpoints.liff_bookings.load_booking_config",
            new=AsyncMock(return_value=config),
        ):
            client = TestClient(app)
            try:
                resp = client.get(
                    "/api/v1/liff/bookings/options",
                    headers={"x-liff-id-token": "t"},
                )
            finally:
                client.close()
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200, resp.text
    assert resp.json()["service_types"] == ["ปรึกษากฎหมาย"]
