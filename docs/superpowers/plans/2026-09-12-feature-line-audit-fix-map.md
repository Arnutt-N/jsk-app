# LINE Audit Fix Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดรูรั่ว Critical (C1–C5) แล้วแก้ High backend และ admin/frontend ตาม PRD 2026-09-12 ให้ผ่าน test ทุก Wave

**Architecture:** ทำเป็น 4 Wave ตามความเสี่ยง (A security → B correctness → C backend High → D admin/frontend); Wave A เป็นเจ้าของไฟล์ liff.py และ media.py ก่อน ห้ามขนานบนไฟล์เดียวกัน; B ขนานกับ A ได้เพราะไฟล์ไม่ชน; C แบ่ง lane ตามโดเมน; D ทำท้ายสุดเมื่อ API นิ่งแล้ว ทุก task ใช้ TDD (red → green → commit)

**Tech Stack:** FastAPI 0.109+ (async), SQLAlchemy 2.0 async, Pydantic V2, Alembic 1.13+, PostgreSQL 16+, Redis 7+, Next.js 16.1+ / React 19.2+ / TypeScript 5.x / Tailwind CSS v4, httpx, Fernet (cryptography), pytest + pytest-asyncio, Vitest

## Global Constraints

- Backend ทุก path operation และ DB access ใช้ `async def` เท่านั้น
- DB query ใช้ SQLAlchemy 2.0 `select()` style เท่านั้น ห้ามใช้ `session.query`
- Pydantic V2 schemas ใช้ suffix `Create` / `Update` / `Response` พร้อม `ConfigDict(from_attributes=True, use_enum_values=True)`
- Error ใช้ `HTTPException` พร้อม status code ตาม precedent เดิมของ repo (400/401/403/404/409/413/422/429/500/502/503)
- UI และข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด code / identifiers คงภาษาอังกฤษ
- Python indent 4-space / TypeScript indent 2-space, UTF-8, LF line endings
- ห้าม return ORM model ตรง ต้องแปลงเป็น Pydantic schema ผ่าน `model_validate`
- Logging ใช้ `logger = logging.getLogger(__name__)` ระดับ module
- Branch นี้คือ `feat/feature-line-audit-fix-map` ห้ามแก้ไฟล์เดียวกันขนานกัน (liff.py → A ก่อน C/D3; media.py → A ก่อน C/D; sessions.py + errors.py → B1 เจ้าของคนเดียว; messaging.py → C8; admin_live_chat.py transfer mapping → B1, messages/export routes → D1)
- Test conventions (ทุก task): `test_client` คือ sync `TestClient` (ห้าม `await test_client.*` — ดู `backend/tests/test_liff_token.py:147-160`); งาน admin ใช้ `app.dependency_overrides[deps.get_current_user]` คืน `SimpleNamespace(id, role=UserRole.*, is_active=True)` แล้ว `clear()` ทุกครั้ง (ดู `backend/tests/test_admin_requests_endpoints.py:89-112`, `backend/tests/test_transfer_session_errors.py:39-59`); งาน DB ใช้ `_fresh_engine()` + NullPool recipe จาก `backend/tests/test_liff_token.py:37-44` (ห้าม reuse pool ของ app ข้าม event loop); ห้าม import helper ข้าม test module (ไม่มี `__init__.py`) — copy สูตรสั้นสั้นไว้ในไฟล์ test นั้นนั้น; `conftest.py` มีแค่ `app/test_client/_reset_http_rate_limits/drain_auth_responses/auth_websocket` (`backend/tests/conftest.py:80-154) — fixture อื่นทุกตัวต้องนิยามเต็มใน task นี้; fixture ที่เป็น `async def` ต้องใช้ `@pytest_asyncio.fixture` เสมอ (repo ใช้ strict mode ไม่มี `asyncio_mode` — ดู precedent `backend/tests/test_booking_create_concurrency.py:91-97`)

---

## File Structure

### Wave A — Critical security (ทำก่อนทุก Wave บนไฟล์ที่ชน)

### Task A1: LIFF strict default true + ห้ามเขียน DB เมื่อไม่มีตัวตน

**Files:**
- Modify: `backend/app/api/v1/endpoints/liff.py`
- Reference: `backend/app/core/config.py` (`LIFF_STRICT_MODE: bool = True` มีอยู่แล้วที่ config.py:50 — ไม่แก้ไฟล์นี้)
- Modify: `backend/.env.development.example` (ปัจจุบัน `LIFF_STRICT_MODE=false` บรรทัด 4)
- Modify: `backend/.env.production.example` (ปัจจุบัน `LIFF_STRICT_MODE=false` บรรทัด 8)
- Modify: `backend/tests/test_liff_token.py` (case1 เปลี่ยนพฤติกรรมตาม PRD story 3)
- Test: `backend/tests/test_liff_strict_no_write.py`

**Interfaces (verified):**
- Consumes: `verify_liff_token(id_token: str) -> str` เดิมใน `backend/app/api/v1/endpoints/liff.py:31-52` (คืน `sub` เป็น str, ใช้ `settings.LINE_LOGIN_CHANNEL_ID` — liff.py:33-42; ค่าว่าง → 503, LINE ปฏิเสธ/ไม่มี sub → 401)
- Produces: `require_liff_identity(x_liff_id_token: Optional[str]) -> str` (ไม่มี token → `HTTPException(401)` ข้อความไทย ไม่เขียน DB ไม่ว่า strict เปิดหรือปิด); D3 reuse ฟังก์ชันนี้เติม timeout

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_liff_strict_no_write.py
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.service_request import ServiceRequest


def _fresh_engine():
    # recipe เดียวกับ backend/tests/test_liff_token.py:37-44 (ห้าม reuse pool ของ app ข้าม event loop)
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _count_service_requests() -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as s:
            return (await s.execute(select(func.count()).select_from(ServiceRequest))).scalar_one()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_no_token_lenient_mode_writes_nothing(test_client, monkeypatch):
    monkeypatch.setattr(settings, "LIFF_STRICT_MODE", False)
    before = await _count_service_requests()
    resp = test_client.post(
        "/api/v1/liff/service-requests",
        json={
            "prefix": "นาย", "firstname": "ทดสอบ", "lastname": "ระบบ",
            "phone_number": "0812345678", "topic_category": "ถนน",
            "description": "pytest-strict-no-write",
            "line_user_id": "Uunverified000000000000000",
        },
    )
    assert resp.status_code == 401
    assert "ยืนยันตัวตน" in resp.text
    assert await _count_service_requests() == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_liff_strict_no_write.py -v` (workdir `backend/`)
Expected: FAIL — ปัจจุบัน strict=false + ไม่มี token ได้ 201 พร้อม row ใหม่ (branch `LIFF-unverified` ที่ liff.py:156-159 เขียน DB)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/liff.py — เพิ่มถัดจาก verify_liff_token (บรรทัด 52)
async def require_liff_identity(x_liff_id_token: Optional[str]) -> str:
    """401 ทันทีเมื่อไม่มี token — ไม่เขียน DB ในโหมดผ่อนผันอีกต่อไป (PRD story 3)."""
    if not x_liff_id_token:
        logger.warning("liff_unverified_attempt strict=%s", settings.LIFF_STRICT_MODE)
        raise HTTPException(
            status_code=401,
            detail="กรุณายืนยันตัวตนผ่าน LINE ก่อนยื่นคำร้อง",
        )
    return await verify_liff_token(x_liff_id_token)
```

แล้วแทนที่บล็อก `if x_liff_id_token: ... elif settings.LIFF_STRICT_MODE: ... else: ...` ทั้งสาม endpoint (`upload_liff_media` liff.py:80-96, `create_service_request` liff.py:143-159, `create_debt_mediation_request` liff.py:273-290) ด้วย:

```python
    line_user_id = await require_liff_identity(x_liff_id_token)
    source_details = {"source": "LIFF v2"}  # debt-mediation ใช้ {"source": "LIFF"} ตามเดิม (liff.py:283)
```

อัปเดต `backend/tests/test_liff_token.py` case1 (`test_case1_flag_off_no_token_uses_body_fallback`, บรรทัด 147-160) ให้ตรงพฤติกรรมใหม่: assert 401 + `await _count_by_description(body["description"]) == 0` (เลิกคาดหวัง 201/body-fallback) — case 2/3/4/5/6/7 เดิมผ่านได้ทั้งหมด

```ini
# backend/.env.development.example + backend/.env.production.example
LIFF_STRICT_MODE=true
# หมายเหตุ: ตั้ง false ก็ยังตอบ 401 (ไม่มีโหมดเขียน DB อีกต่อไป) rollback จริง = redeploy รุ่นก่อน
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_liff_strict_no_write.py tests/test_liff_token.py tests/test_config_migration_controls.py -v`
Expected: PASS ทั้งหมด (case1 ที่แก้แล้วต้องเขียว)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/liff.py backend/.env.development.example backend/.env.production.example backend/tests/test_liff_token.py backend/tests/test_liff_strict_no_write.py
git commit -m "fix(liff): deny unauthenticated writes, default strict true"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_liff_media_upload.py tests/test_liff_debt_mediation.py tests/test_service_request_liff_validation.py -v`
Expected: PASS — ฟอร์ม LIFF ทั้งสามยังผ่านเมื่อมี token ถูกต้อง

### Task A2: Media private token gate — ว่างชนว่างต้องไม่ผ่าน + preview ส่ง token

**Files:**
- Modify: `backend/app/api/v1/endpoints/media.py`
- Modify: `frontend/app/admin/files/page.tsx`
- Test: `backend/tests/test_media_private_gate.py`

**Interfaces (verified):**
- Consumes: `GET /media/{media_id}` เดิม (media.py:136-159) เรียก `secrets.compare_digest((media.public_token or "").encode(), (token or "").encode())` (media.py:150-153) — ว่างชนว่างผ่าน; `MediaFile` fields `id: UUID, public_token, is_public` (backend/app/models/media_file.py:73-87); token เกิดด้วย `str(uuid.uuid4())` (media.py:400, 496) — คงไว้
- Produces: `check_private_token(stored: str | None, presented: str | None) -> bool`; frontend `buildMediaUrl(id: string, token: string) => string`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_media_private_gate.py
import uuid as uuid_mod
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.media_file import MediaFile


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def private_media():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = MediaFile(
            id=uuid_mod.uuid4(),
            filename="secret.pdf",
            mime_type="application/pdf",
            data=b"%PDF-1.4 pytest",
            size_bytes=15,
            is_public=False,
            public_token="tok-private-1234567890",
        )
        s.add(row)
        await s.commit()
        yield row
    async with Session() as s:
        await s.delete(await s.get(MediaFile, row.id))
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_private_media_empty_token_denied(test_client, private_media):
    mid = str(private_media.id)
    for qs in ["", "?token=", "?token=wrong"]:
        resp = test_client.get(f"/api/v1/media/{mid}{qs}")
        assert resp.status_code == 403, qs
    ok = test_client.get(f"/api/v1/media/{mid}?token={private_media.public_token}")
    assert ok.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_media_private_gate.py -v`
Expected: FAIL — เคสไม่มี token / `?token=` ได้ 200 (ว่างชนว่างผ่าน compare_digest)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/media.py — วางถัดจาก import block
def check_private_token(stored: str | None, presented: str | None) -> bool:
    """True เฉพาะฝั่งละ non-empty และตรงกันแบบ constant-time."""
    if not stored or not presented:
        return False
    return secrets.compare_digest(stored.encode(), presented.encode())
```

แทนเงื่อนไขเดิม (media.py:150-153) ด้วย:

```python
    if not media.is_public and not check_private_token(media.public_token, token):
        logger.warning("media_forbidden id=%s", media_id)
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์ดูไฟล์นี้")
```

(revoke ที่ media.py:410-422 ล้าง token + is_public ใน commit เดียวอยู่แล้ว — คงไว้)

frontend `frontend/app/admin/files/page.tsx`:

```tsx
function buildMediaUrl(id: string, token: string): string {
  const q = new URLSearchParams({ token });
  return `/api/v1/media/${id}?${q.toString()}`;
}
// ทุก <img>/<a> preview ต้องเรียก buildMediaUrl(id, token) ห้ามแปะ id เปล่าเปล่า
// ข้อความ error ภาษาไทย: "ไม่มีสิทธิ์ดูไฟล์นี้ กรุณาขอลิงก์ใหม่"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_media_private_gate.py tests/test_media_endpoints.py tests/test_media_upload_allowlist.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/media.py frontend/app/admin/files/page.tsx backend/tests/test_media_private_gate.py
git commit -m "fix(media): deny empty-token private access, send token in preview"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_webhook_media.py tests/test_rich_menu_image_media.py -v`
Expected: PASS — upload/revoke/thumbnail เดิมไม่พัง

### Task A3: Health auth + ซ่อน error ดิบ

**Files:**
- Modify: `backend/app/api/v1/endpoints/health.py`
- Test: `backend/tests/test_health_hardening.py`

**Interfaces (verified):**
- Consumes: route จริงคือ `GET /health` (health.py:18), `GET /health/websocket` (health.py:67), `GET /health/detailed` (health.py:82) — router mount ไม่มี prefix เพิ่ม (api.py:65) + app prefix `/api/v1` (main.py:221) → full path `/api/v1/health`, `/api/v1/health/detailed`, `/api/v1/health/websocket`; `GET /health/pseudonym-gate` (health.py:54-64) gated `get_current_admin` อยู่แล้ว — คงไว้; Redis check ใช้ `redis_client.is_connected` (backend/app/core/redis_client.py:208-211) — ไม่สร้าง helper ใหม่
- Produces: `/health` public แต่ไม่มี field `*_error` ที่ฝัง `str(e)`; `/health/detailed` + `/health/websocket` ต้องผ่าน `get_current_admin` (ไม่มี cookie → 401)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_health_hardening.py
import pytest

from app.api import deps as api_deps
from app.main import app


@pytest.mark.asyncio
async def test_detailed_and_ws_health_require_admin(test_client):
    for path in ("/api/v1/health/detailed", "/api/v1/health/websocket"):
        resp = test_client.get(path)
        assert resp.status_code in (401, 403), path


@pytest.mark.asyncio
async def test_basic_health_hides_raw_error(test_client):
    class _BoomSession:
        async def execute(self, *_a, **_k):
            raise RuntimeError("boom-secret-host")

    async def _override_get_db():
        yield _BoomSession()

    app.dependency_overrides[api_deps.get_db] = _override_get_db
    try:
        resp = test_client.get("/api/v1/health")
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert "boom-secret-host" not in resp.text
    assert "database_error" not in resp.json()
    assert resp.json()["database"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_health_hardening.py -v`
Expected: FAIL — detailed/websocket ได้ 200 โดยไม่ต้อง auth และ basic health ใส่ `database_error: "boom-secret-host"` (health.py:36)

- [ ] **Step 3: Write minimal implementation**

แก้ `backend/app/api/v1/endpoints/health.py`:

```python
# 1) /health/websocket (บรรทัด 67-68) และ /health/detailed (บรรทัด 82-83) เพิ่ม parameter:
#    _current_admin: User = Depends(get_current_admin)
# 2) ลบ str(e) ทุกจุด (บรรทัด 36, 43, 107, 128, 142) แทนด้วย logger.exception เช่น:
try:
    await db.execute(text("SELECT 1"))
    checks["database"] = True
except Exception:
    logger.exception("health database check failed")  # log ฝั่ง server เท่านั้น
# 3) เพิ่ม logger = logging.getLogger(__name__) ที่ module level
```

คง path `/health`, `/health/detailed`, `/health/websocket` ไว้ทั้งหมด (watchdog กับ monitor อ้างอยู่)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_health_hardening.py tests/test_health_watchdog.py tests/test_main_startup.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/health.py backend/tests/test_health_hardening.py
git commit -m "fix(health): require admin for detailed health, hide raw errors"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_health_watchdog.py -v`
Expected: PASS — watchdog ยังตรวจ basic `/api/v1/health` ได้แบบไม่ต้อง auth


## Wave B — Critical correctness (ขนานกับ Wave A ได้ ไฟล์ไม่ชน)

### Task B1: Transfer conditional UPDATE + rowcount + concurrency test

**Files:**
- Modify: `backend/app/services/live_chat_service/sessions.py`
- Modify: `backend/app/services/live_chat_service/errors.py`
- Modify: `backend/app/api/v1/endpoints/admin_live_chat.py` (เฉพาะ error mapping ของ transfer)
- Test: `backend/tests/test_transfer_race.py`

**Interfaces (verified):**
- Consumes: `transfer_session` เป็น **method ของ mixin** ลำดับ `(self, line_user_id: str, from_operator_id: int, to_operator_id: int, reason: Optional[str], db: AsyncSession)` (sessions.py:248-255) ติด `@audit_action("transfer_session", "chat_session")` (sessions.py:247); enum จริงคือ `SessionStatus` (backend/app/models/chat_session.py:7-10) — **ไม่มี** `ChatSessionStatus`; error constants เป็น `ValueError` จาก `backend/app/services/live_chat_service/errors.py:8-11` และ endpoint map ที่ admin_live_chat.py:281-290 (NO_ACTIVE_SESSION→404, NOT_CURRENT_OPERATOR→403)
- Produces: `TRANSFER_ERR_CONFLICT = "Session was transferred by another operator"` ใน errors.py + branch map → 409 ใน admin_live_chat.py; conditional UPDATE + rowcount แทน mutation ตรง ๆ (sessions.py:276-279); signature ไม่เปลี่ยน — claim/close (sessions.py:33-72, 74-134) และ `lock` param ของ `get_active_session` (sessions.py:284, 299-300 ใช้จริงโดย caller อื่น) คงไว้ทั้งคู่

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_transfer_race.py
import asyncio
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.chat_session import ChatSession, SessionStatus
from app.models.user import User, UserRole
from app.services.friend_service import friend_service
from app.services.live_chat_service import live_chat_service, TRANSFER_ERR_CONFLICT


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def seeded():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    line_id = "Utransferace00000000000001"
    async with Session() as db:
        op_a = User(username="t-race-a", role=UserRole.AGENT, is_active=True)
        op_b = User(username="t-race-b", role=UserRole.AGENT, is_active=True)
        db.add_all([op_a, op_b])
        await db.flush()
        citizen = await friend_service.get_or_create_user(line_id, db, commit=False)
        sess = ChatSession(
            user_id=citizen.id,
            status=SessionStatus.ACTIVE.value,
            operator_id=op_a.id,
        )
        db.add(sess)
        await db.commit()
        ids = {"a": op_a.id, "b": op_b.id, "citizen": citizen.id, "session": sess.id, "line": line_id}
    yield Session, ids
    async with Session() as db:
        for row in [
            await db.get(ChatSession, ids["session"]),
            await db.get(User, ids["citizen"]),
            await db.get(User, ids["a"]),
            await db.get(User, ids["b"]),
        ]:
            if row:
                await db.delete(row)
        await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_transfer_single_winner(seeded):
    Session, ids = seeded

    async def attempt():
        async with Session() as db:
            return await live_chat_service.transfer_session(
                line_user_id=ids["line"],
                from_operator_id=ids["a"],
                to_operator_id=ids["b"],
                reason="ฝากดูต่อ",
                db=db,
            )

    results = await asyncio.gather(attempt(), attempt(), return_exceptions=True)
    ok = [r for r in results if not isinstance(r, Exception)]
    conflicts = [r for r in results if isinstance(r, ValueError) and str(r) == TRANSFER_ERR_CONFLICT]
    assert len(ok) == 1
    assert len(conflicts) == 1
    async with Session() as db:
        row = await db.get(ChatSession, ids["session"])
        assert row.operator_id == ids["b"]
        assert row.transfer_count == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_transfer_race.py -v`
Expected: FAIL — สองยกสำเร็จทั้งคู่ (`len(ok) == 2`) เพราะปัจจุบันแก้ object ตรง ๆ (sessions.py:276-279) และ `transfer_count` เป็น 2

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/live_chat_service/errors.py — เพิ่มท้ายไฟล์
TRANSFER_ERR_CONFLICT = "Session was transferred by another operator"
```

(Step 1 import `TRANSFER_ERR_CONFLICT` จาก package — ต้อง export ใน `backend/app/services/live_chat_service/__init__.py` ด้วย มิฉะนั้น ImportError; ปัจจุบัน export แค่ 4 constants เดิมที่ :27-31 และ `__all__` ที่ :55-60)

```python
# backend/app/services/live_chat_service/__init__.py — เติมใน from .errors import (...)
from .errors import (
    TRANSFER_ERR_CONFLICT,
    TRANSFER_ERR_INVALID_TARGET,
    TRANSFER_ERR_NO_ACTIVE_SESSION,
    TRANSFER_ERR_NOT_CURRENT_OPERATOR,
    TRANSFER_ERR_TRANSFER_TO_SELF,
)
# และเติม "TRANSFER_ERR_CONFLICT" ใน __all__
```

```python
# backend/app/services/live_chat_service/sessions.py — แทนบล็อก mutation (ปัจจุบัน :276-279)
# ด้วย conditional UPDATE + rowcount (pattern เดียวกับ claim_session :50-68)
        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(ChatSession)
            .where(
                ChatSession.id == session.id,
                ChatSession.status == SessionStatus.ACTIVE,
                ChatSession.operator_id == from_operator_id,
            )
            .values(
                operator_id=to_operator_id,
                transfer_count=ChatSession.transfer_count + 1,
                transfer_reason=reason,
                last_activity_at=now,
            )
        )
        if result.rowcount != 1:
            current = await self.get_active_session(line_user_id, db)
            if not current:
                raise ValueError(TRANSFER_ERR_NO_ACTIVE_SESSION)
            raise ValueError(TRANSFER_ERR_CONFLICT)
        await db.commit()
        refreshed = await db.get(ChatSession, session.id)
        logger.info(f"Session {session.id} transferred from operator {from_operator_id} to {to_operator_id}")
        return refreshed
```

(pre-checks เดิม sessions.py:257-274 — no-active/not-owner/self/invalid-target + `can(to_operator.role, KEY_ACCESS_LIVE_CHAT)` — คงไว้ทั้งหมด; และเพิ่มใน `admin_live_chat.py:286-290`)

```python
# backend/app/api/v1/endpoints/admin_live_chat.py — เพิ่มก่อน branch 400
        if detail == TRANSFER_ERR_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
```

(WS handler `backend/app/services/ws_session/handlers.py:327-328` ส่ง error event กลางอยู่แล้ว — ไม่ต้องแก้)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_transfer_race.py tests/test_transfer_session_errors.py tests/test_session_claim.py tests/test_operator_takeover.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/live_chat_service/sessions.py backend/app/services/live_chat_service/errors.py backend/app/services/live_chat_service/__init__.py backend/app/api/v1/endpoints/admin_live_chat.py backend/tests/test_transfer_race.py
git commit -m "fix(live-chat): atomic transfer with conditional update"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_session_choreography.py tests/test_multi_operator.py tests/test_live_chat_service.py -v`
Expected: PASS — claim/close/transfer เดิมไม่พัง

### Task B2: Secrets → Credential migration + deny-list + mask

**Files:**
- Create: `backend/alembic/versions/a7b8c9d0e1f2_migrate_secrets_to_credential.py`
- Modify: `backend/app/services/settings_service.py`
- Modify: `backend/app/api/v1/endpoints/settings.py`
- Reference: `backend/app/services/credential_service.py` — `encrypt_credentials(data: dict) -> str` / `decrypt_credentials(encrypted: str) -> dict` **มีอยู่แล้ว** (credential_service.py:74-82) ไม่ต้องเขียนใหม่
- Reference: `backend/app/models/credential.py` — ชื่อ field จริงคือ `credentials` (credential.py:20; metadata_json :21) ไม่ใช่ `credentials_encrypted`
- Reference: `backend/app/models/system_setting.py` — key/value/description (system_setting.py:5-14)
- Test: `backend/tests/test_secrets_migration.py`

**Interfaces (verified):**
- Consumes: `CredentialService` singleton `credential_service` (credential_service.py:245); `Provider` enum LINE/TELEGRAM/N8N/GOOGLE_SHEETS/CUSTOM (credential.py:7-12); `POST /api/v1/admin/credentials` เดิมเข้ารหัสผ่าน `create_credential` → `encrypt_credentials(obj_in.credentials)` อยู่แล้ว (credential_service.py:119-146)
- Produces: `SECRET_DENY_LIST: frozenset[str]` + guard ใน `SettingsService.set_setting` (settings_service.py:20-35); `GET /api/v1/admin/settings` mask ค่า secret; one-shot migration (backup → encrypt → verify → mask)
- **Alembic head จริง (verified):** `t1u2v3w4x5y6` จาก `backend/alembic/versions/t1u2v3w4x5y6_index_service_requests_created_at.py:17-18` (Revises c9d0e1f2a3b4; ไม่มี migration ใด revises มัน) — ก่อนเขียนไฟล์ run `python scripts/db_target.py alembic --target local heads` ยืนยัน single head = `t1u2v3w4x5y6`; ถ้าไม่ใช่ (มี PR อื่น merge ก่อน) ให้ใช้ head ปัจจุบันแทนและแก้ `down_revision` ให้ตรงก่อน commit

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_secrets_migration.py
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.system_setting import SystemSetting
from app.services.credential_service import credential_service
from app.services.settings_service import SettingsService


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


def test_encrypt_credentials_roundtrip():
    enc = credential_service.encrypt_credentials({"token": "s3cr3t"})
    assert isinstance(enc, str) and "s3cr3t" not in enc
    assert credential_service.decrypt_credentials(enc) == {"token": "s3cr3t"}


@pytest.mark.asyncio
async def test_set_setting_rejects_secret_key():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        with pytest.raises(ValueError, match="Credentials"):
            await SettingsService.set_setting(db, "LINE_CHANNEL_SECRET", "plain-value")
    await engine.dispose()


@pytest.mark.asyncio
async def test_get_settings_masks_secret_values(test_client, monkeypatch):
    from types import SimpleNamespace
    from app.models.user import UserRole

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    marker = "tok-plaintext-xyz"
    async with Session() as s:
        s.add(SystemSetting(key="LINE_CHANNEL_ACCESS_TOKEN", value=marker))
        await s.commit()

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get("/api/v1/admin/settings")
        assert resp.status_code == 200
        assert marker not in resp.text
    finally:
        app.dependency_overrides.clear()
        async with Session() as s:
            row = (await s.execute(select(SystemSetting).where(
                SystemSetting.key == "LINE_CHANNEL_ACCESS_TOKEN"))).scalar_one_or_none()
            if row:
                await s.delete(row)
                await s.commit()
    await engine.dispose()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_secrets_migration.py -v`
Expected: FAIL — `set_setting` ไม่ raise (settings_service.py:20-35 ยังไม่มี guard) และ GET คืนค่า plaintext

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/settings_service.py — เพิ่มท้ายไฟล์ + guard ใน set_setting (:20-35)
SECRET_DENY_LIST: frozenset[str] = frozenset({
    "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    "N8N_API_KEY", "N8N_WEBHOOK_SECRET",
    "ENCRYPTION_KEY", "LINE_ID_HMAC_KEY",
})

    # ใน set_setting ก่อน upsert:
        if key in SECRET_DENY_LIST:
            raise ValueError("ห้ามเก็บรหัสลับใน SystemSetting — ใช้หน้า Credentials แทน")
```

```python
# backend/app/api/v1/endpoints/settings.py
# update_setting (:334-361): ครอบ SettingsService.set_setting ด้วย
#     except ValueError as exc: raise HTTPException(status_code=400, detail=str(exc))
# list_settings (:301-304) คืน ORM list ตรง ๆ อยู่แล้ว — mask ก่อนตอบ —
    out = []
    for s in result.scalars().all():
        val = "***" if s.key in SECRET_DENY_LIST else s.value
        out.append(SystemSettingResponse.model_validate(s).model_copy(update={"value": val}))
    return out
# (ห้ามส่ง kwarg ชื่อ update เข้า model_validate — Pydantic V2 ไม่มีพารามิเตอร์นี้;
# pattern ที่ถูกตรงกับ precedent ใน admin_live_chat.py:142 คือ validate ก่อนแล้วค่อย model_copy)
```

```python
# backend/alembic/versions/a7b8c9d0e1f2_migrate_secrets_to_credential.py
"""one-shot: move secret SystemSetting rows into encrypted Credential rows."""
import os
from alembic import op
import sqlalchemy as sa
from cryptography.fernet import Fernet

revision = "a7b8c9d0e1f2"
down_revision = "t1u2v3w4x5y6"  # verified head 2026-09-13 (ยืนยันซ้ำด้วย `alembic heads` ก่อน merge)

_DENY = (
    "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    "N8N_API_KEY", "N8N_WEBHOOK_SECRET",
)
_PROVIDER = {"LINE_": "LINE", "TELEGRAM_": "TELEGRAM", "N8N_": "N8N"}


def _provider_for(key: str) -> str:
    for prefix, provider in _PROVIDER.items():
        if key.startswith(prefix):
            return provider
    return "CUSTOM"


def upgrade() -> None:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY must be set before running this migration")
    cipher = Fernet(key.encode())
    conn = op.get_bind()

    # 1) backup plaintext ไว้ตารางชั่วคราว (ใช้ตอน downgrade เท่านั้น)
    # `"key"`/`"value"` ต้อง quote เสมอ — `key` เป็น reserved word ของ Postgres
    conn.execute(sa.text(
        'CREATE TABLE IF NOT EXISTS _secret_migration_backup AS '
        'SELECT id, "key", "value" FROM system_settings WHERE "key" = ANY(:keys)'
    ), {"keys": list(_DENY)})

    # 2) encrypt → insert Credential, 3) verify roundtrip, 4) mask ต้นทาง
    rows = conn.execute(sa.text(
        'SELECT id, "key", "value" FROM _secret_migration_backup'
    )).mappings().all()
    for row in rows:
        enc = cipher.encrypt(str(row["value"]).encode()).decode()
        if cipher.decrypt(enc.encode()).decode() != str(row["value"]):
            raise RuntimeError(f"roundtrip verify failed for {row['key']}")
        conn.execute(sa.text(
            'INSERT INTO credentials (name, provider, credentials, metadata, is_active, is_default) '
            "VALUES (:name, :provider, :credentials, NULL, true, false)"
        ), {"name": row["key"], "provider": _provider_for(row["key"]), "credentials": enc})
        conn.execute(sa.text(
            'UPDATE system_settings SET "value" = \'***MIGRATED***\' WHERE id = :id'
        ), {"id": row["id"]})


def downgrade() -> None:
    # restore จาก backup เท่านั้น — ไม่ถอดรหัส Credential กลับเป็น plaintext อัตโนมัติ
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        'SELECT id, "value" FROM _secret_migration_backup'
    )).mappings().all()
    for row in rows:
        conn.execute(sa.text(
            'UPDATE system_settings SET "value" = :value WHERE id = :id'
        ), {"value": row["value"], "id": row["id"]})
    conn.execute(sa.text(
        "DELETE FROM credentials WHERE name = ANY(:keys)"
    ), {"keys": list(_DENY)})
    conn.execute(sa.text("DROP TABLE IF EXISTS _secret_migration_backup"))
