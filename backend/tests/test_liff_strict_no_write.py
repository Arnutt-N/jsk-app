import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.service_request import ServiceRequest


def _fresh_engine():
    # Keep this test isolated from the app pool across event loops.
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _count_service_requests() -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            return (
                await session.execute(
                    select(func.count()).select_from(ServiceRequest)
                )
            ).scalar_one()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_no_token_lenient_mode_writes_nothing(test_client, monkeypatch):
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
    before = await _count_service_requests()
    response = test_client.post(
        "/api/v1/liff/service-requests",
        json={
            "prefix": "นาย",
            "firstname": "ทดสอบ",
            "lastname": "ระบบ",
            "phone_number": "0812345678",
            "topic_category": "ถนน",
            "description": "pytest-strict-no-write",
            "line_user_id": "Uunverified000000000000000",
        },
    )
    assert response.status_code == 401
    assert "ยืนยันตัวตน" in response.text
    assert await _count_service_requests() == before
