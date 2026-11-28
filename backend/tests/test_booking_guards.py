from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.v1.endpoints import liff_bookings as liff_bookings_module
from app.services.booking_service import BookingConfig, ReminderUnit


@pytest.mark.asyncio
async def test_booking_beyond_cap_rejected(test_client, monkeypatch):
    async def _fake_verify(token):
        return "Ubooking000000000000000001"

    monkeypatch.setattr(liff_bookings_module, "verify_liff_token", _fake_verify)
    # The booking feature is off by default in the test DB — stub the loader so
    # the request reaches the window check instead of the 503 gate. Patching the
    # loader (not SettingsService) keeps this deterministic: the startup
    # scheduler may otherwise warm the shared config cache first.
    monkeypatch.setattr(
        liff_bookings_module,
        "load_booking_config",
        AsyncMock(
            return_value=BookingConfig(
                enabled=True,
                service_types=("ตรวจสอบข้อมูล",),
                slot_minutes=30,
                slot_capacity=3,
                advance_days=14,
                blackout_dates=frozenset(),
                reminder_enabled=False,
                reminder_lead_value=1,
                reminder_lead_unit=ReminderUnit.DAY,
            )
        ),
    )
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