```

(หน้า admin settings/line แสดงคำเตือนไทย "ค่านี้ย้ายไป Credentials แล้ว ห้ามกรอกที่นี่" เมื่อ GET ได้ `***`)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_secrets_migration.py tests/test_credential_service.py tests/test_credential_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/a7b8c9d0e1f2_migrate_secrets_to_credential.py backend/app/services/settings_service.py backend/app/api/v1/endpoints/settings.py backend/tests/test_secrets_migration.py
git commit -m "fix(secrets): migrate secrets to encrypted credentials"
```

- [ ] **Step 6: Validation**

Run: `python scripts/db_target.py alembic --target local upgrade head` แล้ว `python scripts/db_target.py alembic --target local downgrade -1` ตามด้วย `upgrade head` ซ้ำอีกรอบ
Expected: PASS — รหัสไม่หาย (verify ด้วย `SELECT count(*) FROM _secret_migration_backup` ก่อน-หลัง)


## Wave C — High backend (เริ่มหลัง Wave A merge บนไฟล์ที่ชน: liff.py / media.py)

### Task C1: Analytics cache + percentile ใน SQL + response schema

**Files:**
- Modify: `backend/app/services/analytics_service.py`
- Modify: `backend/app/api/v1/endpoints/admin_analytics.py`
- Create: `backend/app/schemas/analytics.py`
- Test: `backend/tests/test_analytics_perf.py`

