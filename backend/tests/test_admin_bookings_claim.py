"""Resend atomic claim against a real database.

Mocks can only assert the claim SQL was *called*; these tests prove it
*works* on Postgres. Committed semantics (review-blessed): the claim,
the send, and the audit commit atomically — a failed send burns no
cooldown, so the admin can retry at once; a successful send holds the
60-second cooldown against double-taps.
"""
import uuid
from datetime import time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps
from app.api.v1.endpoints import admin_bookings
from app.core.config import settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.booking import Booking, BookingStatus
from app.models.user import User, UserRole
from app.services.booking_service import local_now


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _seed(Session):
    marker = f"pc{uuid.uuid4().hex[:8]}"
    async with Session() as session:
        target = local_now().date() + timedelta(days=7)
        admin = User(
            username=f"pc-admin-{marker}",
            display_name="PC Admin",
            role=UserRole.ADMIN,
            is_active=True,
        )
        citizen = User(display_name="PC Citizen")
        session.add(admin)
        session.add(citizen)
        await session.flush()
        booking = Booking(
            user_id=citizen.id,
            service_type="ปรึกษากฎหมาย",
            booking_date=target,
            booking_time=time(9, 30),
            contact_name="PC Citizen",
            phone_number="0800000000",
            queue_number=f"PC-{marker}",
            status=BookingStatus.CONFIRMED,
        )
        session.add(booking)
        await session.flush()
        ids = (booking.id, citizen.id, admin.id)
        await session.commit()
    return ids


async def _cleanup(Session, booking_id, user_id, admin_id):
    async with Session() as session:
        await session.execute(
            delete(AuditLog).where(AuditLog.resource_id == str(booking_id))
        )
        await session.execute(delete(Booking).where(Booking.id == booking_id))
        await session.execute(delete(User).where(User.id.in_([user_id, admin_id])))
        await session.commit()


def _overrides(Session, admin_id):
    async def _fresh_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[deps.get_db] = _fresh_get_db
    app.dependency_overrides[deps.get_current_staff] = lambda: SimpleNamespace(
        id=admin_id, username="t", display_name="T", role=UserRole.ADMIN
    )


@pytest.mark.asyncio
async def test_successful_resend_holds_the_cooldown():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id, admin_id = await _seed(Session)
    _overrides(Session, admin_id)
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            with patch.object(
                admin_bookings,
                "send_booking_reminder",
                new=AsyncMock(return_value=True),
            ):
                first = client.post(f"/api/v1/admin/bookings/{booking_id}/remind")
                second = client.post(f"/api/v1/admin/bookings/{booking_id}/remind")
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert first.status_code == 200, first.text
        assert second.status_code == 429, second.text
        async with Session() as session:
            stamp = (
                await session.execute(
                    select(Booking.reminder_sent_at).where(Booking.id == booking_id)
                )
            ).scalar_one()
            assert stamp is not None
    finally:
        await _cleanup(Session, booking_id, user_id, admin_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_failed_resend_burns_no_cooldown():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    booking_id, user_id, admin_id = await _seed(Session)
    _overrides(Session, admin_id)
    try:
        client = TestClient(app, raise_server_exceptions=False)
        try:
            first = client.post(f"/api/v1/admin/bookings/{booking_id}/remind")
            second = client.post(f"/api/v1/admin/bookings/{booking_id}/remind")
        finally:
            client.close()
    finally:
        app.dependency_overrides.clear()

    try:
        assert first.status_code == 502, first.text
        assert second.status_code == 502, second.text
    finally:
        await _cleanup(Session, booking_id, user_id, admin_id)
        await engine.dispose()
