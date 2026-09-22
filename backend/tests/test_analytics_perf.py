from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.core.redis_client import redis_client
from app.db.session import engine as _app_engine
from app.main import app
from app.models.user import UserRole
from sqlalchemy import event


@pytest.fixture
def query_counter():
    counter = SimpleNamespace(count=0)

    def _incr(*_a, **_k):
        counter.count += 1

    # ฟัง engine ตัวเดียวกับที่ app ใช้ — sessionmaker ไม่มีแอตทริบิวต์ .bind
    # (bind อยู่ใน .kw) ต้องอ้าง engine ของ session.py ตรง ๆ
    # (round-7 Important + round-8 Minor reword): ตัวนับนี้ฟังเฉพาะ sync_engine
    # ของ engine ตัวเดียวใน session.py — auth ถูก override ด้วย SimpleNamespace
    # จึงไม่ยิง DB ไม่ถูกนับ; ambient/Redis ไม่ผ่าน engine นี้จึงไม่ถูกนับ
    # โดยตั้งใจ (งบ ≤2 ไม่รวม auth/ambient). ถ้า async path เพิ่ม engine ใหม่
    # ตอน implement ต้องฟังเพิ่ม ไม่ใช่แก้เลขงบ.
    sync_engine = _app_engine.sync_engine
    event.listen(sync_engine, "before_cursor_execute", _incr)
    yield counter
    event.remove(sync_engine, "before_cursor_execute", _incr)


@pytest.mark.asyncio
async def test_dashboard_cache_effectiveness(test_client, query_counter):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        await redis_client.delete("analytics:dashboard:7")
        # warm-up: first request may trigger connection setup / pool init
        _ = test_client.get("/api/v1/admin/analytics/dashboard?days=7")
        query_counter.count = 0  # reset after warm-up

        r1 = test_client.get("/api/v1/admin/analytics/dashboard?days=7")
        assert r1.status_code == 200
        body = r1.json()
        assert {"trends", "session_volume", "peak_hours", "funnel", "percentiles", "generated_at", "cache_hit"} <= set(body)
        first = query_counter.count
        # ผ่าตัดใหญ่: dashboard data statements ต้องไม่เกิน 2
        # (1 หลัก + 1 สำรองเมื่อ planner แยก CTE) ไม่รวม auth/ambient.
        # ถ้าเกิน = FAIL ต้องกลับไปรวม query ใหม่ ห้ามแก้เทสให้ผ่าน.
        assert first <= 2, f"dashboard took {first} data statements, want <=2"
        # สิ่งที่ล็อกเพิ่มคือ cache ต้องทำให้ request ที่สองไม่ยิง query เพิ่ม
        r2 = test_client.get("/api/v1/admin/analytics/dashboard?days=7")
        assert r2.json()["cache_hit"] is True
        assert query_counter.count == first
    finally:
        app.dependency_overrides.clear()
        await redis_client.delete("analytics:dashboard:7")


@pytest.mark.asyncio
async def test_dashboard_empty_percentiles_are_zero(test_client):
    # empty-set: percentile ต้องได้ 0 ไม่ใช่ 500/None
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        await redis_client.delete("analytics:dashboard:7")
        r = test_client.get("/api/v1/admin/analytics/dashboard?days=7")
        assert r.status_code == 200
        pct = r.json()["percentiles"]
        for grp in ("frt", "resolution"):
            for k in ("p50", "p90", "p99"):
                assert pct[grp][k] == 0 or pct[grp][k] == 0.0
    finally:
        app.dependency_overrides.clear()
        await redis_client.delete("analytics:dashboard:7")


@pytest.mark.asyncio
async def test_dashboard_redis_down_still_serves(test_client, monkeypatch):
    # Redis-down: get/setex พัง -> ต้องคำนวณตรง ๆ ไม่ล้ม request
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    async def _boom(*_a, **_k):
        raise ConnectionError("redis down")

    monkeypatch.setattr(redis_client, "get", _boom)
    monkeypatch.setattr(redis_client, "setex", _boom)
    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        r = test_client.get("/api/v1/admin/analytics/dashboard?days=7")
        assert r.status_code == 200
        assert r.json()["cache_hit"] is False
    finally:
        app.dependency_overrides.clear()
