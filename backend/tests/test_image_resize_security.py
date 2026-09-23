import asyncio
import httpx
import secrets
import struct
import zlib
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.api.v1.endpoints import media as media_module
from app.core import permissions
from app.core.config import settings
from app.core.cookie_auth import ACCESS_COOKIE, CSRF_COOKIE
from app.core.security import create_access_token
from app.main import app
from app.models.audit_log import AuditLog
from app.models.media_file import MediaFile
from app.models.user import User, UserRole

TICKET_URL = "/api/v1/admin/media/resize-ticket"
UPLOAD_URL = "/api/v1/admin/media/resize"
CSRF = "server-token"


def _png():
    # A complete 1x1 RGB PNG; not just magic bytes.
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00"))
            + chunk(b"IEND", b""))


async def _using_db(operation):
    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            return await operation(db)
    finally:
        await engine.dispose()


@pytest.fixture
def resize_setup(test_client, monkeypatch):
    # Real cookie auth/CSRF; no get_current_user override.
    assert api_deps.get_current_user not in app.dependency_overrides
    monkeypatch.setattr(settings, "DEV_AUTH_BYPASS", False)
    monkeypatch.setattr(permissions, "_policy_cache", None)
    marker = f"resize-test-{uuid4().hex}"
    filename = f"{marker}.png"

    async def seed(db):
        admin = User(username=f"{marker}-admin", role=UserRole.ADMIN, is_active=True)
        agent = User(username=f"{marker}-agent", role=UserRole.AGENT, is_active=True)
        db.add_all([admin, agent])
        await db.flush()
        ids = admin.id, agent.id
        await db.commit()
        return ids

    admin_id, agent_id = asyncio.run(_using_db(seed))
    saved_cookies = test_client.cookies
    test_client.cookies = httpx.Cookies()
    used = set()
    outage = {"value": False}

    async def fake_set(key, value, seconds=None, nx=False):
        assert key.startswith("image-resize-ticket:") and seconds == 300 and nx
        if outage["value"]:
            return None
        if key in used:
            return False
        used.add(key)
        return True

    # Pre-implementation red-phase: media.py ยังไม่มี redis_client attribute
    # (Step 3 ถึงจะเพิ่ม). ห้าม monkeypatch media_module.redis_client ตรง ๆ
    # เพราะจะพังตั้งแต่ fixture setup (AttributeError) ไม่ใช่ RED ที่ถูกต้อง.
    # ใช้ try/except แยก: ถ้ายังไม่มี attribute = RED ที่ถูกต้อง (route ยังไม่เกิด).
    try:
        _redis_target = media_module.redis_client
    except AttributeError:
        pytest.skip("RED: resize ticket route + redis_client not implemented yet")
    monkeypatch.setattr(_redis_target, "set", fake_set)
    try:
        yield test_client, admin_id, agent_id, filename, used, outage
    finally:
        test_client.cookies = saved_cookies

        async def cleanup(db):
            await db.execute(delete(AuditLog).where(
                AuditLog.admin_id.in_([admin_id, agent_id])))
            await db.execute(delete(MediaFile).where(MediaFile.filename == filename))
            await db.execute(delete(User).where(User.id.in_([admin_id, agent_id])))
            await db.commit()

        asyncio.run(_using_db(cleanup))
        # Redis is a test double, so no live Redis keys exist to clear.


def _as(client, user_id):
    client.cookies.set(ACCESS_COOKIE, create_access_token(subject=user_id), path="/api/v1")
    client.cookies.set(CSRF_COOKIE, CSRF, path="/api/v1")
    return client


def _signed(user_id, *, token_type="image_resize_ticket", purpose="image_resize",
            nonce=None, ttl=300):
    return create_access_token(
        subject=user_id, expires_delta=timedelta(seconds=ttl),
        additional_claims={"type": token_type, "purpose": purpose,
                           "nonce": secrets.token_urlsafe(24) if nonce is None else nonce},
    )


def _post(client, filename, ticket, *, data=None, csrf=CSRF):
    return client.post(
        UPLOAD_URL, data={"ticket": ticket},
        files={"file": (filename, _png() if data is None else data, "image/png")},
        headers={} if csrf is None else {"X-CSRF-Token": csrf},
    )


def _media_count(filename):
    async def count(db):
        return await db.scalar(select(func.count()).select_from(MediaFile)
                               .where(MediaFile.filename == filename))
    return asyncio.run(_using_db(count))


def _audit_rows(admin_id):
    async def rows(db):
        return (await db.execute(select(AuditLog).where(
            AuditLog.admin_id == admin_id).order_by(AuditLog.id))).scalars().all()
    return asyncio.run(_using_db(rows))