**Interfaces (verified):**
- Consumes: `GET /api/v1/analytics/dashboard?days=` (admin_analytics.py:67-74) gated `require_permission(KEY_VIEW_REPORTS)`; `analytics_service.get_dashboard(db, days)` (analytics_service.py:433-451) ประกอบจาก `get_session_volume` (:251) + `get_conversation_funnel` (:302) + `get_peak_hours_heatmap` (:277) + `get_percentiles` (:333-367 — คำนวณใน Python ด้วย `_percentile` :670) — **ไม่มีคอลัมน์** `duration_seconds` ใน `ChatSession`; ช่วงเวลาจริงมาจาก `started_at/first_response_at/closed_at` (chat_session.py:29-33); `redis_client.get/setex/delete` (redis_client.py:77-132)
- Produces: percentile SQL ผ่าน `func.percentile_cont(...).within_group(func.extract("epoch", ...))`; cache Redis TTL 120s ต่อ `days`; `DashboardResponse` Pydantic ล็อก shape เดิม + `cache_hit: bool`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_analytics_perf.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.core.redis_client import redis_client
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.user import UserRole
from sqlalchemy import event


@pytest.fixture
def query_counter():
    counter = SimpleNamespace(count=0)

    def _incr(*_a, **_k):
        counter.count += 1

    engine = AsyncSessionLocal.bind
    event.listen(engine.sync_engine, "before_cursor_execute", _incr)
    yield counter
    event.remove(engine.sync_engine, "before_cursor_execute", _incr)


@pytest.mark.asyncio
async def test_dashboard_query_budget_and_cache(test_client, query_counter):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        await redis_client.delete("analytics:dashboard:7")
        r1 = test_client.get("/api/v1/analytics/dashboard?days=7")
        assert r1.status_code == 200
        body = r1.json()
        assert {"trends", "funnel", "heatmap", "percentiles", "generated_at", "cache_hit"} <= set(body)
        first = query_counter.count
        assert first <= 5, f"too many queries: {first}"
        r2 = test_client.get("/api/v1/analytics/dashboard?days=7")
        assert r2.json()["cache_hit"] is True
        assert query_counter.count == first
    finally:
        app.dependency_overrides.clear()
        await redis_client.delete("analytics:dashboard:7")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_analytics_perf.py -v`
Expected: FAIL — ไม่มี field `cache_hit` และ query รวมเกิน 5 (percentile/trends/funnel/heatmap แยกกันหมด + Python percentile)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/analytics.py (Create)
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trends: list[dict]
    funnel: dict
    heatmap: list[dict]
    percentiles: dict
    generated_at: datetime
    cache_hit: bool = False
```

```python
# backend/app/services/analytics_service.py — แทน get_dashboard (:433-451)
CACHE_TTL_SECONDS = 120

    async def get_dashboard(self, db: AsyncSession, days: int = 7) -> dict:
        key = f"analytics:dashboard:{days}"
        cached = await redis_client.get(key)
        if cached:
            data = json.loads(cached)
            data["cache_hit"] = True
            return data

        frt = func.extract("epoch", ChatSession.first_response_at - ChatSession.started_at)
        res = func.extract("epoch", ChatSession.closed_at - ChatSession.first_response_at)
        window = ChatSession.created_at >= datetime.now(timezone.utc) - timedelta(days=days)
        row = (await db.execute(
            select(
                func.percentile_cont(0.5).within_group(frt),
                func.percentile_cont(0.9).within_group(frt),
                func.percentile_cont(0.99).within_group(frt),
                func.percentile_cont(0.5).within_group(res),
                func.percentile_cont(0.9).within_group(res),
                func.percentile_cont(0.99).within_group(res),
            ).where(window)
        )).one()

        payload = {
            "trends": await self.get_session_volume(db, days=days),
            "funnel": await self.get_conversation_funnel(db, days=days),
            "heatmap": await self.get_peak_hours_heatmap(db, days=days),
            "percentiles": {
                "first_response": {"p50": round(row[0] or 0, 1), "p90": round(row[1] or 0, 1), "p99": round(row[2] or 0, 1)},
                "resolution": {"p50": round(row[3] or 0, 1), "p90": round(row[4] or 0, 1), "p99": round(row[5] or 0, 1)},
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cache_hit": False,
        }
        await redis_client.setex(key, CACHE_TTL_SECONDS, json.dumps(payload, default=str))
        return payload
```

(คีย์ `first_response`/`resolution` ตรง shape เดิมของ `get_percentiles` :355-365; Redis ล่ม → `redis_client.get` คืน None → คำนวณตรง ๆ ตามพฤติกรรม redis_client.py:103-111)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_analytics_perf.py tests/test_analytics_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics_service.py backend/app/api/v1/endpoints/admin_analytics.py backend/app/schemas/analytics.py backend/tests/test_analytics_perf.py
git commit -m "perf(analytics): cache dashboard with sql percentiles"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_analytics_service.py -v`
Expected: PASS — ค่า percentile ใกล้เคียงค่าเดิม (ทนต่างได้เพราะเปลี่ยนวิธี interpolate)

### Task C2: Broadcast dry-run + multicast backoff

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_broadcast.py`
- Modify: `backend/app/services/broadcast_service.py`
- Test: `backend/tests/test_broadcast_dryrun.py`

