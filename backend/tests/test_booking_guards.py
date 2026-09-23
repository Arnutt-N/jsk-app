from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest

from app.api.v1.endpoints import liff_bookings as liff_bookings_module
from app.services.booking_settings import KEY_ENABLED, KEY_SERVICE_TYPES
from app.services.settings_service import SettingsService


@pytest.mark.asyncio
async def test_booking_beyond_cap_rejected(test_client, monkeypatch):
    async def _fake_verify(token):
        return "Ubooking000000000000000001"

    monkeypatch.setattr(liff_bookings_module, "verify_liff_token", _fake_verify)
    # The booking feature is off by default in the test DB — enable it so the
    # request reaches the window check instead of the 503 gate.
    async def _enabled(db, key, default=""):
        if key == KEY_ENABLED:
            return "true"
        if key == KEY_SERVICE_TYPES:
            return '["ตรวจสอบข้อมูล"]'
        return default

    monkeypatch.setattr(SettingsService, "get_setting", staticmethod(_enabled))
    # skip the LINE profile fetch — the window check runs before any user row
    # matters, but get_or_create_user calls LINE first for unknown ids
    monkeypatch.setattr(
        liff_bookings_module.friend_service,
        "get_or_create_user",
        AsyncMock(return_value=SimpleNamespace(id=1)),
    )
    far = (date.today() + timedelta(days=90)).isoformat()
    resp = test_client.post(
        "/api/v1/liff/bookings",
        json={"service_type": "ตรวจสอบข้อมูล", "booking_date": far, "booking_time": "09:00:00"},
        headers={"x-liff-id-token": "opaque"},
    )
    assert resp.status_code == 422
    assert "ล่วงหน้า" in resp.text


@pytest.mark.asyncio
async def test_patch_without_body_422(test_client, monkeypatch):
    async def _fake_verify(token):
        return "Ubooking000000000000000001"

    monkeypatch.setattr(liff_bookings_module, "verify_liff_token", _fake_verify)
    resp = test_client.patch(
        "/api/v1/liff/bookings/999999",
        headers={"x-liff-id-token": "opaque"},
    )
    assert resp.status_code == 422
