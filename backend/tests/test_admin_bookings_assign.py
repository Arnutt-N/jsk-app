from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.api.v1.endpoints import admin_bookings
from app.models.booking import BookingStatus
from app.schemas.booking import BookingAssignIn


def _config(**overrides):
    values = {"assign_enabled": True}
    values.update(overrides)
    return SimpleNamespace(**values)


def _stored_booking(**overrides):
    values = {
        "id": 11,
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": date(2026, 10, 19),
        "booking_time": time(9, 30),
        "queue_number": "261019-002",
        "status": BookingStatus.CONFIRMED,
        "contact_name": "สมชาย ใจดี",
        "phone_number": "0812345678",
        "note": None,
        "reminder_sent_at": None,
        "assigned_staff_id": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _staff(**overrides):
    values = {"id": 2, "role": "ADMIN"}
    values.update(overrides)
    return SimpleNamespace(**values)


def _call(db, payload, booking_id=11, staff=None):
    return admin_bookings.assign_booking_staff(
        payload, booking_id=booking_id, db=db, staff=staff or _staff()
    )


@pytest.mark.asyncio
async def test_assign_to_another_staff_member():
    db = AsyncMock()
    booking = _stored_booking()
    target = SimpleNamespace(id=5, role="ADMIN", is_active=True)
    db.get = AsyncMock(side_effect=[booking, target])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(admin_bookings, "create_audit_log", new=AsyncMock()) as audit:
        result = await _call(db, BookingAssignIn(assigned_staff_id=5))

    assert booking.assigned_staff_id == 5
    assert audit.await_args.kwargs["action"] == "assign_booking"
    assert audit.await_args.kwargs["admin_id"] == 2
    assert result.assigned_staff_id == 5
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_assign_to_a_citizen_is_rejected():
    db = AsyncMock()
    booking = _stored_booking()
    db.get = AsyncMock(
        side_effect=[booking, SimpleNamespace(id=9, role="USER", is_active=True)]
    )
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, BookingAssignIn(assigned_staff_id=9))
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_assign_to_an_inactive_account_is_rejected():
    db = AsyncMock()
    booking = _stored_booking()
    db.get = AsyncMock(
        side_effect=[booking, SimpleNamespace(id=9, role="AGENT", is_active=False)]
    )
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, BookingAssignIn(assigned_staff_id=9))
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_self_assign_is_allowed_with_the_self_assign_grant():
    db = AsyncMock()
    booking = _stored_booking()
    db.get = AsyncMock(side_effect=[booking])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(admin_bookings, "create_audit_log", new=AsyncMock()):
        result = await _call(db, BookingAssignIn(assigned_staff_id=2))

    assert booking.assigned_staff_id == 2
    assert result.assigned_staff_id == 2
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_unassign_clears_the_holder():
    db = AsyncMock()
    booking = _stored_booking(assigned_staff_id=5)
    db.get = AsyncMock(side_effect=[booking])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(admin_bookings, "create_audit_log", new=AsyncMock()):
        result = await _call(db, BookingAssignIn(assigned_staff_id=None))

    assert booking.assigned_staff_id is None
    assert result.assigned_staff_id is None
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_reassigning_the_same_holder_is_a_no_op():
    db = AsyncMock()
    booking = _stored_booking(assigned_staff_id=5)
    db.get = AsyncMock(
        side_effect=[booking, SimpleNamespace(id=5, role="AGENT", is_active=True)]
    )
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(admin_bookings, "create_audit_log", new=AsyncMock()) as audit:
        result = await _call(
            db, BookingAssignIn(assigned_staff_id=5), staff=_staff(role="AGENT")
        )

    assert result.assigned_staff_id == 5
    audit.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_reassigning_a_legacy_invalid_holder_is_flagged():
    db = AsyncMock()
    booking = _stored_booking(assigned_staff_id=9)
    db.get = AsyncMock(
        side_effect=[booking, SimpleNamespace(id=9, role="USER", is_active=True)]
    )
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(
            db, BookingAssignIn(assigned_staff_id=9), staff=_staff(role="AGENT")
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_agent_cannot_assign_to_others():
    db = AsyncMock()
    booking = _stored_booking()
    db.get = AsyncMock(side_effect=[booking, SimpleNamespace(id=5)])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, BookingAssignIn(assigned_staff_id=5), staff=_staff(role="AGENT"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_agent_cannot_unassign():
    db = AsyncMock()
    booking = _stored_booking(assigned_staff_id=5)
    db.get = AsyncMock(side_effect=[booking])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(
            db, BookingAssignIn(assigned_staff_id=None), staff=_staff(role="AGENT")
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_agent_can_release_their_own_queue_with_self_assign_grant():
    db = AsyncMock()
    booking = _stored_booking(assigned_staff_id=2)
    db.get = AsyncMock(side_effect=[booking])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), patch.object(
        admin_bookings, "can_self_assign", new=MagicMock(return_value=True)
    ):
        result = await _call(
            db, BookingAssignIn(assigned_staff_id=None), staff=_staff(role="AGENT")
        )
    assert result.assigned_staff_id is None
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_assign_disabled_is_rejected_before_touching_the_database():
    db = AsyncMock()
    with patch.object(
        admin_bookings,
        "load_booking_config",
        new=AsyncMock(return_value=_config(assign_enabled=False)),
    ), pytest.raises(HTTPException) as exc:
        await _call(db, BookingAssignIn(assigned_staff_id=5))
    assert exc.value.status_code == 403
    db.get.assert_not_called()


@pytest.mark.asyncio
async def test_assign_unknown_booking_is_404():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, BookingAssignIn(assigned_staff_id=5), booking_id=999)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assign_unknown_staff_is_404():
    db = AsyncMock()
    booking = _stored_booking()
    db.get = AsyncMock(side_effect=[booking, None])
    with patch.object(
        admin_bookings, "load_booking_config", new=AsyncMock(return_value=_config())
    ), pytest.raises(HTTPException) as exc:
        await _call(db, BookingAssignIn(assigned_staff_id=999))
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_unassigned_only_filter_adds_an_is_null_clause():
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    await admin_bookings.list_bookings(
        booking_date=None,
        status=None,
        service_type=None,
        search=None,
        unassigned_only=True,
        limit=100,
        offset=0,
        db=db,
        _staff=_staff(),
    )

    stmt = db.execute.call_args.args[0]
    assert "assigned_staff_id IS NULL" in str(
        stmt.compile(dialect=postgresql.dialect())
    )
