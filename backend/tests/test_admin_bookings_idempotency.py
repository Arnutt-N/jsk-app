"""Real-session proof that a retried counter POST mints one booking, not two.

Why a real session: the unit doubles (AsyncMock) never run the UNIQUE index,
so they cannot see the concurrent-insert race the idempotency key exists
for. This test replays the same key twice through real HTTP against a real
database and counts the rows.

Isolation recipe (from test_taxonomy_patch_regression.py): a throwaway
NullPool engine from settings.DATABASE_URL — which conftest defaults to
the docker test DB, never the dev database — a uuid-marked idempotency
key, real HTTP via TestClient with get_db + get_current_staff
overridden, marker cleanup afterwards (bookings, bare users, audit rows).
"""
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.core.config import settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.booking import Booking
from app.models.business_hours import BusinessHours
from app.models.user import User, UserRole
from app.services.booking_service import local_now
from app.services.settings_service import SettingsService


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest.mark.asyncio
async def test_walkin_replay_with_seen_key_returns_the_first_booking():
    marker = f"px{uuid.uuid4().hex[:8]}"
    key = f"key-{marker}"
    service = f"svc-{marker}"
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    target = None
    hours_before = None
    service_types_before = ""
    walkin_before = ""
    admin_id = None
    async with Session() as session:
        target = local_now().date() + timedelta(days=7)
        service_types_before = await SettingsService.get_setting(
            session, "booking_service_types", ""
        )
        walkin_before = await SettingsService.get_setting(
            session, "booking_walkin_enabled", ""
        )
        await SettingsService.set_setting(
            session, "booking_service_types", f'["{service}"]'
        )
        await SettingsService.set_setting(session, "booking_walkin_enabled", "true")
        admin = User(
            username=f"px-admin-{marker}",
            display_name="PX Admin",
            role=UserRole.ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.flush()
        admin_id = admin.id
        existing = (
            await session.execute(
                select(BusinessHours).where(
                    BusinessHours.day_of_week == target.weekday()
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            hours_before = (
                existing.is_open,
                existing.open_time,
                existing.close_time,
            )
            existing.is_open = True
            existing.open_time = "09:00"
            existing.close_time = "18:00"
        else:
            session.add(
                BusinessHours(
                    day_of_week=target.weekday(),
                    is_open=True,
                    open_time="09:00",
                    close_time="18:00",
                )
            )
        await session.commit()

    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_staff] = lambda: SimpleNamespace(
        id=admin_id, username="t", display_name="T", role=UserRole.ADMIN
    )
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            first = client.post(
                "/api/v1/admin/bookings",
                json={
                    "service_type": service,
                    "booking_date": target.isoformat(),
                    "booking_time": "09:30:00",
                    "contact_name": "Test Citizen",
                    "idempotency_key": key,
                },
            )
            second = client.post(
                "/api/v1/admin/bookings",
                json={
                    "service_type": service,
                    "booking_date": target.isoformat(),
                    "booking_time": "09:30:00",
                    "contact_name": "Test Citizen",
                    "idempotency_key": key,
                },
            )
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] == second.json()["id"]
        assert first.json()["queue_number"] == second.json()["queue_number"]
    finally:
        async with Session() as session:
            booking_ids = (
                await session.execute(
                    select(Booking.id).where(Booking.idempotency_key == key)
                )
            ).scalars().all()
            assert len(booking_ids) == 1
            user_ids = (
                await session.execute(
                    select(Booking.user_id).where(Booking.idempotency_key == key)
                )
            ).scalars().all()
            await session.execute(
                delete(AuditLog).where(
                    AuditLog.resource_id.in_([str(i) for i in booking_ids])
                )
            )
            await session.execute(
                delete(Booking).where(Booking.idempotency_key == key)
            )
            await session.execute(delete(User).where(User.id.in_(user_ids + [admin_id])))
            await SettingsService.set_setting(
                session, "booking_service_types", service_types_before
            )
            await SettingsService.set_setting(
                session, "booking_walkin_enabled", walkin_before
            )
            if hours_before is not None:
                is_open, open_time, close_time = hours_before
                row = (
                    await session.execute(
                        select(BusinessHours).where(
                            BusinessHours.day_of_week == target.weekday()
                        )
                    )
                ).scalar_one()
                row.is_open = is_open
                row.open_time = open_time
                row.close_time = close_time
            else:
                await session.execute(
                    delete(BusinessHours).where(
                        BusinessHours.day_of_week == target.weekday()
                    )
                )
            await session.commit()
        await engine.dispose()