**Interfaces (verified):**
- Consumes: `BroadcastCreate(title, message_type: BroadcastType, content: dict, target_audience="all", target_filter)` (admin_broadcast.py:27-32); `POST /api/v1/admin/broadcasts` (api.py:62) gated `require_permission(KEY_MANAGE_BROADCAST)` DEFAULT {SUPER_ADMIN, ADMIN} (permissions.py:106); OBJECT_REF resolve มีอยู่แล้วผ่าน `resolve_object` (broadcast_service.py:158-165); `schedule_broadcast` normalize naive→UTC และปฏิเสธอดีตอยู่แล้ว (broadcast_service.py:229-245); multicast chunk 500/รอบ (broadcast_service.py:199-216)
- Produces: `dry_run: bool = False` ใน BroadcastCreate → POST ตอบ preview (200) โดยไม่ persist ไม่สร้าง audit; retry 3 รอบ exponential ต่อ multicast chunk

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_broadcast_dryrun.py
from types import SimpleNamespace
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.broadcast import Broadcast
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _count_broadcasts() -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as s:
            return (await s.execute(select(func.count()).select_from(Broadcast))).scalar_one()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_dry_run_creates_nothing(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        before = await _count_broadcasts()
        resp = test_client.post(
            "/api/v1/admin/broadcasts",
            json={
                "title": "ทดสอบ dry-run",
                "message_type": "text",
                "content": {"text": "สวัสดี"},
                "target_audience": "all",
                "dry_run": True,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["dry_run"] is True
        assert await _count_broadcasts() == before
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_cannot_create_broadcast(test_client):
    async def _override():
        yield SimpleNamespace(id=2, role=UserRole.AGENT, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.post(
            "/api/v1/admin/broadcasts",
            json={"title": "x", "message_type": "text", "content": {"text": "x"}, "target_audience": "all"},
        )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_broadcast_dryrun.py -v`
Expected: FAIL — ส่ง `dry_run` แล้วถูก extra=ignore และสร้าง broadcast จริง (count เพิ่ม)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/admin_broadcast.py
class BroadcastCreate(BaseModel):
    title: str
    message_type: BroadcastType = BroadcastType.TEXT
    content: dict
    target_audience: str = "all"
    target_filter: Optional[dict] = None
    dry_run: bool = False


class BroadcastDryRunResponse(BaseModel):
    dry_run: bool = True
    title: str
    message_type: str
    estimated_recipients: Optional[int]  # None = ผู้ติดตามทั้งหมด
    messages_valid: bool


# ใน create_broadcast (:112-142) ก่อนแตะ service:
    if payload.dry_run:
        preview = SimpleNamespace(
            id=0, title=payload.title,
            message_type=payload.message_type, content=payload.content,
        )
        messages = await broadcast_service._build_messages(preview, db)
        estimated = None
        if payload.target_audience != "all":
            estimated = len((payload.target_filter or {}).get("user_ids", []))
        return BroadcastDryRunResponse(
            title=payload.title,
            message_type=payload.message_type.value,
            estimated_recipients=estimated,
            messages_valid=bool(messages),
        )
```

```python
# backend/app/services/broadcast_service.py — แทน chunk loop (:201-210)
                    for attempt in range(3):
                        try:
                            await self.api.multicast(
                                MulticastRequest(to=chunk, messages=messages)
                            )
                            sent += len(chunk)
                            break
                        except Exception as chunk_exc:
                            if attempt == 2:
                                failed += len(chunk)
                                logger.error(
                                    "Broadcast %s chunk %d failed after 3 attempts: %s",
                                    broadcast.id, i // 500, chunk_exc,
                                )
                            else:
                                await asyncio.sleep(2 ** attempt)
```

(`scheduled_at` เก็บ UTC + normalize อยู่แล้วที่ :235-239; UI แปลง Asia_Bangkok ตอนแสดง)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_broadcast_dryrun.py tests/test_broadcast_service.py tests/test_broadcast_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_broadcast.py backend/app/services/broadcast_service.py backend/tests/test_broadcast_dryrun.py
git commit -m "feat(broadcast): dry-run preview with multicast backoff"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_broadcast_service.py tests/test_broadcast_scheduler.py -v`
Expected: PASS — scheduled ข้าม timezone ยังตรง
### Task C3: Intent keyword — REGEX write-guard + LIKE escape + precompile cache

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_intents.py`
- Modify: `backend/app/services/message_intake/intent_matching.py`
- Test: `backend/tests/test_intent_regex_guard.py`

**Interfaces (verified):**
- Consumes: model จริงคือ `IntentKeyword(category_id, keyword, match_type)` + `MatchType` (exact/contains/regex/starts_with) (backend/app/models/intent.py:8-12, 46-57) — **ไม่มี** ฟิลด์ `pattern`/`priority` และไม่มีไฟล์ `backend/app/services/intent_matcher.py`; matcher จริงคือ `find_intent_keyword` cascade EXACT > STARTS_WITH > CONTAINS > REGEX (`backend/app/services/message_intake/intent_matching.py:34-82`); REGEX มีกันความยาว 256/1000 อยู่แล้ว (:18-19, 71-76) แต่ compile ใหม่ทุกข้อความ; LIKE branch (:50-64) ไม่ escape `%`/`_` ใน keyword; write path คือ `POST/PUT /api/v1/admin/intents/keywords` (`@router.post("/keywords")` ที่ admin_intents.py:161 + `@router.put("/keywords/{k_id}")` ต่อท้าย บวก router prefix `/admin/intents` ที่ api.py:46)
- Produces: `compile_intent_keyword(keyword: str) -> re.Pattern` (nested-quantifier reject); `_regex_cache` + `invalidate_intent_regex_cache()`; `_like_safe()` + `ilike(..., escape="\\")` ใน STARTS_WITH/CONTAINS

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_intent_regex_guard.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_nested_quantifier_regex_rejected(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.post(
            "/api/v1/admin/intents/keywords",
            json={"category_id": 1, "keyword": "(a+)+$", "match_type": "regex"},
        )
        assert resp.status_code == 422
        assert "เจาะจง" in resp.text or "ค้าง" in resp.text
    finally:
        app.dependency_overrides.clear()


def test_compile_intent_keyword_rejects_poison():
    from app.services.message_intake.intent_matching import compile_intent_keyword
    with pytest.raises(ValueError):
        compile_intent_keyword("(a+)+$" * 5)
    with pytest.raises(ValueError):
        compile_intent_keyword("x" * 300)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_intent_regex_guard.py -v`
Expected: FAIL — ยังไม่มี `compile_intent_keyword` (ImportError) และ POST regex พิษได้ 201

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/message_intake/intent_matching.py
_NESTED_QUANTIFIER_RE = re.compile(r"(\+|\*){2,}|\([^)]*[+*][^)]*\)(\+|\*)")
_regex_cache: dict[int, re.Pattern] = {}


def compile_intent_keyword(keyword: str) -> re.Pattern:
    """Write-time guard: ความยาว + nested quantifier ก่อนยอมรับ REGEX keyword."""
    if len(keyword) > MAX_REGEX_PATTERN_LENGTH:
        raise ValueError("รูปแบบยาวเกินไป กรุณาย่อให้สั้นลง")
    if _NESTED_QUANTIFIER_RE.search(keyword):
        raise ValueError("รูปแบบเสี่ยงทำให้ระบบค้าง กรุณาเขียนให้เจาะจงขึ้น")
    return re.compile(keyword, re.IGNORECASE)


def invalidate_intent_regex_cache() -> None:
    _regex_cache.clear()


def _like_safe(col):
    from sqlalchemy import func
    return func.replace(
        func.replace(func.replace(col, "\\", "\\\\"), "%", "\\%"), "_", "\\_"
    )
```

ใน `find_intent_keyword`: STARTS_WITH (:50-56) และ CONTAINS (:58-64) เปลี่ยนเป็น:

```python
    stmt = _intent_keyword_stmt(
        literal(text).ilike(
            func.concat(_like_safe(IntentKeyword.keyword), "%"), escape="\\"
        ),
        IntentKeyword.match_type == MatchType.STARTS_WITH,
    ).limit(1)
```

และ REGEX branch (:66-82) ใช้ cache:

```python
    for kw in regex_keywords:
        pattern = kw.keyword or ""
        if len(pattern) > MAX_REGEX_PATTERN_LENGTH:
            continue
        compiled = _regex_cache.get(kw.id)
        if compiled is None:
            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as exc:
                logger.warning(f"Skipping invalid REGEX intent keyword {kw.id}: {exc}")
                continue
            _regex_cache[kw.id] = compiled
        if compiled.search(probe):
            return kw
```

```python
# backend/app/api/v1/endpoints/admin_intents.py — ใน POST/PUT keywords (:161-183)
    from app.services.message_intake.intent_matching import (
        compile_intent_keyword, invalidate_intent_regex_cache,
    )
    if body.match_type == MatchType.REGEX:
        try:
            compile_intent_keyword(body.keyword)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    invalidate_intent_regex_cache()  # เรียกหลังทุก POST/PUT/DELETE keywords
```

(ลำดับ matcher จริงคือ cascade ตาม match_type — intent_matching.py:34-64 — ไม่มีคอลัมน์ priority/created_at ใน model; ห้ามเรียงตามสิ่งที่ไม่มี)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_intent_regex_guard.py tests/test_webhook_intent_matching.py tests/test_match_type_unification.py tests/test_detect_category.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_intents.py backend/app/services/message_intake/intent_matching.py backend/tests/test_intent_regex_guard.py
git commit -m "fix(intent): regex write-guard with like escape and precompile"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_webhook_intent_fallthrough.py tests/test_intent_category_readiness.py -v`
Expected: PASS

### Task C4: Reply object $name เข้ม + update validation

**Files:**
- Modify: `backend/app/schemas/reply_object.py`
- Test: `backend/tests/test_reply_object_guard.py`

**Interfaces (verified):**
- Consumes: `POST/PUT /api/v1/admin/reply-objects` (api.py:44) — schema จริง `ReplyObjectBase(object_id, name, category, object_type, payload, alt_text, preview_url)` + `validate_payload_for_type` (schemas/reply_object.py:25-58); PUT ตรวจ payload เมื่อส่งคู่ object_type อยู่แล้ว (:53-58); endpoint PUT admin_reply_objects.py:96-120
- Produces: `OBJECT_ID_RE = ^\$[A-Za-z][A-Za-z0-9_]{2,39}$` เป็น `field_validator("object_id")` ใน `ReplyObjectBase`; `$100` → 422

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_reply_object_guard.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_dollar_name_strict(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        bad = test_client.post(
            "/api/v1/admin/reply-objects",
            json={"object_id": "$100", "name": "x", "object_type": "text", "payload": {"text": "hi"}},
        )
        assert bad.status_code == 422
        good = test_client.post(
            "/api/v1/admin/reply-objects",
            json={"object_id": "$flex_traffic", "name": "จราจร", "object_type": "text", "payload": {"text": "hi"}},
        )
        assert good.status_code == 201
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_reply_object_guard.py -v`
Expected: FAIL — `$100` ผ่านได้ 201 (schema ปัจจุบันมีแค่ min_length=1 — reply_object.py:26)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/reply_object.py — เพิ่มใน ReplyObjectBase
import re
from pydantic import field_validator

OBJECT_ID_RE = re.compile(r"^\$[A-Za-z][A-Za-z0-9_]{2,39}$")

    @field_validator("object_id")
    @classmethod
    def _object_id_format(cls, v: str) -> str:
        if not OBJECT_ID_RE.match(v):
            raise ValueError(
                "object_id ต้องขึ้นต้นด้วย $ ตามด้วยตัวอักษร แล้วตัวอักษร/ตัวเลข/ขีดล่าง รวม 4-40 ตัว (เช่น $flex_traffic)"
            )
        return v
```

(PUT update validation มีอยู่แล้วผ่าน `_validate_payload_shape` :53-58; `object_id` แก้ผ่าน PUT ไม่ได้อยู่แล้วเพราะ `ReplyObjectUpdate` :44-51 ไม่มี field นี้)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_reply_object_guard.py tests/test_reply_object_validation.py tests/test_response_parser.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/reply_object.py backend/tests/test_reply_object_guard.py
git commit -m "fix(reply-objects): strict dollar-name validation"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_reply_object_validation.py tests/test_response_parser_template.py -v`
Expected: PASS
### Task C5: Request DELETE audit + enum รวมศูนย์ (ใช้ของเดิม)

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_requests.py`
- Reference: `backend/app/models/service_request.py` — `RequestStatus` เดิม PENDING/ACKNOWLEDGED/IN_PROGRESS/AWAITING_APPROVAL/COMPLETED/REJECTED (:8-26) — **ห้ามสร้าง** `backend/app/schemas/request_status.py` ซ้ำและห้าม invent DONE/CANCELLED
- Test: `backend/tests/test_request_guards.py`

**Interfaces (verified):**
- Consumes: routes จริง `PATCH /api/v1/admin/requests/{id}` (assignment ผ่าน `assigned_agent_id` + `_check_assignment_permissions` มี guard ครบอยู่แล้ว — admin_requests.py:610-668) และ `DELETE /api/v1/admin/requests/{id}` (:670-686 ยังไม่เขียน audit); `create_audit_log(db, admin_id, action, resource_type, resource_id, details)` (backend/app/core/audit.py:110-148)
- Produces: DELETE เขียน audit `action="delete_request"` ก่อนลบ; frontend constants ตรงกับ 6 ค่า enum เดิม

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_request_guards.py
from types import SimpleNamespace
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.service_request import ServiceRequest
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def owned_request():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = ServiceRequest(description="pytest-delete-audit", source="ADMIN")
        s.add(row)
        await s.commit()
        yield Session, row.id
    async with Session() as s:
        for r in (await s.execute(
            select(AuditLog).where(AuditLog.resource_id == str(row_id))
        )).scalars():
            await s.delete(r)
        left = await s.get(ServiceRequest, row_id)
        if left:
            await s.delete(left)
        await s.commit()
    await engine.dispose()
```

(Test ต่อใน Step 1 — ใช้ fixture ข้างบน:)

```python
@pytest.mark.asyncio
async def test_delete_writes_audit(test_client, owned_request):
    Session, rid = owned_request

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    async def _override_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[api_deps.get_current_user] = _override
    app.dependency_overrides[api_deps.get_current_admin] = _override
    app.dependency_overrides[api_deps.get_db] = _override_db
    try:
        resp = test_client.delete(f"/api/v1/admin/requests/{rid}")
        assert resp.status_code == 204
        async with Session() as s:
            logs = (await s.execute(select(AuditLog).where(
                AuditLog.action == "delete_request",
                AuditLog.resource_id == str(rid),
            ))).scalars().all()
            assert len(logs) == 1
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_request_guards.py -v`
Expected: FAIL — ลบได้ 204 แต่ไม่มี audit row (admin_requests.py:670-686 ลบเฉย ๆ)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/admin_requests.py — แทน delete_request (:670-686)
@router.delete("/{request_id}", status_code=204)
async def delete_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Delete a service request permanently (audit-logged)."""
    query = select(ServiceRequest).where(ServiceRequest.id == request_id)
    request = (await db.execute(query)).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="delete_request",
        resource_type="service_request",
        resource_id=str(request_id),
        details={"topic_category": request.topic_category or None},
    )
    await db.delete(request)
    await db.commit()
    return None
```

(`create_audit_log` import จาก `app.core.audit` — precedent: admin_bookings.py:88-98)

**enum รวมศูนย์:** run `grep -rn "AWAITING_APPROVAL\|IN_PROGRESS\|COMPLETED" frontend/lib frontend/app/admin/requests` แล้วแก้ไฟล์ constants ที่พบให้เหลือ 6 ค่าตรงตาม service_request.py:21-26 (ห้ามเพิ่ม DONE/CANCELLED/TERMINAL)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_request_guards.py tests/test_admin_requests_endpoints.py tests/test_request_workflow.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_requests.py backend/tests/test_request_guards.py
git commit -m "fix(requests): audit-log delete, keep single status enum"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_request_workflow.py tests/test_admin_requests_endpoints.py -v`
Expected: PASS

### Task C6: Booking cap 62 วัน + terminal 409 + PATCH 422

**Files:**
- Modify: `backend/app/services/booking_service.py`
- Modify: `backend/app/api/v1/endpoints/liff_bookings.py`
- Modify: `backend/app/api/v1/endpoints/admin_bookings.py`
- Test: `backend/tests/test_booking_guards.py`

**Interfaces (verified):**
- Consumes: `BookingStatus` = CONFIRMED/CANCELLED/COMPLETED/NOSHOW (backend/app/models/booking.py:18-22) — **ไม่มี** DONE; `SETTABLE_STATUSES` ปลายทางของ admin (admin_bookings.py:29-33); `MAX_AVAILABILITY_RANGE_DAYS = 62` มีอยู่ (booking_service.py:56) + `advance_days` config (:81, ตรวจที่ compute_slots :150); LIFF create `POST /api/v1/liff/bookings` body `{service_type, booking_date, booking_time, ...}` (BookingCreate — schemas/booking.py:94-97) ผ่าน `require_line_user_id` (liff_bookings.py:61-65); PATCH citizen `PATCH /api/v1/liff/bookings/{id}` รับ `Optional[BookingUpdateIn]` (:268-279)
- Produces: `BookingWindowError` + `validate_booking_date(target, advance_days, today)` (cap = `min(62, advance_days)`) เรียกใน `create_booking` (:257-318); terminal guard ใน `update_booking_status`; PATCH body จำเป็น (เอา Optional ออก) → ขาด body ได้ 422

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_booking_guards.py
from datetime import date, timedelta
import pytest

from app.api.v1.endpoints import liff_bookings as liff_bookings_module


@pytest.mark.asyncio
async def test_booking_beyond_cap_rejected(test_client, monkeypatch):
    async def _fake_verify(token):
        return "Ubooking000000000000000001"

    monkeypatch.setattr(liff_bookings_module, "verify_liff_token", _fake_verify)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_booking_guards.py -v`
Expected: FAIL — จอง 90 วันผ่าน (compute_slots :150 ตรวจแค่ advance_days ซึ่ง admin ตั้งเกิน 62 ได้) และ PATCH ไม่มี body ไม่ได้ 422

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/booking_service.py
MAX_ADVANCE_BOOKING_DAYS = 62


class BookingWindowError(Exception):
    """booking_date เกิน min(MAX_ADVANCE_BOOKING_DAYS, advance_days) หรือเป็นอดีต."""


def validate_booking_date(target: date, advance_days: int, today: date) -> int:
    cap = min(MAX_ADVANCE_BOOKING_DAYS, advance_days)
    delta = (target - today).days
    if delta < 0 or delta > cap:
        raise BookingWindowError(cap)
    return cap


# ใน create_booking (:257-318) หลังโหลด config/day_hours:
    validate_booking_date(booking_date, config.advance_days, local_now().date())
```

```python
# backend/app/api/v1/endpoints/liff_bookings.py
# 1) import BookingWindowError แล้วเพิ่ม except ก่อน UnknownServiceTypeError:
    except BookingWindowError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"จองล่วงหน้าได้ไม่เกิน {exc.args[0]} วัน กรุณาเลือกวันใหม่",
        )
# 2) update_my_booking (:274-279): payload เป็น required —
    payload: BookingUpdateIn,  # เอา Optional ออก → ขาด body FastAPI ตอบ 422 เอง
```

```python
# backend/app/api/v1/endpoints/admin_bookings.py — ใน update_booking_status (:74-101)
    previous = booking.status
    if previous in SETTABLE_STATUSES and status != previous:
        raise HTTPException(
            status_code=409,
            detail="คิวนี้จบสถานะแล้ว เปลี่ยนย้อนกลับไม่ได้",
        )
```

(terminal set = `SETTABLE_STATUSES` {COMPLETED, NOSHOW, CANCELLED} — admin_bookings.py:29-33 — ห้าม invent DONE; ทดสอบ 409: seed booking CANCELLED แล้ว `PATCH /api/v1/admin/bookings/{id}/status?status=CONFIRMED` ผ่าน override `get_current_staff`)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_booking_guards.py tests/test_booking_create.py tests/test_booking_update.py tests/test_booking_list.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/booking_service.py backend/app/api/v1/endpoints/liff_bookings.py backend/app/api/v1/endpoints/admin_bookings.py backend/tests/test_booking_guards.py
git commit -m "fix(booking): unified advance cap with terminal guard"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_booking_slots.py tests/test_booking_availability_range.py tests/test_booking_create_concurrency.py -v`
Expected: PASS
### Task C7: Rich menu preview + scheduler per-menu try

**Files:**
- Modify: `backend/app/api/v1/endpoints/rich_menus.py`
- Modify: `backend/app/tasks/rich_menu_display_scheduler.py`
- Test: `backend/tests/test_richmenu_preview_sched.py`

**Interfaces (verified):**
- Consumes: `RichMenu.image_media_id` FK→media_files (backend/app/models/rich_menu.py:49-53) — **ไม่มี** ฟิลด์ `image_path`; routes อยู่ใต้ `/api/v1/admin/rich-menus` (api.py:50) และ **ยังไม่มี** `GET /{id}/preview`; scheduler จริงคือ `backend/app/tasks/rich_menu_display_scheduler.py` (`_activate_due` :35-63, `_expire_due` :66-101 — loop ตรง ๆ ไม่มี per-menu try); เวลาเทียบ `datetime.now(timezone.utc)` (:107)
- Produces: `GET /api/v1/admin/rich-menus/{id}/preview` (placeholder เมื่อไม่มีรูป); per-menu try/except + rollback ใน scheduler

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_richmenu_preview_sched.py
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.rich_menu import RichMenu, RichMenuDisplayMode
from app.models.user import UserRole


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def menu_without_image():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        row = RichMenu(
            name="pytest-preview",
            chat_bar_text="เมนู",
            config={"size": {"width": 2500, "height": 1686}, "areas": []},
        )
        s.add(row)
        await s.commit()
        menu_id = row.id
    yield menu_id
    async with Session() as s:
        row = await s.get(RichMenu, menu_id)
        if row:
            await s.delete(row)
            await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_imageless_preview_ok(test_client, menu_without_image):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get(f"/api/v1/admin/rich-menus/{menu_without_image}/preview")
        assert resp.status_code == 200
        assert resp.json()["placeholder"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_scheduler_isolates_failure(menu_without_image):
    from app.tasks import rich_menu_display_scheduler as sched

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        ok_menu = RichMenu(
            name="pytest-sched-ok",
            chat_bar_text="เมนู2",
            config={"size": {"width": 2500, "height": 1686}, "areas": []},
            line_rich_menu_id="richmenu-sched-ok",
            display_mode=RichMenuDisplayMode.SCHEDULED.value,
            display_start_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        s.add(ok_menu)
        await s.commit()
        ok_id = ok_menu.id
    original = sched.RichMenuService.set_default_on_line
    sched.RichMenuService.set_default_on_line = AsyncMock(side_effect=RuntimeError("LINE down"))
    try:
        async with Session() as s:
            await sched._activate_due(s, datetime.now(timezone.utc))  # ต้องไม่ raise
    finally:
        sched.RichMenuService.set_default_on_line = original
        async with Session() as s:
            row = await s.get(RichMenu, ok_id)
            if row:
                await s.delete(row)
                await s.commit()
    await engine.dispose()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_richmenu_preview_sched.py -v`
Expected: FAIL — ไม่มี route `/preview` (404) และ `_activate_due` โยน exception ทำให้ tick ทั้งรอบตาย

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/rich_menus.py — เพิ่มก่อน @router.get("/{id}") (:515)
@router.get("/{id}/preview")
async def preview_rich_menu(
    id: int,
    db: AsyncSession = Depends(get_db),
    _current_admin: User = Depends(get_current_admin),
):
    row = await db.get(RichMenu, id)
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบเมนูนี้")
    if row.image_media_id is None:
        return {"placeholder": True, "message": "ยังไม่มีรูปเมนู แสดงโครงร่างตัวอย่างได้ก่อน"}
    return {"placeholder": False, "image_url": f"/api/v1/media/{row.image_media_id}"}
```

```python
# backend/app/tasks/rich_menu_display_scheduler.py — ครอบ loop ของ _activate_due (:51-63)
# และ _expire_due (:82-100) ด้วย per-menu try:
    for menu in due:
        try:
            # ...existing body ของ loop ตามเดิมทุกบรรทัด...
        except Exception as exc:
            await db.rollback()
            logger.error("Display scheduler: menu %s failed, retry next tick: %s", menu.id, exc)
```

(TZ: `display_start_at`/`display_end_at` เป็น timestamptz + scheduler เทียบ UTC อยู่แล้ว :107 — ฝั่ง UI แปลง Asia/Bangkok ตอนแสดง)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_richmenu_preview_sched.py tests/test_rich_menu_display_schedule.py tests/test_rich_menu_display_scheduler_db.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/rich_menus.py backend/app/tasks/rich_menu_display_scheduler.py backend/tests/test_richmenu_preview_sched.py
git commit -m "fix(rich-menu): imageless preview with isolated scheduler"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_rich_menu_schema.py tests/test_rich_menu_size.py -v`
Expected: PASS

### Task C8: Live-chat runtime — ghost-push guard + presence throttle (PRD stories 18–19)

**Files:**
- Modify: `backend/app/services/live_chat_service/messaging.py`
- Modify: `backend/app/core/websocket_manager.py`
- Test: `backend/tests/test_livechat_ghost_presence.py`

**Interfaces (verified):**
- Consumes: `send_message` ปัจจุบัน persist ก่อนแล้ว push โดยกลืน exception (messaging.py:24-67 — save :38-48, push :52-55 ไม่ re-check เจ้าของ); `_require_active_session_owner` (sessions.py:136-154) ตรวจครั้งเดียวก่อน persist; `touch_presence` เขียน Redis zadd+expire ทุก heartbeat (websocket_manager.py:580-595) ถูกเรียกทุก ping (ws_live_chat.py:173); `redis_client.set(key, value, seconds, nx=True)` คืน True/False/None (redis_client.py:86-101)
- Produces: ownership re-check แบบ conditional UPDATE ก่อน push + `payload["delivery_status"]` = `sent`/`failed`/`skipped_not_owner`; `PRESENCE_THROTTLE_SECONDS = 30` + SET NX EX marker ใน `touch_presence`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_livechat_ghost_presence.py
import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.websocket_manager import ws_manager
from app.models.chat_session import ChatSession, SessionStatus
from app.models.user import User, UserRole
from app.services.friend_service import friend_service


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def live_session():
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    line_id = "Ughostpush00000000000001"
    async with Session() as db:
        op = User(username="t-ghost-op", role=UserRole.AGENT, is_active=True)
        db.add(op)
        await db.flush()
        citizen = await friend_service.get_or_create_user(line_id, db, commit=False)
        sess = ChatSession(user_id=citizen.id, status=SessionStatus.ACTIVE.value, operator_id=op.id)
        db.add(sess)
        await db.commit()
        ids = {"line": line_id, "op": op.id, "citizen": citizen.id, "session": sess.id}
    yield Session, ids
    async with Session() as db:
        for row in [
            await db.get(ChatSession, ids["session"]),
            await db.get(User, ids["citizen"]),
            await db.get(User, ids["op"]),
        ]:
            if row:
                await db.delete(row)
        await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_push_after_transfer_blocked(live_session, monkeypatch):
    from app.services.live_chat_service import live_chat_service

    Session, ids = live_session
    pushed = []
    import app.services.live_chat_service.messaging as messaging_module

    async def _fake_push(line_user_id, messages):
        pushed.append(line_user_id)

    monkeypatch.setattr(messaging_module.line_service, "push_messages", _fake_push)
    async with Session() as db:
        other = User(username="t-ghost-op2", role=UserRole.AGENT, is_active=True)
        db.add(other)
        await db.flush()
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == ids["session"])
            .values(operator_id=other.id)
        )
        await db.commit()
        other_id = other.id
    try:
        async with Session() as db:
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.send_message(ids["line"], "ผี", ids["op"], db)
            assert exc.value.status_code == 409
        assert pushed == []  # ไม่มี ghost push ถึงประชาชน
    finally:
        async with Session() as db:
            await db.delete(await db.get(User, other_id))
            await db.commit()


@pytest.mark.asyncio
async def test_presence_burst_bounded(monkeypatch):
    from app.core.redis_client import redis_client

    real = redis_client._redis
    assert real is not None, "Redis ต้อง online (conftest probe)"

    class _Counting:
        def __init__(self, inner):
            self._inner = inner
            self.zadd_calls = 0

        def __getattr__(self, name):
            return getattr(self._inner, name)

        async def zadd(self, *a, **k):
            self.zadd_calls += 1
            return await self._inner.zadd(*a, **k)

    counting = _Counting(real)
    monkeypatch.setattr(redis_client, "_redis", counting)
    monkeypatch.setattr(ws_manager, "PRESENCE_THROTTLE_SECONDS", 30)
    await redis_client.delete("ws:presence-throttle:7")
    try:
        for _ in range(100):
            await ws_manager.touch_presence("7")
        assert counting.zadd_calls <= 2  # เดิม: 100 ครั้ง
    finally:
        await redis_client.delete("ws:presence-throttle:7")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_livechat_ghost_presence.py -v`
Expected: FAIL — push หลังโอนยังสำเร็จ (ไม่มี 409) และ zadd ถูกเรียก 100 ครั้ง

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/live_chat_service/messaging.py — ใน send_message (:24-67)
# เพิ่ม import: from sqlalchemy import update
#              from app.models.chat_session import ChatSession, SessionStatus
        saved = await line_service.save_message(...)   # เก็บ return (:38-47)
        await db.flush()

        # ghost-push guard: re-check เจ้าของแบบ atomic ก่อนแตะ LINE
        guard = await db.execute(
            update(ChatSession)
            .where(
                ChatSession.id == session.id,
                ChatSession.status == SessionStatus.ACTIVE,
                ChatSession.operator_id == operator_id,
            )
            .values(last_activity_at=datetime.now(timezone.utc))
        )
        if guard.rowcount != 1:
            saved.payload = {"delivery_status": "skipped_not_owner"}
            await db.commit()
            raise HTTPException(status_code=409, detail="เคสนี้ถูกโอนหรือปิดไปแล้ว กรุณารีเฟรช")

        try:
            await line_service.push_messages(line_user_id, [TextMessage(text=text)])
            saved.payload = {"delivery_status": "sent"}
        except Exception as e:
            saved.payload = {"delivery_status": "failed"}
            logger.error(f"LINE push failed after persist for {mask_line_id(line_user_id)}: {e}")
        await db.commit()
```

(pattern เดียวกันใน `send_media_message` :127-153 — guard ก่อน push :142-153, ตั้ง `saved_message.payload["delivery_status"]`)

```python
# backend/app/core/websocket_manager.py
    PRESENCE_THROTTLE_SECONDS = 30  # class attr ข้าง PRESENCE_TIMEOUT_SECONDS (:42)

    async def touch_presence(self, admin_id: str):
        """Refresh admin presence heartbeat (throttled)."""
        if admin_id in self.admin_metadata:
            self.admin_metadata[admin_id]["last_ping"] = datetime.now(timezone.utc)
        if redis_client.is_connected and redis_client._redis:
            try:
                acquired = await redis_client.set(
                    f"ws:presence-throttle:{admin_id}",
                    "1",
                    seconds=self.PRESENCE_THROTTLE_SECONDS,
                    nx=True,
                )
                if acquired is False:
                    return  # ในหน้าต่าง throttle — ข้ามการเขียน Redis
                await redis_client._redis.zadd(
                    self.REDIS_PRESENCE_KEY,
                    {str(admin_id): time.time()},
                )
                await redis_client._redis.expire(
                    f"{self.REDIS_CONNECTION_PREFIX}:{admin_id}:{self.server_id}",
                    self.PRESENCE_TIMEOUT_SECONDS * 2,
                )
            except Exception as e:
                logger.error("Failed to refresh Redis presence: %s", e)
```

(Redis ล่ม → `set` คืน None → ไปต่อถึง zadd และโดน try/except เดิมกลืนไว้ — presence เพี้ยนชั่วคราวไม่พัง; `last_ping` ในหน่วยความจำยังอัปเดตทุกครั้งจับ timeout ได้ตามเดิม)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_livechat_ghost_presence.py tests/test_websocket.py tests/test_websocket_manager_redis.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/live_chat_service/messaging.py backend/app/core/websocket_manager.py backend/tests/test_livechat_ghost_presence.py
git commit -m "fix(live-chat): ghost-push guard with presence throttle"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_multi_operator.py tests/test_session_choreography.py -v`
Expected: PASS

## Wave D — Admin / frontend (ทำท้ายสุด API นิ่งแล้ว)

- `backend/app/api/v1/endpoints/admin_live_chat.py` + `backend/app/api/v1/endpoints/admin_export.py` + `frontend/app/admin/chat-histories/page.tsx` (D1)
- `backend/app/api/v1/endpoints/admin_canned_responses.py` + `backend/app/services/canned_response_service.py` + `frontend/app/admin/canned-responses/page.tsx` (D2)
- `backend/app/api/v1/endpoints/liff.py` (D3 ต่อยอด A1: timeout/ratelimit/drift — ต้องหลัง A1 เท่านั้น)
- `backend/app/api/v1/endpoints/admin_friends.py` + `backend/app/api/v1/endpoints/admin_users.py` + `frontend/app/admin/friends/page.tsx` + `frontend/app/admin/users/page.tsx` (D4)
- `backend/app/api/v1/endpoints/admin_reports.py` + `frontend/app/admin/reports/page.tsx` (D5)
- `frontend/components/ui/Button.tsx` + `frontend/app/globals.css` (D6)
- `backend/app/core/permissions.py` (Modify: D7 — เพิ่ม 2 keys + DEFAULT_POLICY + seed descriptions; `ensure_seed_rows` จะ seed เอง ไม่ต้อง migration) + `backend/app/api/v1/endpoints/admin_credentials.py` + `backend/app/api/v1/endpoints/admin_business_hours.py` (Modify: D7 — gate ด้วย `require_permission`) + `frontend/app/admin/settings/permissions/page.tsx` (D7 — 2 แถวใหม่); หมายเหตุ: ไม่มี `backend/app/api/v1/endpoints/admin_image_resize.py` (image-resize เป็น client-side ล้วน — ดู `frontend/app/admin/image-resize/use-image-resize.ts` — task นี้ verify-only ห้ามสร้าง endpoint ใหม่; ห้ามใช้ `request.session` — FastAPI ไม่มี session middleware, auth เป็น cookie-only ตาม `backend/app/api/deps.py:21-69`)

**Ordering note:** A1 เป็นเจ้าของ `liff.py` ก่อน D3; A2 เป็นเจ้าของ `media.py` ก่อนงาน preview/sync ใดใดใน C/D; B ขนาน A ได้; C เริ่มบน `liff.py`/`media.py` ได้ก็ต่อเมื่อ A merge แล้วเท่านั้น; B1 เป็นเจ้าของ `sessions.py` + `errors.py` + transfer mapping ใน `admin_live_chat.py`/`ws_session/handlers.py` (C8 แตะแค่ `messaging.py` ขนานได้); C8 (ghost-push) ก่อน D1 export-stream ก็ได้ ไฟล์ไม่ชน

### Task D1: Histories limit clamp + export streaming + PDF ฟอนต์ไทย (PRD stories 20–21)

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_live_chat.py` (เฉพาะ `get_conversation_messages` — clamp limit ระดับ endpoint)
- Modify: `backend/app/api/v1/endpoints/admin_export.py` (CSV streaming + PDF ฟอนต์ไทย + RFC 5987 filename)
- Reference (verify-only, ไม่แก้): `frontend/app/admin/chat-histories/[lineUserId]/page.tsx` (ใช้ cursor `before_id` + `limit=50` อยู่แล้ว — :115, :148)
- Test: `backend/tests/test_histories_export.py`

**Interfaces (verified):**
- Consumes: `GET /admin/live-chat/conversations/{line_user_id}/messages` (`before_id` cursor + `limit: int = 50` ไม่มี cap ระดับ endpoint — admin_live_chat.py:125-131; service clamp ภายใน `max(1, min(limit, 100))` อยู่แล้ว — conversations.py:66); `MessagePage(messages, has_more)` (schemas/message.py:50-52); export CSV (:59-96 สร้าง `StringIO` ทั้งก้อน) + PDF (:99-127 ผ่าน `_build_conversation_pdf` ใช้ Helvetica ล้วน ไม่มีฟอนต์ไทย); `_load_conversation` (:40-51 โหลด messages ทั้ง conversation เข้าหน่วยความจำ); header ปัจจุบัน `filename="..."` ธรรมดา (ชื่อไทยถูก sanitize เป็น `_` โดย `_sanitize_filename` :22-25)
- Produces: endpoint clamp `max(1, min(limit, 100))` (clamp-only — **ไม่ใช้ `Query(le=...)`**: ถ้าใส่ `le=100` FastAPI จะตอบ 422 ก่อนถึง clamp ขัดกับ PRD ที่สั่งให้ clamp); CSV streaming แบบ chunk; PDF ลงทะเบียนฟอนต์ไทยเมื่อมี asset; header `filename*=UTF-8''...`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_histories_export.py
import pytest
import pytest_asyncio
from types import SimpleNamespace
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api import deps as api_deps
from app.core.config import settings
from app.main import app
from app.models.message import Message, MessageDirection, SenderRole
from app.models.user import User, UserRole
from app.services.friend_service import friend_service


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest_asyncio.fixture
async def seeded_conversation():
    # identity แบบเดียวกับ B1/C8: get_or_create_user เติม HMAC surrogate เอง
    # (resolve_by_line_id ค้นด้วย hash — user_identity_service.py:81-86)
    from sqlalchemy import select

    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    line_id = "Uhistories00000000000001"
    async with Session() as s:
        citizen = await friend_service.get_or_create_user(line_id, s, commit=False)
        await s.flush()
        for i in range(5):
            s.add(Message(
                user_id=citizen.id,
                direction=MessageDirection.INCOMING,
                message_type="text",
                content=f"ข้อความ {i}",
                sender_role=SenderRole.USER,
            ))
        await s.commit()
        uid = citizen.id
    yield Session, uid, line_id
    async with Session() as s:
        for r in (await s.execute(
            select(Message).where(Message.user_id == uid)
        )).scalars().all():
            await s.delete(r)
        u = await s.get(User, uid)
        if u:
            await s.delete(u)
        await s.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_messages_limit_clamped(test_client, seeded_conversation):
    Session, uid, line_id = seeded_conversation

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get(
            f"/api/v1/admin/live-chat/conversations/{line_id}/messages?limit=9999"
        )
        assert resp.status_code == 200
        assert len(resp.json()["messages"]) <= 100
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_csv_export_streams_with_rfc5987_filename(test_client, seeded_conversation):
    Session, uid, line_id = seeded_conversation

    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get(f"/api/v1/admin/export/conversations/{line_id}/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert "filename*=" in resp.headers["content-disposition"]
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_histories_export.py -v`
Expected: FAIL — `limit=9999` ไม่ถูก clamp ระดับ endpoint (service clamp ภายในอย่างเดียว), CSV คืน header `filename="..."` ธรรมดา

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/admin_live_chat.py — ใน get_conversation_messages (:125-131)
async def get_conversation_messages(
    line_user_id: str,
    before_id: Optional[int] = None,
    limit: int = 50,
    ...
) -> Any:
    limit = max(1, min(limit, 100))  # clamp-only ตรงนี้ (service :66 มีอยู่แล้ว — ทำให้เป็น contract ระดับ endpoint)
```

```python
# backend/app/api/v1/endpoints/admin_export.py
import logging
from fastapi.responses import StreamingResponse
from urllib.parse import quote

logger = logging.getLogger(__name__)
_EXPORT_CHUNK = 500


def _content_disposition(filename: str) -> str:
    # RFC 5987: ชื่อไฟล์ไทยต้อง encode — ห้ามใช้ filename="..." เปล่าเปล่า
    return f"attachment; filename*=UTF-8''{quote(filename)}"


async def _iter_csv_rows(line_user_id: str, db: AsyncSession):
    # streaming ทีละ chunk — ไม่โหลดทั้ง conversation แบบ _load_conversation (:40-51) อีก
    user = await resolve_by_line_id(db, line_user_id)
    last_id = 0
    yield "timestamp,line_user_id,direction,sender,message_type,content\n"
    while True:
        rows = (await db.execute(
            select(Message)
            .where(child_filter(Message, line_user_id, user.id if user else None))
            .where(Message.id > last_id)
            .order_by(Message.id.asc())
            .limit(_EXPORT_CHUNK)
        )).scalars().all()
        if not rows:
            return
        for m in rows:
            # คอลัมน์เดียวกับ writer ปัจจุบัน (:73-86) — เปลี่ยนเป็น yield ทีละแถว
            # (csv/io import อยู่แล้วที่ top ของ admin_export.py)
            buf = io.StringIO()
            csv.writer(buf).writerow([
                m.created_at.isoformat() if m.created_at else "",
                line_user_id,
                m.direction.value if hasattr(m.direction, "value") else m.direction,
                m.sender_role.value if hasattr(m.sender_role, "value") else (m.sender_role or ""),
                m.message_type or "",
                m.content or "",
            ])
            yield buf.getvalue()
        last_id = rows[-1].id


@router.get("/conversations/{line_user_id}/csv")
async def export_conversation_csv(...):  # signature เดิม :60-64
    ...
    return StreamingResponse(
        _iter_csv_rows(line_user_id, db),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )
```

PDF ฟอนต์ไทย — ใน `_build_conversation_pdf` เพิ่ม helper (ใช้ `reportlab.pdfbase.ttfonts.TTFont`):

```python
def _thai_font_name() -> str:
    """คืนชื่อฟอนต์ไทยถ้ามี asset — ไม่มีให้ fallback Helvetica (test ข้าม assert ไทย)."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    for path in (
        "backend/assets/fonts/NotoSansThai-Regular.ttf",
        "/usr/share/fonts/NotoSansThai-Regular.ttf",
    ):
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont("Thai", path))
            return "Thai"
    return "Helvetica"
```

(วางไฟล์ `NotoSansThai-Regular.ttf` ใต้ `backend/assets/fonts/` ใน task นี้; ทุก `setFont("Helvetica", ...)` ใน builder เปลี่ยนเป็น `setFont(_thai_font_name(), ...)`)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_histories_export.py tests/test_websocket.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_live_chat.py backend/app/api/v1/endpoints/admin_export.py backend/assets/fonts/NotoSansThai-Regular.ttf backend/tests/test_histories_export.py
git commit -m "fix(histories): clamp message limit with streaming thai export"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_session_choreography.py tests/test_websocket.py -v`
Expected: PASS — เส้นทาง messages/export เดิมไม่พัง

### Task D2: Canned normalize + 409 + optimistic concurrency (PRD stories 22–23)

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_canned_responses.py`
- Modify: `backend/app/services/canned_response_service.py`
- Modify: `frontend/app/admin/canned-responses/page.tsx` (แสดง 409 พร้อมชื่อรายการที่ชน — ข้อความไทย)
- Test: `backend/tests/test_canned_dup_guard.py`

**Interfaces (verified):**
- Consumes: `CannedResponse(shortcut unique, title, content, category, usage_count, created_by, created_at/updated_at)` (models/canned_response.py:9-18); `POST ""` ตรวจ shortcut ซ้ำ → 409 อยู่แล้ว (:52-74) แต่**ไม่ตรวจ content ซ้ำ**; `PUT /{response_id}` (:76-100) — body ว่าง → 400 อยู่แล้ว แต่**ไม่มี version guard**; `CannedResponseCreate/Update` นิยามในไฟล์ endpoint เอง (:15-24 — Update ไม่มี `updated_at`); `service.create` normalize แค่ shortcut (:103-110); `service.update` setattr ตรง ๆ (:112-124)
- Produces: `normalize_text(s)` (trim + collapse space + casefold) ตรวจ content ซ้ำ → 409 พร้อมชื่อรายการที่ชน; `CannedResponseUpdate.updated_at: Optional[datetime]` + เทียบก่อนเขียน → ชนได้ 409

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_canned_dup_guard.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_duplicate_normalized_content_rejected(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        r1 = test_client.post(
            "/api/v1/admin/canned-responses",
            json={"shortcut": "dup-a", "title": "ทักทาย", "content": "สวัสดีค่ะ"},
        )
        assert r1.status_code == 200
        dup = test_client.post(
            "/api/v1/admin/canned-responses",
            json={"shortcut": "dup-b", "title": "ทักทาย2", "content": "  สวัสดีค่ะ  "},
        )
        assert dup.status_code == 409
        assert "ทักทาย" in dup.text  # บอกชื่อรายการที่ชน (PRD story 22)
    finally:
        # cleanup: dup-b ไม่ถูกสร้าง (409) — ลบแค่ dup-a ผ่าน DELETE /{id}
        try:
            rid = r1.json()["id"]
            test_client.delete(f"/api/v1/admin/canned-responses/{rid}")
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stale_updated_at_rejected(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        r1 = test_client.post(
            "/api/v1/admin/canned-responses",
            json={"shortcut": "dup-c", "title": "นัดหมาย", "content": "นัดหมายล่วงหน้า"},
        )
        rid = r1.json()["id"]
        stale = test_client.put(
            f"/api/v1/admin/canned-responses/{rid}",
            json={"content": "แก้ทับ", "updated_at": "2000-01-01T00:00:00+00:00"},
        )
        assert stale.status_code == 409
    finally:
        try:
            test_client.delete(f"/api/v1/admin/canned-responses/{r1.json()['id']}")
        finally:
            app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_canned_dup_guard.py -v`
Expected: FAIL — content ซ้ำต่างกันแค่ space ได้ 200 (ตรวจแค่ shortcut)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/canned_response_service.py
import logging
import re

logger = logging.getLogger(__name__)


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip()).casefold()
```

```python
# backend/app/api/v1/endpoints/admin_canned_responses.py — ใน create_canned_response (:52-74) หลังเช็ก shortcut:
    norm = normalize_text(data.content)
    for r in await canned_response_service.get_all(db):
        if normalize_text(r.content or "") == norm:
            raise HTTPException(
                status_code=409,
                detail=f"ข้อความซ้ำกับรายการ {r.title} กรุณาใช้รายการเดิม",
            )
```

```python
# CannedResponseUpdate (:20-24) เพิ่ม field:
    updated_at: Optional[datetime] = None  # ส่งกลับมาที่อ่านได้ล่าสุด — ใช้กันเขียนทับ

# ใน update_canned_response (:76-100) ก่อนเรียก service.update:
    if data.updated_at is not None:
        current = await canned_response_service.get_by_id(response_id, db)
        if current and current.updated_at and current.updated_at != data.updated_at:
            raise HTTPException(
                status_code=409,
                detail="มีคนแก้ข้อความนี้ไปก่อนแล้ว กรุณารีเฟรช",
            )
    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("updated_at", None)  # ใช้กันชนอย่างเดียว — ห้ามเขียนทับ timestamp จริง
```

(`from datetime import datetime` เพิ่มใน import ของไฟล์ endpoint; frontend แสดง `detail` ภาษาไทยตรง ๆ)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_canned_dup_guard.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_canned_responses.py backend/app/services/canned_response_service.py frontend/app/admin/canned-responses/page.tsx backend/tests/test_canned_dup_guard.py
git commit -m "fix(canned): normalize duplicates with 409 and version guard"
```

- [ ] **Step 6: Validation**

Run: `npm run test:unit -- canned` (workdir `frontend/`) + `npm run lint` (workdir `frontend/`)
Expected: PASS

### Task D3: LIFF verify timeout + retry + 502 (ต่อยอด A1 — ต้องหลัง A1 เท่านั้น) (PRD stories 24–25)

**Files:**
- Modify: `backend/app/api/v1/endpoints/liff.py` (เฉพาะ `verify_liff_token` — เติม timeout/retry/502)
- Test: `backend/tests/test_liff_hardening.py`

**Interfaces (verified):**
- Consumes: `verify_liff_token(id_token: str) -> str` (liff.py:31-52) — เปิด `httpx.AsyncClient()` เปล่าเปล่า (:37) **ไม่มี timeout**; network error ไม่ถูก catch (หลุดเป็น 500); 3 POSTs (`/media` :59, `/service-requests` :118, `/debt-mediation` :250) มี `http_rate_limit` อยู่แล้ว (:65, :127, :259); `require_liff_identity` จาก A1 อยู่ในไฟล์เดียวกัน
- ขอบเขตที่ตัดทิ้งอย่าง explicit: `liff.py` **ไม่มี** route GET/PATCH (grep `@router.get|patch|put` ได้ค่าว่าง) — งาน "GET rate-limit + PATCH None → 422" จึงไม่มีเป้าในไฟล์นี้; rate-limit ของ POST คงไว้แบบ verify-only; ส่วน PATCH-None อยู่ใน C6 (booking) และ D2 (canned) แล้ว
- Produces: `httpx.Timeout(connect=3.0, read=5.0)` + retry 1 ครั้งเฉพาะ timeout; timeout/network error → 502 ข้อความไทย (พฤติกรรม 401/503 เดิมคงไว้)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_liff_hardening.py
import httpx
import pytest

from app.api.v1.endpoints import liff as liff_module


@pytest.mark.asyncio
async def test_verify_timeout_maps_502(test_client, monkeypatch):
    class _SlowClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise httpx.ConnectTimeout("slow")

    monkeypatch.setattr(liff_module.httpx, "AsyncClient", _SlowClient)
    resp = test_client.post(
        "/api/v1/liff/service-requests",
        headers={"x-liff-id-token": "opaque"},
        json={
            "prefix": "นาย", "firstname": "ทดสอบ", "lastname": "ระบบ",
            "phone_number": "0812345678", "topic_category": "ถนน",
            "description": "pytest-liff-timeout",
            "line_user_id": "Uunverified000000000000000",
        },
    )
    assert resp.status_code == 502
    assert "ลองใหม่" in resp.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_liff_hardening.py -v`
Expected: FAIL — timeout หลุดเป็น 500 (ไม่มี except) แทน 502

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/liff.py — แทน verify_liff_token (:31-52)
async def verify_liff_token(id_token: str) -> str:
    """Verify a LIFF ID token with LINE and return the LINE user ID (sub)."""
    if not settings.LINE_LOGIN_CHANNEL_ID.strip():
        logger.error("LINE_LOGIN_CHANNEL_ID is not configured; cannot verify LIFF ID token")
        raise HTTPException(status_code=503, detail="LIFF verification unavailable: server misconfiguration")

    timeout = httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                resp = await client.post(
                    "https://api.line.me/oauth2/v2.1/verify",
                    data={"id_token": id_token, "client_id": settings.LINE_LOGIN_CHANNEL_ID},
                )
            except httpx.TimeoutException:
                logger.warning("liff verify timeout, retrying once")
                resp = await client.post(
                    "https://api.line.me/oauth2/v2.1/verify",
                    data={"id_token": id_token, "client_id": settings.LINE_LOGIN_CHANNEL_ID},
                )
    except (httpx.TimeoutException, httpx.HTTPError):
        logger.exception("liff verify network failure")
        raise HTTPException(status_code=502, detail="ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาลองใหม่")
    if resp.status_code != 200:
        logger.warning("LIFF token verification failed: %s", resp.text)
        raise HTTPException(status_code=401, detail="Invalid LIFF ID token")
    payload = resp.json()
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="LIFF token missing sub claim")
    return sub
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_liff_hardening.py tests/test_liff_token.py tests/test_liff_media_upload.py tests/test_liff_debt_mediation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/liff.py backend/tests/test_liff_hardening.py
git commit -m "fix(liff): verify timeout with single retry and 502 mapping"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_service_request_liff_validation.py tests/test_http_rate_limit.py -v`
Expected: PASS — schema/drift เดิม + rate-limit ของ 3 POSTs ไม่พัง

### Task D4: Friends limit cap + PII masking ตาม role (PRD stories 36–37)

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_friends.py` (cap limit + mask `line_user_id`)
- Modify: `backend/app/api/v1/endpoints/admin_users.py` (mask `line_user_id` ใน list — `UserOut` ไม่มี password/token อยู่แล้ว :26-38)
- Modify: `frontend/app/admin/friends/page.tsx` + `frontend/app/admin/users/page.tsx` (รองรับค่าที่ถูก mask — แสดงตามที่ API ส่งมา ห้ามเดาเลขเต็ม)
- Test: `backend/tests/test_pii_masking.py`

**Interfaces (verified):**
- Consumes: `GET /admin/friends` (`limit: int = 100` **ไม่มี cap บน** — admin_friends.py:22-31; คืน decrypted raw LINE ID ให้ทุก admin — :56-64); `GET /admin/users` (`per_page = Query(20, ge=1, le=100)` มี cap แล้ว — admin_users.py:161-167); `escape_ilike` precedent (app/core/query_utils.py:4, ใช้ที่ admin_users.py:181); `FriendEventType` รวมศูนย์อยู่แล้ว (friend_event.py:8-14 — ไม่ต้องสร้างใหม่)
- Produces: `mask_line_id(v, role)` / `mask_phone(v, role)` ใน `admin_friends.py` (D5 import ต่อ); friends `limit = Query(100, ge=1, le=100)` ตรงกับ users; role ที่เห็นเต็มได้ = SUPER_ADMIN/ADMIN เท่านั้น

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_pii_masking.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.api.v1.endpoints.admin_friends import mask_line_id, mask_phone
from app.main import app
from app.models.user import UserRole


def test_mask_helpers_by_role():
    assert mask_line_id("U1234567890abcdef", "AGENT") != "U1234567890abcdef"
    assert "***" in mask_line_id("U1234567890abcdef", "AGENT")
    assert mask_line_id("U1234567890abcdef", "ADMIN") == "U1234567890abcdef"
    assert mask_line_id("U1234567890abcdef", "SUPER_ADMIN") == "U1234567890abcdef"
    assert mask_phone("0812345678", "AGENT") != "0812345678"
    assert mask_phone(None, "AGENT") is None


@pytest.mark.asyncio
async def test_friends_limit_capped(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get("/api/v1/admin/friends?limit=9999")
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_pii_masking.py -v`
Expected: FAIL — ไม่มี `mask_line_id` (ImportError) และ `limit=9999` ได้ 200

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/admin_friends.py
def mask_line_id(v: str | None, role: str) -> str | None:
    if not v:
        return v
    if role in ("SUPER_ADMIN", "ADMIN"):
        return v
    return v[:3] + "***" + v[-2:] if len(v) > 5 else "***"


def mask_phone(v: str | None, role: str) -> str | None:
    if not v:
        return v
    if role in ("SUPER_ADMIN", "ADMIN"):
        return v
    return v[:3] + "****" + v[-2:] if len(v) > 5 else "***"
```

```python
# list_friends (:22-31): limit → limit: int = Query(100, ge=1, le=100)
# (ตรงกับ users per_page le=100 — admin_users.py:167)
# จุดใส่ raw id (:56-64) เปลี่ยนเป็น:
        data["line_user_id"] = mask_line_id(raw_id, current_admin.role.value)
```

```python
# backend/app/api/v1/endpoints/admin_users.py — ใน list_users หลังได้ users page:
# mask line_user_id ต่อ row ด้วย mask_line_id (import จาก admin_friends — ห้ามเขียนซ้ำ)
    from app.api.v1.endpoints.admin_friends import mask_line_id
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_pii_masking.py tests/test_friend_service.py tests/test_admin_users.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_friends.py backend/app/api/v1/endpoints/admin_users.py frontend/app/admin/friends/page.tsx frontend/app/admin/users/page.tsx backend/tests/test_pii_masking.py
git commit -m "fix(pii): cap friends limit with role-based masking"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_module_permission_endpoints.py tests/test_deps_gates.py -v`
Expected: PASS

### Task D5: Reports CSV PII masking + PDF param alignment (PRD story 39)

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_reports.py` (mask LINE ID ใน CSV + PDF รับช่วงวันที่)
- Reference (verify-only): `frontend/app/admin/reports/page.tsx` (ส่ง `report_type/start_date/end_date` อยู่แล้ว — downloadPDF :183-189)
- Test: `backend/tests/test_reports_guard.py`

**Interfaces (verified):**
- Consumes: `GET /export` (`type` pattern CSV — :157-166) — branch `messages`/`followers` เขียน decrypted raw LINE ID ลง CSV ตรง ๆ (`line_ids.get(r.user_id, "")` — :197 และ :223) ไม่ mask ตาม role; `GET /export/pdf` รับแค่ `report_type + period: int = 30` (:234-242) **ไม่สนใจ `start_date/end_date` ที่ frontend ส่งมา** (:183-189) — เลือกช่วงวันที่แล้ว PDF ใช้ window 30 วันล่าสุดเงียบ ๆ; ทั้งสอง gate `require_permission(KEY_EXPORT_CHAT)`
- Produces: `_csv_line_id(raw, role)` wrapper เหนือ `mask_line_id` จาก D4 (import ตรง ห้ามเขียนซ้ำ); PDF รับ `start_date/end_date` optional — ส่งมาใช้ช่วงนั้น ไม่ส่งใช้ `period` เหมือนเดิม

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_reports_guard.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.api.v1.endpoints.admin_reports import _csv_line_id
from app.main import app
from app.models.user import UserRole


def test_csv_line_id_masked_by_role():
    assert _csv_line_id("U1234567890abcdef", "AGENT") != "U1234567890abcdef"
    assert _csv_line_id("U1234567890abcdef", "ADMIN") == "U1234567890abcdef"


@pytest.mark.asyncio
async def test_bad_export_type_422(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        r1 = test_client.get("/api/v1/admin/reports/export?type=diagonal")
        assert r1.status_code == 422
        r2 = test_client.get("/api/v1/admin/reports/export/pdf?report_type=diagonal")
        assert r2.status_code == 422
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_reports_guard.py -v`
Expected: FAIL — ไม่มี `_csv_line_id` (ImportError)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/api/v1/endpoints/admin_reports.py
from app.api.v1.endpoints.admin_friends import mask_line_id  # D4 — ห้ามเขียนซ้ำ


def _csv_line_id(raw: str, role: str) -> str:
    return mask_line_id(raw, role) or ""
```

```python
# ใน export_report — ทุกจุดที่เขียน line id ลง CSV (:197 messages branch, :223 followers branch):
#   line_ids.get(r.user_id, "")  →  _csv_line_id(line_ids.get(r.user_id, ""), current_admin.role.value)
```

```python
# export_report_pdf (:234-242) เพิ่ม params:
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
# แทน window เดิม:
    if start_date or end_date:
        start, end = parse_dates(start_date, end_date)  # import อยู่แล้วจาก report_service (:21)
    else:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=period)
        start, end = start_dt, end_dt
    start_iso, end_iso = start.isoformat(), end.isoformat()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_reports_guard.py tests/test_admin_reports_helpers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_reports.py backend/tests/test_reports_guard.py
git commit -m "fix(reports): mask line ids in csv with aligned pdf dates"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_admin_reports_helpers.py -v`
Expected: PASS

### Task D6: Button variant test + token centralization check (PRD story 40)

**Files:**
- Modify: `frontend/components/ui/Button.tsx` (เฉพาะจุดที่ยัง hardcode — ถ้าไม่มีให้ verify-only)
- Modify: `frontend/app/globals.css` (เติม token ที่ขาด — ถ้าครบให้ verify-only)
- Test: `frontend/components/ui/__tests__/button.test.tsx` (ยังไม่มีไฟล์นี้)

**Interfaces (verified):**
- Consumes: `Button`/`buttonVariants` ใช้ `cva` อยู่แล้ว (Button.tsx:180-181 export ทั้งคู่); variants `primary/secondary/outline/ghost/soft/danger/success/warning` อ้าง token classes (`from-brand-500`, `from-danger`, `from-success` — ไม่มี hex hardcode ใน class strings); `defaultVariants: {variant: 'primary', size: 'md'}`; tokens กลางใน `frontend/app/globals.css` (`--color-brand-50…900` :8-16, `--color-danger/danger-light/danger-dark` :35-37)
- Produces: unit test ล็อก `default → primary` + `danger → danger token` (กัน regression แบบ opt-in — ห้ามเปลี่ยน global class ทีเดียว); ถ้าพบ hex hardcode ใน Button ให้ย้ายเข้า token

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/ui/__tests__/button.test.tsx
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "../Button";

test("default renders primary variant", () => {
  render(<Button>ตกลง</Button>);
  const btn = screen.getByRole("button", { name: "ตกลง" });
  expect(btn.className).toMatch(/from-brand-500/);
});

test("danger variant uses danger token, not hardcoded color", () => {
  render(<Button variant="danger">ลบ</Button>);
  const btn = screen.getByRole("button", { name: "ลบ" });
  expect(btn.className).toMatch(/from-danger/);
  expect(buttonVariants({ variant: "danger" })).not.toMatch(/#[0-9a-fA-F]{3,6}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- button` (workdir `frontend/`)
Expected: FAIL — ไม่มีไฟล์ test (suite not found) หรือ variant ไม่ตรง token

- [ ] **Step 3: Write minimal implementation**

```tsx
// เปลี่ยนเฉพาะจุดที่ test จับได้ — ตัวอย่างถ้า danger ยัง hardcode:
//   danger: ['bg-[#dc2626]', ...]  →  danger: ['bg-gradient-to-br from-danger to-danger-dark', ...]
// (ปัจจุบันใช้ token อยู่แล้ว — ถ้า test เขียวตั้งแต่รอบแรก ขั้นนี้คือ verify-only + บันทึกผลไว้ใน PR)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- button` (workdir `frontend/`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/Button.tsx frontend/app/globals.css frontend/components/ui/__tests__/button.test.tsx
git commit -m "fix(ui): lock button variants to centralized tokens"
```

- [ ] **Step 6: Validation**

Run: `npm run lint` (workdir `frontend/`)
Expected: PASS — ไม่มี type/lint error

### Task D7: Credentials/business-hours permission keys (PRD story 41) + image-resize verify-only (PRD story 38)

**Files:**
- Modify: `backend/app/core/permissions.py` (2 keys + DEFAULT_POLICY + descriptions + registry — `ensure_seed_rows` seed เอง ไม่ต้อง migration)
- Modify: `backend/app/api/v1/endpoints/admin_credentials.py` (gate ด้วย `require_permission`)
- Modify: `backend/app/api/v1/endpoints/admin_business_hours.py` (PUT gate ด้วย `require_permission`)
- Reference (verify-only, ห้ามสร้าง endpoint): image-resize เป็น client-side ล้วน (`frontend/app/admin/image-resize/use-image-resize.ts` — canvas ใน browser, ไม่มี backend route)
- Reference (verify-only): `frontend/app/admin/settings/permissions/page.tsx` (matrix render จาก API อัตโนมัติ — 2 แถวใหม่โผล่เองพร้อม label ไทย)
- Test: `backend/tests/test_new_permission_keys.py`

**Interfaces (verified):**
- Consumes: `KEY_*` constants (permissions.py:42-76) + `DEFAULT_POLICY: dict[str, frozenset[UserRole]]` (:80 — **type นี้เท่านั้น ห้าม assign list**); entries ตัวอย่าง `KEY_IMAGE_RESIZE: frozenset({SUPER_ADMIN, ADMIN})` (:123); `_SEED_DESCRIPTIONS` (:213) + `ensure_seed_rows` (:241); `PERMISSION_REGISTRY` (`PermissionMeta(key, module, level, label_th)` — :415-440); `GET /api/v1/admin/settings/permissions` (settings router prefix `/admin/settings` — api.py:51; gate `get_current_admin` — settings.py:118-122); business-hours `PUT ""` gate `get_current_admin` อยู่ (admin_business_hours.py:57-62 — ยังไม่ผูก key ใหม่); credentials endpoints ผสม `get_current_admin`/`require_permission(KEY_EDIT_SYSTEM_SETTINGS)` (admin_credentials.py:28, 47, 77, 99, 116)
- Produces: `KEY_MANAGE_CREDENTIALS = "manage_credentials"` + `KEY_EDIT_BUSINESS_HOURS = "edit_business_hours"` ครบทั้ง 4 จุด (constants, DEFAULT_POLICY, descriptions, registry)
- ขอบเขตที่ตัดทิ้งอย่าง explicit: **ไม่มี test HTTP ใดยิง `/api/v1/image-resize`** — route นี้ไม่มีอยู่จริง (มีแต่ไฟล์ frontend) test แบบนั้นได้ 404 ตลอดและไม่พิสูจน์อะไร; verify-only = ยืนยันว่าไม่มี `admin_image_resize.py` ใน endpoints + use-image-resize ไม่เรียก backend

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_new_permission_keys.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_matrix_has_new_keys(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get("/api/v1/admin/settings/permissions")
        assert resp.status_code == 200
        assert "manage_credentials" in resp.text
        assert "edit_business_hours" in resp.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_business_hours_put_requires_new_key(test_client):
    async def _override():
        yield SimpleNamespace(id=2, role=UserRole.AGENT, is_active=True)

    # body ครบ 7 วันตาม BusinessHoursUpdate (schemas/business_hours.py:51-52)
    # เพื่อให้ gate (403) เป็นตัวตอบ ไม่ใช่ body validation (422)
    valid_days = [
        {"day_of_week": i, "is_open": False, "open_time": "08:00", "close_time": "17:00"}
        for i in range(7)
    ]
    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.put(
            "/api/v1/admin/settings/business-hours",
            json={"days": valid_days},
        )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_new_permission_keys.py -v`
Expected: FAIL — matrix ไม่มี 2 keys ใหม่ และ PUT เป็น AGENT อาจผ่าน gate เดิม

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/core/permissions.py
KEY_MANAGE_CREDENTIALS = "manage_credentials"  # ต่อท้าย KEY_EDIT_SYSTEM_SETTINGS (:60)
KEY_EDIT_BUSINESS_HOURS = "edit_business_hours"

# DEFAULT_POLICY (:80) — frozenset เท่านั้น (type คือ dict[str, frozenset[UserRole]]):
    KEY_MANAGE_CREDENTIALS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_EDIT_BUSINESS_HOURS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),

# _SEED_DESCRIPTIONS (:213):
    KEY_MANAGE_CREDENTIALS: "จัดการรหัสเชื่อมต่อ (credentials/integrations)",
    KEY_EDIT_BUSINESS_HOURS: "แก้เวลาทำการ (business hours)",

# PERMISSION_REGISTRY — กลุ่ม system ต่อจาก KEY_IMAGE_RESIZE:
    PermissionMeta(KEY_MANAGE_CREDENTIALS, "system", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_CREDENTIALS]),
    PermissionMeta(KEY_EDIT_BUSINESS_HOURS, "system", LEVEL_EDIT, _SEED_DESCRIPTIONS[KEY_EDIT_BUSINESS_HOURS]),
```

```python
# backend/app/api/v1/endpoints/admin_business_hours.py — PUT (:57-62):
    admin: User = Depends(require_permission(KEY_EDIT_BUSINESS_HOURS)),
# (GET คง get_current_staff — อ่านได้ทุก staff; เพิ่ม import require_permission +
# KEY_EDIT_BUSINESS_HOURS — ไฟล์นี้ import แค่ get_current_admin/get_current_staff (:13))

# backend/app/api/v1/endpoints/admin_credentials.py — endpoint ที่ยังใช้ get_current_admin
# (:28, :77, :99) เปลี่ยนเป็น require_permission(KEY_MANAGE_CREDENTIALS)
# (จุดที่ใช้ KEY_EDIT_SYSTEM_SETTINGS อยู่แล้วคงไว้)
```

(frontend matrix ดึง registry จาก API — 2 แถวใหม่ + label ไทยโผล่เอง ไม่ต้องแก้ page; `ensure_seed_rows` seed rows ใหม่ตอน startup — ไม่ต้อง migration)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_new_permission_keys.py tests/test_module_permission_endpoints.py tests/test_deps_gates.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/permissions.py backend/app/api/v1/endpoints/admin_credentials.py backend/app/api/v1/endpoints/admin_business_hours.py backend/tests/test_new_permission_keys.py
git commit -m "fix(permissions): credential and business-hours keys with gates"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_module_permission_endpoints.py tests/test_deps_gates.py tests/test_credential_service.py -v`
Expected: PASS




## NOT Building

(สอดคล้องกับ Out of Scope ของ PRD `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`)

- ไม่เปลี่ยน LINE SDK รุ่น / ไม่ย้ายจาก httpx ไปไลบรารีอื่น
- ไม่ redesign หน้า admin ทั้งระบบ (Wave D แก้เฉพาะจุดที่ audit ชี้)
- ไม่ทำ multi-tenant / ไม่แยก DB ตามสาขา
- ไม่เปลี่ยน auth จาก cookie-only กลับเป็น bearer/dual
- ไม่ลบตาราง SystemSetting ทิ้ง (แค่ห้ามเก็บ secret ใหม่ + ย้ายค่าเดิมออก)
- ไม่ทำ full-text search ใหม่ให้ friends / requests (แค่ limit + pagination + enum ให้ตรงกัน)
- ไม่ทำ mobile app แยกจาก LIFF
- ไม่ปรับโครงสร้าง WebSocket protocol ใหม่ทั้งหมด (แก้เฉพาะ lock / ghost push / presence)

## Risks & Mitigations / GOTCHAs

- **LIFF strict mode ปิดฟอร์ม production:** env examples ทุกไฟล์เปลี่ยนเป็น `LIFF_STRICT_MODE=true` (A1) — ผู้ใช้ที่เคยยื่นคำร้องแบบไม่ยืนยันตัวตนจะเริ่มเจอ 401 ทันทีหลัง deploy → frontend ต้องจับ 401 แล้วพาไปยืนยันตัวตนผ่าน LINE ก่อน; เฝ้า log `liff_unverified_attempt` หลัง deploy รอบแรก; rollback ชั่วคราวได้ตามคอมเมนต์ใน env example แต่ต้องนัดถอนกลับ (ห้ามลืม)
- **Secrets migration ทำรหัสหาย:** migration ของ B2 ต้องสำรองค่า plaintext ลงตาราง backup ชั่วคราวก่อนเสมอ แล้วค่อย encrypt → verify (ถอดรหัสเทียบ) → mask; `downgrade` ต้อง restore ค่าเดิมจากตาราง backup กลับเข้า SystemSetting แล้วลบ Credential rows ที่สร้างไว้ (re-encrypt กลับเป็น plaintext จาก backup เท่านั้น ห้ามเดา) และห้าม `DROP TABLE` backup ก่อน verify ว่าครบทุก key; ซ้อม upgrade → downgrade → upgrade ครบใน Step 6 ของ B2
- **Transfer race ตอนโหลดสูง (rowcount=0):** conditional UPDATE ตอบ rowcount=0 ได้ทั้งกรณีถูกแย่งกัน (409) และ session ปิด/หายไปแล้ว (404) — ต้อง re-select แล้วแยกกรณีก่อนตอบตาม B1 Step 3 ห้ามตอบ 409 เฉย ๆ; test ด้วย `asyncio.gather` ให้เห็น winner เดียวเสมอ
- **Redis ลง:** ทุกจุดที่ใช้ `redis_client.get/setex` ต้อง degrade ตามพฤติกรรมเดิม (redis_client.py:103-111) — analytics (C1) คำนวณตรง ๆ + `cache_hit=false`, presence throttle (C8) ต้องมีทาง fallback ไม่ใช้พังทั้ง WebSocket; Redis ลงต้องไม่กลายเป็น 500
- **Alembic head ชนกัน:** B1/B2 ขนานกันได้แต่ห้ามสร้าง migration พร้อมกันโดยไม่เช็ก — ก่อนเริ่ม B2 รัน `python scripts/db_target.py alembic --target local heads` ให้แน่ใจว่ามี head เดียวคือ `t1u2v3w4x5y6` (verified 2026-09-13; `z1a2b3c4d5e6` อยู่กลาง chain — `a2b3c4d5e6f7` revises มันแล้ว — ห้ามใช้เป็น `down_revision`) ถ้าหลาย head ต้อง merge ก่อน แล้วตั้ง `down_revision` จาก head จริง ณ วันรัน
- **CSRF กับ auth แบบ cookie-only:** FastAPI ของ repo นี้ไม่มี `request.session` (ไม่มี session middleware, auth เป็น cookie-only ตาม `backend/app/api/deps.py`) — การเทียบ CSRF token ต้องเป็น double-submit: อ่าน header `x-csrf-token` แล้วเทียบกับ HttpOnly cookie `csrf_token` ด้วย `compare_digest` ตาม pattern ที่ `frontend/lib/csrfStore.ts` ใช้อยู่ (frontend เก็บ token จาก cookie ใน store แล้ว echo กลับผ่าน header และ field `csrf_token` ใน body)

## Before / After (UX)

- **Wave A:** ประชาชนต้องยืนยันตัวตนผ่าน LINE ก่อนยื่นคำร้อง/อัปโหลดไฟล์เสมอ (เดิมยื่นได้โดยไม่มีตัวตน), ลิงก์ไฟล์ private ที่ไม่มี token ที่ถูกต้องเปิดไม่ได้, หน้า health แบบละเอียดคนนอกระบบเรียกไม่ได้และไม่เห็น error ดิบ
- **Wave B:** เจ้าหน้าที่โอนสายชนกันจะเห็นข้อความไทยว่า "เจ้าหน้าที่อีกคนรับเคสนี้ไปแล้ว" แทนที่เคสจะถูกแย่งเงียบ ๆ; ส่วน secrets — N/A — internal change (ผู้ใช้เห็นแค่คำเตือน "ค่านี้ย้ายไป Credentials แล้ว ห้ามกรอกที่นี่" ในหน้า settings)
- **Wave C:** แดชบอร์ดสถิติเปิดเร็วขึ้นชัดเจน, broadcast มีปุ่มทดลองส่ง (dry-run) ก่อนส่งจริง, พรีวิว rich menu ที่ยังไม่มีรูปเห็น placeholder แทน 403, bot ไม่ค้างจาก pattern พิษ — ส่วนที่เหลือของ Wave นี้ N/A — internal change
- **Wave D:** เปิดเคสเก่า/ส่งออกไฟล์ใหญ่ได้โดยไม่ค้าง, สร้าง shortcut ซ้ำได้ 409 ที่อ่านรู้เรื่อง, รายงาน CSV ไม่มี PII ดิบ, ปุ่ม/สีใหม่เป็น opt-in — ส่วนที่เหลือ N/A — internal change

## Edge-Case Checklist

- [ ] ตารางว่างในช่วง `days` → `percentile_cont` คืน NULL → fallback `p50 or 0` ตอบ 0.0 ไม่ 500 (C1)
- [ ] `limit=0` / ค่าติดลบ → clamp/cap เข้าช่วงก่อน query (D1 messages clamp-only, D4 friends `le=100`)
- [ ] LIFF token หมดอายุ / LINE ปฏิเสธ → 401 ข้อความไทย ไม่เขียน DB (A1, D3)
- [ ] PATCH/PUT body ว่าง / ฟิลด์เป็น None ทั้งหมด → 422 ไม่ 500 (C6 booking, D2 canned — `liff.py` ไม่มี PATCH จึงไม่มีเคสนี้ใน D3)
- [ ] โอนสายพร้อมกัน → rowcount=0 → re-select แยก 409 (ถูกแย่ง) กับ 404 (session หาย) (B1)
- [ ] Redis ลงระหว่างเรียก analytics → cache miss → คำนวณตรง ๆ + `cache_hit=false` ไม่ 500 (C1)
- [ ] rich-menu sync ที่ยังไม่มีรูป → ข้ามเมนูนั้นพร้อมเหตุผล ไม่ล้มทั้งชุด (C7)
- [ ] ชื่อไฟล์ส่งออกภาษาไทย → `Content-Disposition` ใช้ `filename*` encode ตาม RFC 5987 ไม่เพี้ยน (D1)

## Self-Review (ตรวจซ้ำ 2026-09-13 หลังลบ stale copy — อ้างเฉพาะข้อความที่เหลืออยู่จริง)

**1. Spec coverage (PRD ข้อ → Task):** C2 stories 1–4 → A1; C3 stories 5–6 → A2; C5 stories 7–8 → A3; C1 stories 9–11 → B1; C4 stories 12–14 → B2; stories 15–16 → C1; story 17 (lock param) → B1 (คง `lock` param + conditional UPDATE); stories 18–19 → C8 (ghost-push guard + presence throttle — `test_push_after_transfer_blocked`, `test_presence_burst_bounded`); story 20 → D1 (endpoint clamp + cursor เดิม); story 21 → D1 (streaming export + Thai font + RFC 5987); stories 22–23 → D2 (normalize 409 + `updated_at` guard); stories 24–25 → D3 (timeout/retry/502 — ไม่มี GET/PATCH ใน `liff.py` จึงไม่มีงาน rate-limit/PATCH-None ในไฟล์นี้); stories 26–27 → C2 (dry-run + backoff); story 28 → C3; story 29 → C4; stories 30–31 → C5; stories 32–33 → C6; stories 34–35 → C7; stories 36–37 → D4; story 38 → D7 (verify-only, ห้ามสร้าง endpoint); story 39 → D5; story 40 → D6 (verify-first, test ล็อก token); story 41 → D7 (2 keys + gates); stories 42–43 → ทุก task (ข้อความไทย + audit ใน C5/B1/D4-D7). Out-of-scope เคารพครบ (ไม่เปลี่ยน SDK/auth/WS protocol ใหม่; ไม่สร้าง `/api/v1/image-resize`).

**2. Single-definition + banned-string scan (ผล grep จริง 2026-09-13):** `grep -o '^### Task [A-D][0-9]*'` → 20 headings, แต่ละ ID ปรากฏครั้งเดียว (A1–A3, B1–B2, C1–C8, D1–D7); pattern ของ stale copy ไม่เหลือแล้ว — ไม่มี test_client ที่ถูก await, ไม่มี fixture DB กลาง, ไม่มี session-middleware access, ไม่มี PUT head จริง (เหลือแค่ prohibition ใน Global Constraints :22 ที่ห้ามไว้); Pydantic เหลือแค่ prohibition note + `model_copy` ที่ B2; `httpx.AsyncClient` ที่เหลืออยู่ใน D3 เท่านั้น (production class ใต้ test — :2288, :2317, :2349); `pytest_asyncio` ปรากฏ 13 จุด (5 import blocks + 5 async fixtures + Global Constraints + D1 import/fixture).

**3. Type consistency (ทุกชื่อมีนิยามในไฟล์นี้ — ผล grep):** `require_liff_identity(x_liff_id_token: Optional[str]) -> str` (A1 นิยาม, D3 reuse); `check_private_token(stored, presented) -> bool` (A2); `TRANSFER_ERR_CONFLICT` (B1: errors.py + export ใน `__init__.py` + map 409; signature `transfer_session` ไม่เปลี่ยน); `SECRET_DENY_LIST: frozenset[str]` (B2 — service + migration + mask ใช้ชื่อเดียวกัน); `DashboardResponse.cache_hit: bool` (C1); `BroadcastCreate.dry_run: bool` + `BroadcastDryRunResponse` (C2); `compile_intent_keyword` + `invalidate_intent_regex_cache` + `_like_safe` (C3); `OBJECT_ID_RE = ^\$[A-Za-z][A-Za-z0-9_]{2,39}$` (C4); `RequestStatus` 6 ค่าเดิม — ห้าม DONE/CANCELLED (C5); `BookingWindowError` + `validate_booking_date` + `MAX_ADVANCE_BOOKING_DAYS = 62` (C6); `preview` route + per-menu try (C7); `normalize_text` (D2); `mask_line_id/mask_phone` นิยามใน D4 (`admin_friends.py`) → D5 ใช้ผ่าน `_csv_line_id` (import ตรง ห้ามเขียนซ้ำ); `buttonVariants` (D6 — test ล็อก primary/danger); `KEY_MANAGE_CREDENTIALS/KEY_EDIT_BUSINESS_HOURS` ครบ 4 จุด (constants, `DEFAULT_POLICY: dict[str, frozenset[UserRole]]`, descriptions, registry — D7). D1 ตัดสินแล้ว: clamp-only ไม่ใช้ `le=` (ใช้ `le` จะได้ 422 ขัด PRD) — test คาด 200 + clamp.

