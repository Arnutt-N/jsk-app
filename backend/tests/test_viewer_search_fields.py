"""N03: VIEWER search must not query contact fields hidden by masking."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1.endpoints import admin_bookings, admin_requests
from app.models.user import UserRole


def _db_returning_no_rows():
    db = AsyncMock()
    result = MagicMock()
    result.all.return_value = []
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result
    return db


def _sql(db):
    return str(db.execute.call_args.args[0].compile(dialect=postgresql.dialect()))


async def _request_search(role, search="0899"):
    db = _db_returning_no_rows()
    await admin_requests.list_requests(
        status=None,
        category=None,
        search=search,
        start_date=None,
        end_date=None,
        skip=0,
        limit=100,
        db=db,
        current_admin=SimpleNamespace(role=role),
    )
    return _sql(db)


async def _booking_search(role, search="0899"):
    db = _db_returning_no_rows()
    await admin_bookings.list_bookings(
        booking_date=None,
        start_date=None,
        end_date=None,
        status=None,
        service_type=None,
        search=search,
        unassigned_only=False,
        limit=100,
        offset=0,
        db=db,
        _staff=SimpleNamespace(role=role),
    )
    return _sql(db)


@pytest.mark.asyncio
async def test_viewer_request_search_excludes_hidden_phone():
    sql = await _request_search(UserRole.VIEWER)
    assert "phone_number ILIKE" not in sql
    assert "firstname ILIKE" in sql
    assert "lastname ILIKE" in sql
    assert "description ILIKE" in sql


@pytest.mark.asyncio
async def test_staff_request_search_keeps_phone():
    sql = await _request_search(UserRole.ADMIN)
    assert "phone_number ILIKE" in sql


@pytest.mark.asyncio
async def test_viewer_booking_search_excludes_hidden_phone():
    sql = await _booking_search(UserRole.VIEWER)
    assert "phone_number ILIKE" not in sql
    assert "contact_name ILIKE" in sql
    assert "queue_number ILIKE" in sql


@pytest.mark.asyncio
async def test_staff_booking_search_keeps_phone():
    sql = await _booking_search(UserRole.ADMIN)
    assert "phone_number ILIKE" in sql