def test_resize_ticket_and_upload_require_auth(resize_setup):
    client, _, _, filename, _, _ = resize_setup
    assert client.get(TICKET_URL).status_code == 401
    assert _post(client, filename, "invalid").status_code == 401
    assert _media_count(filename) == 0


@pytest.mark.parametrize("csrf", [None, "wrong-token"])
def test_resize_upload_requires_matching_csrf(resize_setup, csrf):
    client, admin_id, _, filename, used, _ = resize_setup
    _as(client, admin_id)
    ticket = client.get(TICKET_URL).json()["ticket"]
    assert _post(client, filename, ticket, csrf=csrf).status_code == 403
    assert used == set() and _media_count(filename) == 0
    assert _post(client, filename, ticket).status_code == 200


def test_agent_without_image_resize_is_forbidden(resize_setup):
    client, _, agent_id, filename, _, _ = resize_setup
    _as(client, agent_id)
    assert client.get(TICKET_URL).status_code == 403
    assert _post(client, filename, "invalid").status_code == 403


@pytest.mark.parametrize("changes,status,detail", [
    ({"ttl": -1}, 401, "ตั๋วอัปโหลดรูปไม่ถูกต้องหรือหมดอายุ"),
    ({"purpose": "wrong"}, 401, "ตั๋วอัปโหลดรูปไม่ถูกต้องหรือหมดอายุ"),
    ({"token_type": "access"}, 401, "ตั๋วอัปโหลดรูปไม่ถูกต้องหรือหมดอายุ"),
    ({"nonce": ""}, 401, "ตั๋วอัปโหลดรูปไม่ถูกต้องหรือหมดอายุ"),
    ({"subject": -1}, 403, "ตั๋วอัปโหลดรูปไม่ตรงกับผู้ใช้"),
])
def test_resize_ticket_rejects_invalid_claims(resize_setup, changes, status, detail):
    client, admin_id, _, filename, _, _ = resize_setup
    _as(client, admin_id)
    claims = {"user_id": admin_id, **changes}
    user_id = claims.pop("subject", claims.pop("user_id"))
    response = _post(client, filename, _signed(user_id, **claims))
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    assert _media_count(filename) == 0


def test_resize_ticket_cannot_be_used_as_login_cookie(resize_setup):
    client, admin_id, _, filename, _, _ = resize_setup
    _as(client, admin_id)
    ticket = client.get(TICKET_URL).json()["ticket"]
    client.cookies.set(ACCESS_COOKIE, ticket, path="/api/v1")
    assert client.get(TICKET_URL).status_code == 401
    _as(client, admin_id)
    assert _media_count(filename) == 0


def test_resize_upload_validation_replay_redis_and_audit(resize_setup):
    client, admin_id, _, filename, _, outage = resize_setup
    _as(client, admin_id)
    ticket = client.get(TICKET_URL).json()["ticket"]
    for invalid in (b"not-image", b"%PDF-1.4\n", b"x" * (10 * 1024 * 1024 + 1)):
        response = _post(client, filename, ticket, data=invalid)
        expected = 413 if len(invalid) > 10 * 1024 * 1024 else 422
        detail = "ไฟล์ใหญ่เกิน 10 MB" if expected == 413 else "รองรับเฉพาะรูป JPEG หรือ PNG"
        assert (response.status_code, response.json()["detail"]) == (expected, detail)
        assert _media_count(filename) == 0
    outage["value"] = True
    unavailable = _post(client, filename, ticket)
    assert (unavailable.status_code, unavailable.json()["detail"]) == (
        503, "บริการอัปโหลดรูปยังไม่พร้อมใช้งาน")
    outage["value"] = False
    success = _post(client, filename, ticket)
    assert success.status_code == 200 and success.json()["id"]
    assert _media_count(filename) == 1
    replay = _post(client, filename, ticket)
    assert (replay.status_code, replay.json()["detail"]) == (
        409, "ตั๋วอัปโหลดรูปนี้ถูกใช้แล้ว")
    assert _media_count(filename) == 1
    rows = _audit_rows(admin_id)
    assert any(r.action == "image_resize_ticket_issued" for r in rows)
    assert any(r.action == "image_resize_upload" and
               r.resource_id == success.json()["id"] for r in rows)
    assert any(r.action == "image_resize_upload_rejected" and
               r.details.get("reason") == "replay" for r in rows)
    assert all("ticket" not in r.details and "nonce" not in r.details and
               "filename" not in r.details for r in rows)