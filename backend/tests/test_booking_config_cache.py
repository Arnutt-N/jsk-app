"""Booking-config cache behaviour."""
from typing import cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

from app.services import booking_settings
from app.services.booking_settings import (
    DEFAULTS,
    BookingConfig,
    load_booking_config,
    save_booking_config,
)
from app.services.settings_service import SettingsService

FAKE_DB = cast(AsyncSession, object())


@pytest.fixture
def counting_settings(monkeypatch):
    calls: list[str] = []

    async def fake_get_many(db, keys):
        calls.append("get_many")
        return {key: "" for key in keys}

    async def fake_set_many(db, values, description=None):
        calls.append("set_many")
        return None

    monkeypatch.setattr(SettingsService, "get_many", staticmethod(fake_get_many))
    monkeypatch.setattr(SettingsService, "set_many", staticmethod(fake_set_many))
    return calls


@pytest.fixture
def cold_cache(monkeypatch):
    monkeypatch.setattr(booking_settings, "_cached_config", None)
    monkeypatch.setattr(booking_settings, "_cached_at", 0.0)
    return booking_settings


@pytest.fixture
def frozen_time(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(booking_settings, "monotonic", lambda: now["t"])
    return now


async def test_second_load_within_ttl_reads_zero_settings(
    counting_settings, cold_cache, frozen_time
):
    first = await load_booking_config(FAKE_DB)
    assert counting_settings == ["get_many"]

    second = await load_booking_config(FAKE_DB)
    assert second is first
    assert counting_settings == ["get_many"]


async def test_expired_ttl_reloads(counting_settings, cold_cache, frozen_time):
    await load_booking_config(FAKE_DB)
    frozen_time["t"] += 61.0

    config = await load_booking_config(FAKE_DB)
    assert isinstance(config, BookingConfig)
    assert counting_settings == ["get_many", "get_many"]


async def test_fresh_bypass_ignores_cache_and_refreshes_it(
    counting_settings, cold_cache, frozen_time
):
    await load_booking_config(FAKE_DB)
    frozen_time["t"] += 1.0

    config = await load_booking_config(FAKE_DB, fresh=True)
    assert isinstance(config, BookingConfig)
    assert counting_settings == ["get_many", "get_many"]

    await load_booking_config(FAKE_DB)
    assert counting_settings == ["get_many", "get_many"]


async def test_cold_open_cost_is_one_batch_read(
    counting_settings, cold_cache, frozen_time
):
    for _ in range(3):
        await load_booking_config(FAKE_DB)
    assert counting_settings == ["get_many"]


async def test_save_uses_one_batch_write_and_invalidates(
    counting_settings, cold_cache, frozen_time
):
    await load_booking_config(FAKE_DB)
    assert counting_settings == ["get_many"]

    await save_booking_config(FAKE_DB, DEFAULTS)

    await load_booking_config(FAKE_DB)
    assert counting_settings == ["get_many", "set_many", "get_many"]
