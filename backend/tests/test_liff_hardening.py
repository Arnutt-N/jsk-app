import httpx
import pytest

from app.api.v1.endpoints import liff as liff_module
import app.main as main_module

# Full LIFF route inventory (source of truth: OpenAPI schema — nested
# routers in this FastAPI version are not flattened into app.routes).
# Booking routes landed with the booking feature (reviewed in C6, each POST
# carries _submit_rate_limit); any NEW route/method must fail this test
# until the expected set is reviewed and updated.
_EXPECTED_LIFF_ROUTES = {
    ("/api/v1/liff/media", "POST"),
    ("/api/v1/liff/service-requests", "POST"),
    ("/api/v1/liff/debt-mediation", "POST"),
    ("/api/v1/liff/bookings", "POST"),
    ("/api/v1/liff/bookings/availability", "GET"),
    ("/api/v1/liff/bookings/availability/range", "GET"),
    ("/api/v1/liff/bookings/options", "GET"),
    ("/api/v1/liff/bookings/me", "GET"),
    ("/api/v1/liff/bookings/{booking_id}", "PATCH"),
    ("/api/v1/liff/bookings/{booking_id}/cancel", "POST"),
}


@pytest.mark.asyncio
async def test_verify_timeout_maps_502(test_client, monkeypatch):
    class _SlowClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise httpx.ConnectTimeout("slow")

    monkeypatch.setattr(liff_module.httpx, "AsyncClient", _SlowClient)
    resp = test_client.post(
        "/api/v1/liff/service-requests",
        headers={"x-liff-id-token": "opaque"},
        json={
            "prefix": "นาย", "firstname": "ทดสอบ", "lastname": "ระบบ",
            "phone_number": "0812345678", "topic_category": "ถนน",
            "description": "pytest-liff-timeout",
            "line_user_id": "Uunverified000000000000000",
        },
    )
    assert resp.status_code == 502
    assert "ลองใหม่" in resp.text


def test_liff_route_inventory_is_explicit():
    schema = main_module.app.openapi()
    routes = {
        (path, method.upper())
        for path, ops in schema["paths"].items()
        if path.startswith("/api/v1/liff/")
        for method in ops
        if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}
    }
    assert routes == _EXPECTED_LIFF_ROUTES, (
        f"LIFF route set drifted: extra={routes - _EXPECTED_LIFF_ROUTES} "
        f"missing={_EXPECTED_LIFF_ROUTES - routes}"
    )
