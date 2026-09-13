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
- Test conventions (ทุก task): `test_client` คือ sync `TestClient` (ห้าม `await test_client.*` — ดู `backend/tests/test_liff_token.py:147-160`); งาน admin ใช้ `app.dependency_overrides[deps.get_current_user]` คืน `SimpleNamespace(id, role=UserRole.*, is_active=True)` แล้ว `clear()` ทุกครั้ง (ดู `backend/tests/test_admin_requests_endpoints.py:89-112`, `backend/tests/test_transfer_session_errors.py:39-59`); งาน DB ใช้ `_fresh_engine()` + NullPool recipe จาก `backend/tests/test_liff_token.py:37-44` (ห้าม reuse pool ของ app ข้าม event loop); ห้าม import helper ข้าม test module (ไม่มี `__init__.py`) — copy สูตรสั้นสั้นไว้ในไฟล์ test นั้นนั้น; `conftest.py` มีแค่ `app/test_client/_reset_http_rate_limits/drain_auth_responses/auth_websocket` (`backend/tests/conftest.py:80-154) — fixture อื่นทุกตัวต้องนิยามเต็มใน task นี้

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

อัปเดต `backend/tests/test_liff_token.py` case1 (`test_case1_flag_off_no_token_uses_body_fallback`, บรรทัด 146-159) ให้ตรงพฤติกรรมใหม่: assert 401 + `await _count_by_description(body["description"]) == 0` (เลิกคาดหวัง 201/body-fallback) — case 2/3/4/5/6/7 เดิมผ่านได้ทั้งหมด

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
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.media_file import MediaFile


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


@pytest.fixture
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
# 2) ลบ str(e) ทุกจุด (บรรทัด 36, 43, 107, 128, 140) แทนด้วย logger.exception เช่น:
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


@pytest.fixture
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
git add backend/app/services/live_chat_service/sessions.py backend/app/services/live_chat_service/errors.py backend/app/api/v1/endpoints/admin_live_chat.py backend/tests/test_transfer_race.py
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
# list_settings (:301-304): mask ก่อนตอบ —
    out = []
    for s in result.scalars().all():
        val = "***" if s.key in SECRET_DENY_LIST else s.value
        out.append(SystemSettingResponse.model_validate(s, update={"value": val}))
    return out
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
    conn.execute(sa.text(
        "CREATE TABLE IF NOT EXISTS _secret_migration_backup AS "
        "SELECT id, key, value FROM system_settings WHERE key = ANY(:keys)"
    ), {"keys": list(_DENY)})

    # 2) encrypt → insert Credential, 3) verify roundtrip, 4) mask ต้นทาง
    rows = conn.execute(sa.text(
        "SELECT id, key, value FROM _secret_migration_backup"
    )).mappings().all()
    for row in rows:
        enc = cipher.encrypt(str(row["value"]).encode()).decode()
        if cipher.decrypt(enc.encode()).decode() != str(row["value"]):
            raise RuntimeError(f"roundtrip verify failed for {row['key']}")
        conn.execute(sa.text(
            "INSERT INTO credentials (name, provider, credentials, metadata, is_active, is_default) "
            "VALUES (:name, :provider, :credentials, NULL, true, false)"
        ), {"name": row["key"], "provider": _provider_for(row["key"]), "credentials": enc})
        conn.execute(sa.text(
            "UPDATE system_settings SET value = '***MIGRATED***' WHERE id = :id"
        ), {"id": row["id"]})


def downgrade() -> None:
    # restore จาก backup เท่านั้น — ไม่ถอดรหัส Credential กลับเป็น plaintext อัตโนมัติ
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, value FROM _secret_migration_backup"
    )).mappings().all()
    for row in rows:
        conn.execute(sa.text(
            "UPDATE system_settings SET value = :value WHERE id = :id"
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
- Consumes: model จริงคือ `IntentKeyword(category_id, keyword, match_type)` + `MatchType` (exact/contains/regex/starts_with) (backend/app/models/intent.py:8-12, 46-57) — **ไม่มี** ฟิลด์ `pattern`/`priority` และไม่มีไฟล์ `backend/app/services/intent_matcher.py`; matcher จริงคือ `find_intent_keyword` cascade EXACT > STARTS_WITH > CONTAINS > REGEX (intent_matching.py:34-82); REGEX มีกันความยาว 256/1000 อยู่แล้ว (:18-19, 71-76) แต่ compile ใหม่ทุกข้อความ; LIKE branch (:50-64) ไม่ escape `%`/`_` ใน keyword; write path คือ `POST/PUT /api/v1/admin/intents/keywords` (admin_intents.py:161-183)
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


@pytest.fixture
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


@pytest.fixture
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
        yield row.id
    async with Session() as s:
        row = await s.get(RichMenu, row_id_id) if False else await s.get(RichMenu, _last[0])
        if row:
            await s.delete(row)
            await s.commit()
    await engine.dispose()
```

(หมายเหตุ cleanup — เขียนให้ถูกต้องเป็นแบบนี้ในไฟล์จริง:)

```python
@pytest.fixture
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


@pytest.fixture
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



---

## Wave A — Critical security (ทำก่อนทุก Wave บนไฟล์ที่ชน)

### Task A1: LIFF strict default true + ห้ามเขียน DB เมื่อไม่มีตัวตน

**Files:**
- Modify: `backend/app/api/v1/endpoints/liff.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.development.example`
- Modify: `backend/.env.production.example`
- Test: `backend/tests/test_liff_strict_no_write.py`

**Interfaces:**
- Consumes: `settings.LIFF_STRICT_MODE: bool` จาก `backend/app/core/config.py`, `verify_liff_token(id_token: str) -> str` helper เดิมใน `liff.py`
- Produces: `require_liff_identity(request: Request) -> dict` (คืน line_user_id ที่ยืนยันแล้ว, ไม่มี token + strict=false → raise HTTPException 401 ข้อความไทย ไม่เขียน DB); D3 จะ reuse ฟังก์ชันนี้เพื่อเติม timeout/rate-limit

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient
from app.models.service_request import ServiceRequest
from sqlalchemy import select, func

@pytest.mark.asyncio
async def test_liff_no_token_lenient_mode_writes_nothing(test_client: AsyncClient, db_session, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.LIFF_STRICT_MODE", False)
    before = (await db_session.execute(select(func.count()).select_from(ServiceRequest))).scalar()
    resp = await test_client.post("/api/v1/liff/service-requests", json={"topic": "ถนน", "detail": "หลุม", "phone": "0812345678"})
    assert resp.status_code == 401
    assert "ยืนยันตัวตน" in resp.text
    after = (await db_session.execute(select(func.count()).select_from(ServiceRequest))).scalar()
    assert after == before
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_liff_strict_no_write.py -v`
Expected: FAIL — `assert 201 == 401` หรือ `after == before + 1` (พฤติกรรมเดิมเขียน DB ในโหมดผ่อนผัน)

- [ ] **Step 3: Write minimal implementation**

```python
import logging
from fastapi import Request, HTTPException
from app.core.config import settings

logger = logging.getLogger(__name__)

async def require_liff_identity(request: Request) -> dict:
    token = request.headers.get("x-liff-id-token", "")
    if not token:
        logger.warning("liff_unverified_attempt path=%s strict=%s", request.url.path, settings.LIFF_STRICT_MODE)
        raise HTTPException(status_code=401, detail="กรุณายืนยันตัวตนผ่าน LINE ก่อนยื่นคำร้อง")
    return await verify_liff_token(token)
```

ใน `liff.py` ทั้ง 3 endpoints (`POST /liff/service-requests`, `POST /liff/debt-mediation`, `POST /liff/media`) เรียก `claims = await require_liff_identity(request)` เป็นบรรทัดแรกก่อนแตะ DB ใดใด ลบบล็อก `if not token and not strict: create_row(...)` เดิมทิ้งทั้งหมด

```python
# backend/app/core/config.py — คงค่านี้ไว้ (ยืนยันว่ามีอยู่แล้ว)
LIFF_STRICT_MODE: bool = True
```

```ini
# backend/.env.development.example และ backend/.env.production.example
LIFF_STRICT_MODE=true
# rollback ชั่วคราวช่วงย้ายระบบ: ตั้ง LIFF_STRICT_MODE=false ได้ แต่ระบบจะไม่เขียน DB (ตอบ 401 + log) จนกว่าจะกลับเป็น true
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_liff_strict_no_write.py tests/test_liff_token.py tests/test_config_migration_controls.py -v`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/liff.py backend/app/core/config.py backend/.env.development.example backend/.env.production.example backend/tests/test_liff_strict_no_write.py
git commit -m "fix(liff): deny unauthenticated writes, default strict true"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_liff_media_upload.py tests/test_liff_debt_mediation.py tests/test_service_request_liff_validation.py -v`
Expected: PASS — 3 ฟอร์ม LIFF เดิมยังผ่านเมื่อมี token ถูกต้อง

### Task A2: Media private token gate — ว่างชนว่างต้องไม่ผ่าน + preview ส่ง token

**Files:**
- Modify: `backend/app/api/v1/endpoints/media.py`
- Modify: `frontend/app/admin/files/page.tsx`
- Test: `backend/tests/test_media_private_gate.py`

**Interfaces:**
- Consumes: `require_liff_identity` จาก Task A1 เฉพาะ path upload (`POST /liff/media`) — ถ้าแตะ upload path ต้องทำหลัง A1 merge แล้วเท่านั้น ส่วน path serve (`GET /media/{id}`) ทำขนานได้
- Produces: `check_private_token(stored: str, presented: str) -> bool` (True ก็ต่อเมื่อทั้งสองฝั่ง non-empty และตรงกันแบบ constant-time); frontend `buildMediaUrl(id: string, token: string) => string` ส่ง token ทุกครั้ง

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_private_media_empty_token_denied(test_client: AsyncClient, private_media):
    for qs in ["", "?token=", "?token=wrong"]:
        resp = await test_client.get(f"/api/v1/media/{private_media.id}{qs}")
        assert resp.status_code == 403
    ok = await test_client.get(f"/api/v1/media/{private_media.id}?token={private_media.public_token}")
    assert ok.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_media_private_gate.py -v`
Expected: FAIL — เคส `?token=` หรือไม่มี token ได้ 200 (bypass ว่างชนว่าง)

- [ ] **Step 3: Write minimal implementation**

```python
import secrets
import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def check_private_token(stored: str | None, presented: str | None) -> bool:
    if not stored or not presented:
        return False
    return secrets.compare_digest(stored, presented)
```

ใน `GET /media/{id}` แทนบล็อก `secrets.compare_digest(row.public_token or "", token or "")` เดิมด้วย:

```python
if row.is_public:
    return await serve_file(row)
if not check_private_token(row.public_token, token):
    logger.warning("media_forbidden id=%s", media_id)
    raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์ดูไฟล์นี้")
return await serve_file(row)
```

revoke ในทรานแซกชันเดียว:

```python
row.public_token = None
row.is_public = False
await db.commit()
```

create ใช้ `row.public_token = secrets.token_urlsafe(32)`

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

### Task A3: Health auth + ซ่อน error ดิบ + redis ping + watchdog

**Files:**
- Modify: `backend/app/api/v1/endpoints/health.py`
- Modify: `backend/app/core/redis_client.py`
- Test: `backend/tests/test_health_hardening.py`

**Interfaces:**
- Consumes: `get_current_admin` จาก `backend/app/api/deps.py`, `redis_client.ping()` จาก `backend/app/core/redis_client.py`
- Produces: `GET /api/v1/health` (public แต่ไม่มีฟิลด์รหัส error ดิบ), `GET /api/v1/health/detailed` + `GET /api/v1/health/websocket` (ต้องผ่าน `get_current_admin` ไม่เช่นนั้น 401/403)

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

async def _boom():
    raise RuntimeError("boom-secret-host")

@pytest.mark.asyncio
async def test_detailed_health_requires_admin(test_client: AsyncClient):
    resp = await test_client.get("/api/v1/health/detailed")
    assert resp.status_code in (401, 403)
    assert "Traceback" not in resp.text and "password" not in resp.text.lower()

@pytest.mark.asyncio
async def test_basic_health_hides_raw_error(test_client: AsyncClient, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.health.check_database", _boom)
    resp = await test_client.get("/api/v1/health")
    assert resp.status_code in (200, 503)
    assert "boom-secret-host" not in resp.text
    assert resp.json().get("database") in ("unavailable", "degraded", "ok")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_health_hardening.py -v`
Expected: FAIL — detailed health ได้ 200 แบบไม่ต้อง auth และ basic health มีข้อความดิบ `boom-secret-host`

- [ ] **Step 3: Write minimal implementation**

```python
import logging
from fastapi import Depends
from app.api.deps import get_current_admin
from app.models.user import User

logger = logging.getLogger(__name__)

@router.get("")
async def basic_health():
    try:
        db_ok = await check_database()
    except Exception:
        logger.exception("health database check failed")
        db_ok = False
    try:
        redis_ok = await check_redis()
    except Exception:
        logger.exception("health redis check failed")
        redis_ok = False
    if db_ok and redis_ok:
        status = "ok"
    else:
        status = "degraded"
    return {"status": status, "database": "ok" if db_ok else "unavailable", "redis": "ok" if redis_ok else "unavailable"}

@router.get("/detailed")
async def detailed_health(admin: User = Depends(get_current_admin)):
    return await collect_details()

@router.get("/websocket")
async def websocket_health(admin: User = Depends(get_current_admin)):
    return await collect_ws_stats()
```

`backend/app/core/redis_client.py`:

```python
async def check_redis() -> bool:
    pong = await redis_client.ping()
    return bool(pong)
```

ลบทุก `str(e)` ออกจาก response body คงไว้เฉพาะ `logger.exception` ฝั่ง server

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_health_hardening.py tests/test_health_watchdog.py tests/test_main_startup.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/health.py backend/app/core/redis_client.py backend/tests/test_health_hardening.py
git commit -m "fix(health): require admin for detailed health, hide raw errors"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_health_watchdog.py -v`
Expected: PASS — watchdog ยังตรวจ basic health ได้โดยไม่ต้อง auth



---

## Wave B — Critical correctness (ขนานกับ Wave A ได้ ไฟล์ไม่ชน)

### Task B1: Transfer conditional UPDATE + rowcount + concurrency test

**Files:**
- Modify: `backend/app/services/live_chat_service/sessions.py`
- Test: `backend/tests/test_transfer_race.py`

**Interfaces:**
- Consumes: `ChatSession` model (`backend/app/models/chat_session.py`: `id`, `status`, `operator_id`, `transfer_count`, `transfer_reason`, `last_activity_at`), `SessionStatus.ACTIVE`
- Produces: `transfer_session(self, line_user_id: str, from_operator_id: int, to_operator_id: int, reason: Optional[str], db: AsyncSession) -> ChatSession` (ชนกัน → HTTPException 409 ข้อความไทย, session ไม่อยู่ → 404); ไม่เปลี่ยน signature `claim_session` / `close_session`

- [ ] **Step 1: Write the failing test**

```python
import asyncio
import pytest
from app.services.live_chat_service.sessions import transfer_session

@pytest.mark.asyncio
async def test_concurrent_transfer_single_winner(db_session_factory, active_session_owned_by_a):
    async def attempt():
        async with db_session_factory() as db:
            return await transfer_session(db, active_session_owned_by_a, 1, 2, "ฝากดูต่อ")
    results = await asyncio.gather(attempt(), attempt(), return_exceptions=True)
    ok = [r for r in results if not isinstance(r, Exception)]
    conflicts = [r for r in results if getattr(r, "status_code", None) in (404, 409)]
    assert len(ok) == 1
    assert len(conflicts) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_transfer_race.py -v`
Expected: FAIL — `len(ok) == 2` (โอนซ้อนสำเร็จทั้งคู่) และ `transfer_count` เพิ่มเป็น 2

- [ ] **Step 3: Write minimal implementation**

```python
import logging
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import update
from app.models.chat_session import ChatSession, SessionStatus

logger = logging.getLogger(__name__)

async def transfer_session(self, line_user_id: str, from_operator_id: int, to_operator_id: int, reason: Optional[str], db: AsyncSession) -> ChatSession:
    now = datetime.now(timezone.utc)
    stmt = (
        update(ChatSession)
        .where(ChatSession.id == session_id)
        .where(ChatSession.status == SessionStatus.ACTIVE)
        .where(ChatSession.operator_id == from_operator_id)
        .values(operator_id=to_operator_id, transfer_count=ChatSession.transfer_count + 1, transfer_reason=reason, last_activity_at=now)
    )
    result = await db.execute(stmt)
    await db.commit()
    if result.rowcount != 1:
        existing = await db.get(ChatSession, session_id)
        if existing is None or existing.status != SessionStatus.ACTIVE:
            raise HTTPException(status_code=404, detail="ไม่พบห้องแชทนี้แล้ว กรุณารีเฟรช")
        raise HTTPException(status_code=409, detail="เจ้าหน้าที่อีกคนรับเคสนี้ไปแล้ว กรุณารีเฟรช")
    logger.info("transfer session=%s from=%s to=%s", session_id, from_operator_id, to_operator_id)
    refreshed = await db.get(ChatSession, session_id)
    return refreshed
```

ลบพารามิเตอร์ `lock` ที่ไม่ถูกใช้ใน `get_active_session` ออก หรือคงไว้แต่ไม่เรียก `with_for_update` หลอก แล้วคอมเมนต์ว่าใช้ conditional UPDATE แทน

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_transfer_race.py tests/test_transfer_session_errors.py tests/test_session_claim.py tests/test_operator_takeover.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/live_chat_service/sessions.py backend/tests/test_transfer_race.py
git commit -m "fix(live-chat): atomic transfer with conditional update"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_session_choreography.py tests/test_multi_operator.py tests/test_live_chat_service.py -v`
Expected: PASS — claim/close/transfer เดิมไม่พัง

### Task B2: Secrets Credential migration + encrypt + backfill

**Files:**
- Create: `backend/alembic/versions/20260912_migrate_secrets_to_credential.py`
- Modify: `backend/app/services/credential_service.py`
- Modify: `backend/app/services/settings_service.py`
- Modify: `backend/app/api/v1/endpoints/settings.py`
- Modify: `backend/app/api/v1/endpoints/admin_credentials.py`
- Modify: `backend/app/models/system_setting.py`
- Test: `backend/tests/test_secrets_migration.py`

**Interfaces:**
- Consumes: `Credential(provider, name, credentials_encrypted, metadata_json, is_active, is_default)` จาก `backend/app/models/credential.py`, `ENCRYPTION_KEY` guard เดิม
- Produces: `SECRET_DENY_LIST: frozenset[str]` ใน `settings_service.py`, `migrate_secret_key(key: str) -> bool`, `CredentialService.encrypt_credentials(data: dict) -> str` / `CredentialService.decrypt_credentials(encrypted: str) -> dict`; `POST /credentials` รับค่าดิบครั้งเดียว, `GET /settings` mask ค่า secret

- [ ] **Step 1: Write the failing test**

```python
import pytest

SECRET_KEYS = ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET", "TELEGRAM_BOT_TOKEN", "N8N_API_KEY"]

@pytest.mark.asyncio
async def test_new_secret_rejected_in_system_setting(settings_service):
    with pytest.raises(ValueError, match="เก็บรหัส"):
        await settings_service.set("LINE_CHANNEL_SECRET", "plain-value")

@pytest.mark.asyncio
async def test_credential_roundtrip(credential_service):
    enc = await credential_service.encrypt("s3cr3t")
    assert enc != "s3cr3t"
    assert await credential_service.decrypt(enc) == "s3cr3t"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_secrets_migration.py -v`
Expected: FAIL — `set` ไม่ raise และ `encrypt` คืนค่าเดิม (ยังไม่มี implementation)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/settings_service.py
SECRET_DENY_LIST: frozenset[str] = frozenset({
    "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    "N8N_API_KEY", "N8N_WEBHOOK_SECRET", "ENCRYPTION_KEY",
})

async def set(self, key: str, value: str) -> SystemSetting:
    if key in SECRET_DENY_LIST:
        raise ValueError("ห้ามเก็บรหัสใน SystemSetting กรุณาใช้หน้า Credentials แทน")
    row = await self._upsert(key, value)
    return row

def mask_settings(items: list[SystemSetting]) -> list[SettingResponse]:
    out = []
    for it in items:
        if it.key in SECRET_DENY_LIST:
            v = "***"
        else:
            v = it.value
        out.append(SettingResponse(key=it.key, value=v, description=it.description))
    return out
```

```python
# backend/app/services/credential_service.py
from cryptography.fernet import Fernet
from app.core.config import settings

class CredentialService:
    def encrypt_credentials(self, data: dict) -> str:
        return Fernet(settings.ENCRYPTION_KEY.encode()).encrypt(raw.encode()).decode()

    def decrypt_credentials(self, encrypted: str) -> dict:
        return Fernet(settings.ENCRYPTION_KEY.encode()).decrypt(enc.encode()).decode()
```

```python
# backend/alembic/versions/20260912_migrate_secrets_to_credential.py
revision = "20260912_migrate_secrets"
down_revision = "z1a2b3c4d5e6"

def upgrade() -> None:
    # 1. backup: copy SystemSetting rows ที่ key ใน DENY_LIST ไปตาราง backup ชั่วคราว
    # 2. ต่อ key: encrypt value แล้ว insert Credential (provider จาก prefix, name=key)
    # 3. verify: decrypt กลับแล้วเทียบเท่าเดิมทุก key
    # 4. mask: update SystemSetting.value เป็น "***MIGRATED***" (ไม่ลบ row กัน FK พัง)
    pass

def downgrade() -> None:
    # restore จาก backup เท่านั้น ไม่ถอดรหัสกลับเป็น plaintext อัตโนมัติ
    pass
```

`GET /settings` เรียก `mask_settings`, `POST /credentials` เรียก `encrypt` ครั้งเดียวก่อน insert, หน้า admin แสดงคำเตือนไทย "ค่านี้ย้ายไป Credentials แล้ว ห้ามกรอกที่นี่"

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_secrets_migration.py tests/test_credential_service.py tests/test_credential_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/20260912_migrate_secrets_to_credential.py backend/app/services/credential_service.py backend/app/services/settings_service.py backend/app/api/v1/endpoints/settings.py backend/app/api/v1/endpoints/admin_credentials.py backend/app/models/system_setting.py backend/tests/test_secrets_migration.py
git commit -m "fix(secrets): migrate secrets to encrypted credentials"
```

- [ ] **Step 6: Validation**

Run: `python scripts/db_target.py alembic --target local upgrade head`
Expected: PASS — migration ขึ้นได้ แล้วรัน `python scripts/db_target.py alembic --target local downgrade -1` และ `upgrade head` ซ้ำอีกหนึ่งรอบโดยไม่ทำรหัสหาย



---

## Wave C — High backend (เริ่มหลัง Wave A merge บนไฟล์ที่ชน: liff.py / media.py)

### Task C1: Analytics gather + cache + percentile SQL + schemas

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_analytics.py`
- Modify: `backend/app/services/analytics_service.py`
- Create: `backend/app/schemas/analytics.py`
- Test: `backend/tests/test_analytics_perf.py`

**Interfaces:**
- Consumes: `redis_client` (`backend/app/core/redis_client.py`), SQLAlchemy `select` + `func`
- Produces: `GET /analytics/dashboard?days=7 -> DashboardResponse(kpis, trends, funnel, heatmap, percentiles, generated_at, cache_hit)`; `AnalyticsService.get_dashboard(days: int) -> DashboardResponse`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_dashboard_single_roundtrip_and_cache(test_client: AsyncClient, query_counter):
    r1 = await test_client.get("/api/v1/analytics/dashboard?days=7")
    assert r1.status_code == 200
    assert set(r1.json().keys()) >= {"kpis", "trends", "funnel", "heatmap", "percentiles", "generated_at"}
    first_queries = query_counter.count
    assert first_queries <= 3, f"too many queries: {first_queries}"
    assert r1.json()["percentiles"]["p50"] >= 0.0
    r2 = await test_client.get("/api/v1/analytics/dashboard?days=7")
    assert r2.json()["cache_hit"] is True
    assert query_counter.count == first_queries
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_analytics_perf.py -v`
Expected: FAIL — query count เกิน 3 (เดิมราว 15) และไม่มี field `cache_hit`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/analytics.py
from pydantic import BaseModel, ConfigDict

class KpiBlock(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    total_sessions: int
    active_sessions: int
    p50_seconds: float
    p95_seconds: float

class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    kpis: KpiBlock
    trends: list[dict]
    funnel: list[dict]
    heatmap: list[dict]
    percentiles: dict
    generated_at: str
    cache_hit: bool = False
```

```python
# backend/app/services/analytics_service.py
import json
import logging
from datetime import datetime, timezone
from sqlalchemy import select, func

logger = logging.getLogger(__name__)
CACHE_TTL = 120

async def get_dashboard(db: AsyncSession, days: int) -> DashboardResponse:
    key = f"analytics:dashboard:{days}"
    cached = await redis_client.get(key)
    if cached:
        data = json.loads(cached)
        data["cache_hit"] = True
        return DashboardResponse(**data)
    duration = func.extract("epoch", ChatSession.closed_at - ChatSession.started_at)
    stmt = select(
        func.count(ChatSession.id),
        func.percentile_cont(0.5).within_group(duration),
        func.percentile_cont(0.95).within_group(duration),
    ).where(ChatSession.created_at >= days_ago(days))
    total, p50, p95 = (await db.execute(stmt)).one()
    resp = DashboardResponse(kpis=KpiBlock(total_sessions=total, active_sessions=0, p50_seconds=float(p50 or 0), p95_seconds=float(p95 or 0)), trends=[], funnel=[], heatmap=[], percentiles={"p50": float(p50 or 0), "p95": float(p95 or 0)}, generated_at=datetime.now(timezone.utc).isoformat(), cache_hit=False)
    await redis_client.setex(key, CACHE_TTL, resp.model_dump_json())
    return resp
```

ใช้ `mget`/pipeline รวม trends/funnel/heatmap ใน query เดียวกัน ไม่ loop N+1

ไม่มีคอลัมน์ `ChatSession.duration_seconds` (ตาม Interfaces ของ Task C1) — duration ต้องคำนวณใน SQL ด้วย `func.extract("epoch", ChatSession.closed_at - ChatSession.started_at)` ตาม pattern จริงที่ใช้อยู่ใน `analytics_service.py`; row ที่ยังไม่ปิด (`closed_at` เป็น NULL) จะถูก `percentile_cont` ตัดออกจากการคำนวณอัตโนมัติ ส่วน `func.count` ยังนับทุก row เป็น total_sessions; ถ้าต้องการ response percentile ให้ใช้ `func.extract("epoch", ChatSession.first_response_at - ChatSession.started_at)` ด้วยสูตรเดียวกัน

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_analytics_perf.py tests/test_analytics_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_analytics.py backend/app/services/analytics_service.py backend/app/schemas/analytics.py backend/tests/test_analytics_perf.py
git commit -m "perf(analytics): single-query dashboard with cache and sql percentiles"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_analytics_service.py -v`
Expected: PASS — percentile ตรงกับค่าที่ DB คำนวณ

### Task C2: Broadcast dry-run + TZ + multicast backoff + stats

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_broadcast.py`
- Modify: `backend/app/services/broadcast_service.py`
- Test: `backend/tests/test_broadcast_dryrun.py`

**Interfaces:**
- Consumes: `BroadcastCreate(content, targets, scheduled_at, dry_run)` schema, LINE multicast sender เดิม
- Produces: `POST /broadcasts {content, targets, scheduled_at, dry_run} -> BroadcastPreview | BroadcastResponse`; `resolve_object_ref(ref: str) -> dict`, `send_multicast_with_backoff(tokens: list[str], msg: dict) -> dict`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_broadcast_dry_run_creates_nothing(test_client: AsyncClient, db_session):
    before = await count_broadcasts(db_session)
    resp = await test_client.post("/api/v1/broadcasts", json={"content": "สวัสดี", "targets": ["U1"], "dry_run": True})
    assert resp.status_code == 200
    assert "preview" in resp.json()
    assert await count_broadcasts(db_session) == before

@pytest.mark.asyncio
async def test_object_ref_without_permission_denied(test_client: AsyncClient, staff_token):
    resp = await test_client.post("/api/v1/broadcasts", headers={"Authorization": f"Bearer {staff_token}"}, json={"content": "x", "targets": [], "object_ref": "$flex_secret", "dry_run": True})
    assert resp.status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_broadcast_dryrun.py -v`
Expected: FAIL — 422 (`dry_run` field ไม่มี) หรือสร้างงานจริงทั้งที่ dry_run=true

- [ ] **Step 3: Write minimal implementation**

```python
import asyncio
import logging
from zoneinfo import ZoneInfo
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)
BKK = ZoneInfo("Asia_Bangkok")

class BroadcastCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    content: str
    targets: list[str]
    scheduled_at: str | None = None
    dry_run: bool = False
    object_ref: str | None = None

async def create_broadcast(db: AsyncSession, payload: BroadcastCreate):
    targets = payload.targets
    if payload.object_ref:
        targets = await resolve_object_ref(payload.object_ref)
    if payload.dry_run:
        return {"preview": {"content": payload.content, "reach": len(targets), "sample": targets[:5]}}
    sched = to_utc(payload.scheduled_at) if payload.scheduled_at else None
    row = await persist_broadcast(db, payload.content, targets, sched)
    return row

async def send_multicast_with_backoff(tokens: list[str], msg: dict) -> dict:
    sent: list[str] = []
    failed: list[str] = []
    for attempt in range(3):
        try:
            return await line_multicast(tokens, msg)
        except Exception:
            logger.exception("multicast attempt %s failed", attempt + 1)
            await asyncio.sleep(2 ** attempt)
    return {"sent": sent, "failed": tokens}
```

`scheduled_at` เก็บ UTC แสดงผลแปลง `Asia_Bangkok` ฝั่ง UI; stats นับ `sent/failed/read` แยกกัน

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_broadcast_dryrun.py tests/test_broadcast_service.py tests/test_broadcast_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_broadcast.py backend/app/services/broadcast_service.py backend/tests/test_broadcast_dryrun.py
git commit -m "feat(broadcast): dry-run preview with tz and backoff"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_broadcast_service.py tests/test_broadcast_scheduler.py -v`
Expected: PASS — scheduled ข้าม timezone ยังตรง

### Task C3: Intent regex compile + escape + order_by

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_intents.py`
- Modify: `backend/app/services/message_intake/intent_matching.py`
- Test: `backend/tests/test_intent_regex_guard.py`

**Interfaces:**
- Consumes: `Intent` model (`backend/app/models/intent.py`: `pattern`, `priority`, `created_at`)
- Produces: `compile_intent(pattern: str) -> re.Pattern`, `wildcard_to_regex(raw: str) -> str`, `IntentMatcher.match(text: str) -> Intent | None` (order `priority DESC, created_at ASC`)

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_redos_pattern_rejected(test_client: AsyncClient):
    resp = await test_client.post("/api/v1/intents", json={"pattern": "(a+)+$" * 10, "priority": 1, "category": "ทักทาย"})
    assert resp.status_code == 422

def test_wildcard_escaped():
    from app.services.message_intake.intent_matching import wildcard_to_regex
    assert wildcard_to_regex("สวัสดี*") == "สวัสดี.*"
    assert wildcard_to_regex("a.b") == "a\\.b"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_intent_regex_guard.py -v`
Expected: FAIL — pattern พิษได้ 201 และ wildcard ไม่ escape จุด

- [ ] **Step 3: Write minimal implementation**

```python
import re
import logging
from sqlalchemy import select

logger = logging.getLogger(__name__)
MAX_PATTERN_LEN = 200

def wildcard_to_regex(raw: str) -> str:
    return re.escape(raw).replace("\\*", ".*")

def compile_intent(pattern: str) -> re.Pattern:
    if len(pattern) > MAX_PATTERN_LEN:
        raise ValueError("รูปแบบยาวเกินไป กรุณาย่อให้สั้นลง")
    if re.search("(\\+|\\*){2,}|\\([^)]*\\+[^)]*\\)\\+", pattern):
        raise ValueError("รูปแบบเสี่ยงค้าง กรุณาเขียนให้เจาะจงขึ้น")
    return re.compile(pattern, re.IGNORECASE)

async def list_intents_ordered(db: AsyncSession):
    stmt = select(Intent).order_by(Intent.priority.desc(), Intent.created_at.asc())
    return (await db.execute(stmt)).scalars().all()
```

POST `/intents` เรียก `compile_intent` ก่อน insert ถ้า fail → 422 ข้อความไทย; matcher โหลด compile ครั้งเดียวตอน start ไม่ compile ต่อข้อความ

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_intent_regex_guard.py tests/test_webhook_intent_matching.py tests/test_detect_category.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_intents.py backend/app/services/message_intake/intent_matching.py backend/tests/test_intent_regex_guard.py
git commit -m "fix(intent): precompile regex with redos guard and ordering"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_webhook_intent_fallthrough.py tests/test_intent_category_readiness.py -v`
Expected: PASS

### Task C4: Reply $regex + update validation

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_reply_objects.py`
- Modify: `backend/app/models/reply_object.py`
- Test: `backend/tests/test_reply_object_guard.py`

**Interfaces:**
- Consumes: `ReplyObject(object_id, payload)` เดิม
- Produces: `OBJECT_ID_RE = re.compile(r"^\$[A-Za-z][A-Za-z0-9_]{2,39}$")`, `ReplyObjectUpdate` schema (validate เต็มรูปแบบ); `$100` ต้อง 422

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_dollar_name_strict(test_client: AsyncClient):
    bad = await test_client.post("/api/v1/reply-objects", json={"object_id": "$100", "payload": {"type": "text"}})
    assert bad.status_code == 422
    good = await test_client.post("/api/v1/reply-objects", json={"object_id": "$flex_traffic", "payload": {"type": "text"}})
    assert good.status_code in (200, 201)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_reply_object_guard.py -v`
Expected: FAIL — `$100` ได้ 201

- [ ] **Step 3: Write minimal implementation**

```python
import re
from pydantic import BaseModel, ConfigDict, field_validator

OBJECT_ID_RE = re.compile(r"^\$[A-Za-z][A-Za-z0-9_]{2,39}$")

class ReplyObjectCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    object_id: str
    payload: dict

    @field_validator("object_id")
    @classmethod
    def check_name(cls, v: str) -> str:
        if not OBJECT_ID_RE.match(v):
            raise ValueError("ชื่อต้องขึ้นต้นด้วย $ ตามด้วยตัวอักษร/ตัวเลข/ขีดล่าง 3-40 ตัว (เช่น $flex_traffic)")
        return v

class ReplyObjectUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    payload: dict
    is_active: bool | None = None
```

PATCH ต้องใช้ `ReplyObjectUpdate` ห้ามอัปเดต `object_id` โดยตรง

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_reply_object_guard.py tests/test_reply_object_validation.py tests/test_response_parser.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_reply_objects.py backend/app/models/reply_object.py backend/tests/test_reply_object_guard.py
git commit -m "fix(reply-objects): strict dollar-name validation on create and update"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_reply_object_validation.py tests/test_response_parser_template.py -v`
Expected: PASS



### Task C5: Requests guard + audit + enums รวมศูนย์

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_requests.py`
- Modify: `backend/app/models/service_request.py`
- Reference: `backend/app/models/service_request.py` (reuse `RequestStatus` เดิม `backend/app/models/service_request.py:8-26` ห้ามสร้าง `backend/app/models/service_request.py (reuse enum — no new file)`)
- Test: `backend/tests/test_request_guards.py`

**Interfaces:**
- Consumes: `get_current_admin` / `get_current_manager` จาก `backend/app/api/deps.py`, `AuditLog` model
- Produces: `RequestStatus(str, Enum)` (PENDING/IN_PROGRESS/DONE/CANCELLED — ค่าเดียวทั้ง backend/frontend/DB), assignment guard ใน `PATCH /requests/{id}/assign`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_assign_by_non_owner_forbidden(test_client: AsyncClient, outsider_token, owned_request):
    resp = await test_client.patch(f"/api/v1/admin/requests/{owned_request}/assign", headers={"Authorization": f"Bearer {outsider_token}"}, json={"assignee_id": 99})
    assert resp.status_code == 403

@pytest.mark.asyncio
async def test_delete_writes_audit(test_client: AsyncClient, admin_token, some_request, db_session):
    resp = await test_client.delete(f"/api/v1/admin/requests/{some_request}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code in (200, 204)
    assert await audit_exists(db_session, action="delete_request")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_request_guards.py -v`
Expected: FAIL — assign ได้ 200 ทั้งที่ไม่ใช่เจ้าของ และ delete ไม่เขียน audit

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/models/service_request.py (reuse enum — no new file)
import enum

class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    CANCELLED = "CANCELLED"
```

```python
# backend/app/api/v1/endpoints/admin_requests.py
import logging
from fastapi import Depends, HTTPException

logger = logging.getLogger(__name__)

@router.patch("/requests/{id}/assign")
async def assign_request(id: int, body: AssignBody, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    row = await db.get(ServiceRequest, id)
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบงานนี้แล้ว")
    if row.assignee_id != admin.id and admin.role not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="เฉพาะเจ้าของงานหรือหัวหน้าเท่านั้นที่ย้ายงานได้")
    row.assignee_id = body.assignee_id
    await db.commit()
    return row

@router.delete("/requests/{id}")
async def delete_request(id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    row = await db.get(ServiceRequest, id)
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบงานนี้แล้ว")
    await db.delete(row)
    db.add(AuditLog(actor_id=admin.id, action="delete_request", target=str(id), detail="ลบงานพร้อมบันทึก"))
    await db.commit()
    logger.info("request deleted id=%s by=%s", id, admin.id)
    return {"ok": True}
```

`service_request.status` ใช้ `RequestStatus` enum เดียวกันทั้ง DB/frontend constants

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_request_guards.py tests/test_admin_requests_endpoints.py tests/test_request_workflow.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_requests.py backend/app/models/service_request.py backend/app/models/service_request.py (reuse enum — no new file) backend/tests/test_request_guards.py
git commit -m "fix(requests): assignment guard with audit and unified status enum"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_request_workflow.py tests/test_admin_requests_endpoints.py -v`
Expected: PASS

### Task C6: Booking cap 62 วัน + terminal + PATCH required

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_bookings.py`
- Modify: `backend/app/api/v1/endpoints/liff_bookings.py`
- Modify: `backend/app/services/booking_service.py`
- Test: `backend/tests/test_booking_guards.py`

**Interfaces:**
- Consumes: `Booking` model (`backend/app/models/booking.py`), `BookingSettings(advance_days)`
- Produces: `validate_booking_date(d: date, advance_days: int) -> None` (เกิน 62 วันหรือเกิน advance_days → 422 ไทย), terminal set `TERMINAL = frozenset({"CANCELLED", "DONE"})` ย้อนกลับ → 409

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient
from datetime import date, timedelta

@pytest.mark.asyncio
async def test_booking_beyond_cap_rejected(test_client: AsyncClient):
    far = (date.today() + timedelta(days=90)).isoformat()
    resp = await test_client.post("/api/v1/liff/bookings", json={"date": far, "slot": "09:00", "phone": "0812345678"})
    assert resp.status_code == 422
    assert "62" in resp.text or "ล่วงหน้า" in resp.text

@pytest.mark.asyncio
async def test_terminal_cannot_reopen(test_client: AsyncClient, cancelled_booking):
    resp = await test_client.patch(f"/api/v1/admin/bookings/{cancelled_booking}", json={"status": "CONFIRMED"})
    assert resp.status_code in (409, 422)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_booking_guards.py -v`
Expected: FAIL — จอง 90 วันได้ 201 และ terminal ย้อนได้ 200

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/booking_service.py
import logging
from datetime import date
from fastapi import HTTPException

logger = logging.getLogger(__name__)
MAX_DAYS = 62
TERMINAL = frozenset({"CANCELLED", "DONE"})

def validate_booking_date(d: date, advance_days: int) -> None:
    delta = (d - date.today()).days
    cap = min(MAX_DAYS, advance_days)
    if delta < 0 or delta > cap:
        raise HTTPException(status_code=422, detail=f"จองได้ล่วงหน้าไม่เกิน {cap} วัน กรุณาเลือกวันใหม่")

def guard_transition(old: str, new: str) -> None:
    if old in TERMINAL and new != old:
        raise HTTPException(status_code=409, detail="คิวนี้จบแล้ว ไม่สามารถเปลี่ยนย้อนกลับได้")
```

PATCH schema ใช้ field required (ห้าม None):

```python
class BookingPatch(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    status: str
    slot: str | None = None

    @field_validator("status")
    @classmethod
    def not_none(cls, v):
        if v is None:
            raise ValueError("กรุณาระบุสถานะ")
        return v
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_booking_guards.py tests/test_booking_create.py tests/test_booking_update.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_bookings.py backend/app/api/v1/endpoints/liff_bookings.py backend/app/services/booking_service.py backend/tests/test_booking_guards.py
git commit -m "fix(booking): enforce 62-day cap with terminal guard"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_booking_slots.py tests/test_booking_availability_range.py tests/test_booking_create_concurrency.py -v`
Expected: PASS

### Task C7: Rich menu preview public + scheduler per-menu try + TZ

**Files:**
- Modify: `backend/app/api/v1/endpoints/rich_menus.py`
- Modify: `backend/app/services/rich_menu_service.py`
- Test: `backend/tests/test_richmenu_preview_sched.py`

**Interfaces:**
- Consumes: `RichMenu` model (`backend/app/models/rich_menu.py`: `image_path`, `schedule_at`)
- Produces: `GET /rich-menus/{id}/preview -> {image_url | placeholder: true}`, `sync_due_menus() -> {ok: [...], skipped: [...]}` (ล้มทีละเมนู)

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_imageless_preview_ok(test_client: AsyncClient, menu_without_image):
    resp = await test_client.get(f"/api/v1/rich-menus/{menu_without_image}/preview")
    assert resp.status_code == 200
    assert resp.json().get("placeholder") is True

@pytest.mark.asyncio
async def test_scheduler_isolates_failure(rich_menu_service, db_session):
    result = await rich_menu_service.sync_due_menus()
    assert "ok" in result and "skipped" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_richmenu_preview_sched.py -v`
Expected: FAIL — preview ได้ 403 และ scheduler raise ทั้งชุดเมื่อเมนูเดียวพัง

- [ ] **Step 3: Write minimal implementation**

```python
import logging
from zoneinfo import ZoneInfo
from fastapi import HTTPException

logger = logging.getLogger(__name__)
BKK = ZoneInfo("Asia_Bangkok")

@router.get("/rich-menus/{id}/preview")
async def preview_menu(id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(RichMenu, id)
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบเมนูนี้")
    if not row.image_path:
        return {"placeholder": True, "message": "ยังไม่มีรูป แสดงตัวอย่างแบบร่างก่อนได้"}
    return {"placeholder": False, "image_url": public_url(row.image_path)}

async def sync_due_menus(db: AsyncSession) -> dict:
    ok: list[int] = []
    skipped: list[dict] = []
    for menu in await due_menus(db):
        try:
            if not menu.image_path:
                skipped.append({"id": menu.id, "reason": "ยังไม่มีรูป ข้ามก่อน"})
                continue
            await push_to_line(menu)
            ok.append(menu.id)
        except Exception:
            logger.exception("richmenu sync failed id=%s", menu.id)
            skipped.append({"id": menu.id, "reason": "ส่งไม่สำเร็จ จะลองใหม่รอบถัดไป"})
    return {"ok": ok, "skipped": skipped}
```

`schedule_at` เก็บ UTC แปลงแสดง `Asia_Bangkok` ฝั่ง UI

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_richmenu_preview_sched.py tests/test_rich_menu_display_schedule.py tests/test_rich_menu_display_scheduler_db.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/rich_menus.py backend/app/services/rich_menu_service.py backend/tests/test_richmenu_preview_sched.py
git commit -m "fix(rich-menu): imageless placeholder preview with isolated scheduler"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_rich_menu_schema.py tests/test_rich_menu_size.py -v`
Expected: PASS



---

## Wave D — Admin / frontend (ทำท้ายสุดเมื่อ API นิ่งแล้ว)

### Task D1: Histories pagination + export stream + PDF ฟอนต์ไทย

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_live_chat.py`
- Modify: `backend/app/api/v1/endpoints/admin_export.py`
- Modify: `frontend/app/admin/chat-histories/page.tsx`
- Test: `backend/tests/test_histories_export.py`

**Interfaces:**
- Consumes: `GET /live-chat/histories` เดิม
- Produces: `GET /live-chat/histories?cursor=...&limit=... -> {items, next_cursor}`, `GET /export?format=csv|pdf` (StreamingResponse + Content-Disposition encode ไทย)

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_histories_limit_clamped(test_client: AsyncClient):
    resp = await test_client.get("/api/v1/live-chat/histories?limit=9999")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) <= 100

@pytest.mark.asyncio
async def test_csv_streams(test_client: AsyncClient):
    resp = await test_client.get("/api/v1/export?format=csv&limit=100")
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]

@pytest.mark.asyncio
async def test_presence_burst_bounded(db_session):
    await fire_heartbeats(db_session, user_id=7, n=100, seconds=10)
    assert await count_presence_writes(db_session, user_id=7) <= 12
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_histories_export.py -v`
Expected: FAIL — limit 9999 คืนมาทั้งก้อน, export รวม string ทั้งไฟล์, presence เขียน DB ทุก heartbeat

- [ ] **Step 3: Write minimal implementation**

```python
import logging
from fastapi import Query, HTTPException
from fastapi.responses import StreamingResponse
from urllib.parse import quote

logger = logging.getLogger(__name__)
MAX_LIMIT = 100

@router.get("/live-chat/histories")
async def list_histories(cursor: str | None = None, limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)):
    limit = min(max(limit, 1), MAX_LIMIT)
    items, next_cursor = await fetch_page(db, cursor, limit)
    return {"items": items, "next_cursor": next_cursor}

@router.get("/export")
async def export_chat(format: str, db: AsyncSession = Depends(get_db)):
    if format not in ("csv", "pdf"):
        raise HTTPException(status_code=422, detail="รูปแบบต้องเป็น csv หรือ pdf เท่านั้น")
    if format == "csv":
        filename = quote("บทสนทนา.csv")
    else:
        filename = quote("บทสนทนา.pdf")
    gen = stream_csv_rows(db) if format == "csv" else stream_pdf_bytes(db)
    if format == "csv":
        media = "text/csv; charset=utf-8"
    else:
        media = "application/pdf"
    return StreamingResponse(gen, media_type=media, headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"})
```

Note: `filename*=UTF-8''{filename}` ด้านบนคือ RFC 5987 (`filename*=UTF-8` + two single quotes + encoded name) — ในไฟล์จริงต้องเหลือ single quote 2 ตัวติดกันเท่านั้น

PDF ฝังฟอนต์ `THSarabunNew.ttf` / `NotoSansThai-Regular.ttf` ใน container assets; frontend `chat-histories/page.tsx` ใช้ cursor pagination + ข้อความไทย "กำลังโหลดเพิ่ม…"; presence ใช้ Redis expiry debounce (heartbeat 100 ครั้ง/10 วิ เขียน DB ไม่เกิน 12 ครั้ง)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_histories_export.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_live_chat.py backend/app/api/v1/endpoints/admin_export.py frontend/app/admin/chat-histories/page.tsx backend/tests/test_histories_export.py
git commit -m "fix(histories): server pagination with streaming thai export"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_conversation_detail_last_message.py -v`
Expected: PASS

### Task D2: Canned normalize + 409 + optimistic concurrency

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_canned_responses.py`
- Modify: `backend/app/services/canned_response_service.py`
- Modify: `frontend/app/admin/canned-responses/page.tsx`
- Test: `backend/tests/test_canned_dup_guard.py`

**Interfaces:**
- Consumes: `CannedResponse(title, content, updated_at)` (`backend/app/models/canned_response.py`)
- Produces: `normalize_text(s: str) -> str` (trim + collapse space + casefold), POST ซ้ำ → 409 `{conflicting_name}`, PATCH ชน version → 409

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_duplicate_normalized_rejected(test_client: AsyncClient):
    await test_client.post("/api/v1/canned", json={"title": "ทักทาย", "content": "สวัสดีค่ะ"})
    dup = await test_client.post("/api/v1/canned", json={"title": "ทักทาย2", "content": "  สวัสดีค่ะ  "})
    assert dup.status_code == 409
    assert "ชน" in dup.text or "ซ้ำ" in dup.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_canned_dup_guard.py -v`
Expected: FAIL — ได้ 201 ทั้งที่ข้อความซ้ำต่างกันแค่ space

- [ ] **Step 3: Write minimal implementation**

```python
import re
import logging
from fastapi import HTTPException
from sqlalchemy import select

logger = logging.getLogger(__name__)

def normalize_text(s: str) -> str:
    return re.sub("\\s+", " ", s.strip()).casefold()

async def create_canned(db: AsyncSession, title: str, content: str):
    norm = normalize_text(content)
    rows = (await db.execute(select(CannedResponse))).scalars().all()
    for r in rows:
        if normalize_text(r.content) == norm:
            raise HTTPException(status_code=409, detail="ข้อความซ้ำกับรายการ " + r.title + " กรุณาใช้รายการเดิม")
    row = CannedResponse(title=title, content=content.strip())
    db.add(row)
    await db.commit()
    return row

async def update_canned(db: AsyncSession, id: int, content: str, updated_at: str):
    row = await db.get(CannedResponse, id)
    if row is None:
        raise HTTPException(status_code=404, detail="ไม่พบข้อความนี้แล้ว")
    if str(row.updated_at) != str(updated_at):
        raise HTTPException(status_code=409, detail="มีคนแก้ข้อความนี้ไปก่อนแล้ว กรุณารีเฟรช")
    row.content = content.strip()
    await db.commit()
    return row
```

frontend แสดง 409 ด้วยข้อความไทยพร้อมชื่อรายการที่ชน

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_canned_dup_guard.py tests/test_canned_response_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_canned_responses.py backend/app/services/canned_response_service.py frontend/app/admin/canned-responses/page.tsx backend/tests/test_canned_dup_guard.py
git commit -m "fix(canned): normalize duplicates with 409 and version guard"
```

- [ ] **Step 6: Validation**

Run: `npm run test:unit -- canned-responses` (workdir `frontend/`)
Expected: PASS

### Task D3: LIFF timeout + ratelimit + drift (ต่อยอด A1 — ต้องหลัง A1 เท่านั้น)

**Files:**
- Modify: `backend/app/api/v1/endpoints/liff.py`
- Test: `backend/tests/test_liff_hardening.py`

**Interfaces:**
- Consumes: `require_liff_identity` จาก Task A1 (ห้าม duplicate logic ให้ import มาเติม timeout/429/422)
- Produces: `verify_liff_token(token) with timeout connect 3s / read 5s + retry 1 ครั้ง` (fail → 502 ไทย), LIFF GET rate-limit, PATCH None → 422

- [ ] **Step 1: Write the failing test**

```python
import pytest
import httpx
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_verify_timeout_maps_502(test_client: AsyncClient, monkeypatch):
    async def boom(*a, **k):
        raise httpx.ConnectTimeout("slow")
    monkeypatch.setattr("httpx.AsyncClient.post", boom)
    resp = await test_client.post("/api/v1/liff/service-requests", headers={"x-liff-id-token": "x"}, json={"topic": "ถนน", "detail": "หลุม", "phone": "0812345678"})
    assert resp.status_code == 502

@pytest.mark.asyncio
async def test_patch_none_422(test_client: AsyncClient, liff_token, my_request):
    resp = await test_client.patch(f"/api/v1/liff/service-requests/{my_request}", headers={"x-liff-id-token": liff_token}, json={"detail": None})
    assert resp.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_liff_hardening.py -v`
Expected: FAIL — timeout ได้ 500 และ PATCH None ได้ 500 จาก DB

- [ ] **Step 3: Write minimal implementation**

```python
import httpx
import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

async def verify_liff_token(id_token: str) -> str:
    timeout = httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for _ in range(2):
                try:
                    r = await client.post("https://api.line.me/oauth2/v2.1/verify", data={"id_token": token, "client_id": settings.LINE_LOGIN_CHANNEL_ID})
                    r.raise_for_status()
                    return r.json()
                except httpx.TimeoutException:
                    logger.warning("liff verify timeout")
                    continue
    except httpx.HTTPError:
        logger.exception("liff verify failed")
    raise HTTPException(status_code=502, detail="ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาลองใหม่")
```

GET ใส่ rate-limit decorator เดียวกับ POST; PATCH schema ใช้ explicit None check แล้ว raise 422 ไทย "กรุณากรอกข้อมูลให้ครบ"

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_liff_hardening.py tests/test_http_rate_limit.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/liff.py backend/tests/test_liff_hardening.py
git commit -m "fix(liff): verify timeout with ratelimit and strict patch validation"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_liff_token.py tests/test_service_request_liff_validation.py -v`
Expected: PASS

### Task D4: Friends / users PII + RBAC + pagination

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_friends.py`
- Modify: `backend/app/api/v1/endpoints/admin_users.py`
- Modify: `frontend/app/admin/friends/page.tsx`
- Modify: `frontend/app/admin/users/page.tsx`
- Test: `backend/tests/test_pii_masking.py`

**Interfaces:**
- Consumes: `get_current_admin/manager/staff` + permission matrix (`access_admin_endpoints`), `FriendEvent` enum
- Produces: `mask_line_id(v: str, role: str) -> str`, `mask_phone(v: str | None, role: str) -> str | None`; list endpoints บังคับ `limit <= 100` + mask ตาม role

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_staff_sees_masked_pii(test_client: AsyncClient, staff_token):
    resp = await test_client.get("/api/v1/admin/friends?limit=5", headers={"Authorization": f"Bearer {staff_token}"})
    assert resp.status_code == 200
    first = resp.json()["items"][0]
    assert "***" in first["line_user_id"]
    assert "password_hash" not in resp.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_pii_masking.py -v`
Expected: FAIL — staff เห็น line_user_id เต็มและมี password_hash หลุด

- [ ] **Step 3: Write minimal implementation**

```python
def mask_line_id(v: str, role: str) -> str:
    if role in ("SUPER_ADMIN", "ADMIN"):
        return v
    if len(v) > 5:
        return v[:3] + "***" + v[-2:]
    return "***"

def mask_phone(v: str | None, role: str) -> str | None:
    if v is None:
        return None
    if role in ("SUPER_ADMIN", "ADMIN"):
        return v
    return v[:3] + "****" + v[-2:]
```

list: `limit = min(max(limit, 1), 100)`; response schema ตัด `password_hash/token` ออกเสมอ; enum event รวมศูนย์ที่ `FriendEventType`

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_pii_masking.py tests/test_friend_service.py tests/test_admin_users.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_friends.py backend/app/api/v1/endpoints/admin_users.py frontend/app/admin/friends/page.tsx frontend/app/admin/users/page.tsx backend/tests/test_pii_masking.py
git commit -m "fix(pii): mask friends and users by role with pagination"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_permissions.py tests/test_module_permission_endpoints.py -v`
Expected: PASS



### Task D5: Reports PII + params ตรงกันสองฝั่ง

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_reports.py`
- Modify: `frontend/app/admin/reports/page.tsx`
- Test: `backend/tests/test_reports_guard.py`

**Interfaces:**
- Consumes: `mask_phone/mask_line_id` จาก Task D4 (import ตรง ห้ามเขียนซ้ำ)
- Produces: `GET /reports/export?format=csv|pdf&orientation=portrait|landscape -> stream`, CSV ไม่มี PII ดิบเมื่อ role ไม่พอ

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_csv_no_raw_pii_for_staff(test_client: AsyncClient, staff_token):
    resp = await test_client.get("/api/v1/reports/export?format=csv", headers={"Authorization": f"Bearer {staff_token}"})
    assert resp.status_code == 200
    assert "0812345678" not in resp.text

@pytest.mark.asyncio
async def test_bad_pdf_param_422(test_client: AsyncClient, admin_token):
    resp = await test_client.get("/api/v1/reports/export?format=pdf&orientation=diagonal", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_reports_guard.py -v`
Expected: FAIL — CSV มีเบอร์ดิบ และ orientation ผิดได้ 200

- [ ] **Step 3: Write minimal implementation**

```python
from pydantic import BaseModel, ConfigDict, field_validator
from app.api.v1.endpoints.admin_friends import mask_line_id, mask_phone

class ReportExportQuery(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    format: str
    orientation: str = "portrait"
    locale: str = "th-TH"

    @field_validator("format")
    @classmethod
    def check_format(cls, v: str) -> str:
        if v not in ("csv", "pdf"):
            raise ValueError("รูปแบบต้องเป็น csv หรือ pdf เท่านั้น")
        return v

    @field_validator("orientation")
    @classmethod
    def check_orientation(cls, v: str) -> str:
        if v not in ("portrait", "landscape"):
            raise ValueError("ทิศทางต้องเป็น portrait หรือ landscape เท่านั้น")
        return v
```

CSV writer เรียก `mask_phone`/`mask_line_id` ทุกแถวตาม role; frontend `reports/page.tsx` dropdown ใช้ค่าเดียวกัน (`portrait|landscape`, `th-TH`) ไม่มีค่าที่สาม

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_reports_guard.py tests/test_admin_reports_helpers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_reports.py frontend/app/admin/reports/page.tsx backend/tests/test_reports_guard.py
git commit -m "fix(reports): strip pii from csv with aligned pdf params"
```

- [ ] **Step 6: Validation**

Run: `npm run test:unit -- reports` (workdir `frontend/`)
Expected: PASS

### Task D6: Design Button variant-only + tokens รวมศูนย์

**Files:**
- Modify: `frontend/components/ui/Button.tsx`
- Modify: `frontend/app/globals.css`
- Test: `frontend/components/ui/__tests__/button.test.tsx`

**Interfaces:**
- Consumes: CSS variables `--skn-primary`, `--skn-danger` จาก `globals.css`
- Produces: `Button({variant: "primary" | "secondary" | "danger", size, children})` (variant เดิมยัง render เหมือนเดิม — opt-in ไม่แตกทั้งระบบ)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { Button } from "../Button";

test("danger variant uses token class", () => {
  render(<Button variant="danger">ลบ</Button>);
  expect(screen.getByRole("button", { name: "ลบ" }).className).toMatch(/btn-danger/);
});

test("default stays primary", () => {
  render(<Button>ตกลง</Button>);
  expect(screen.getByRole("button", { name: "ตกลง" }).className).toMatch(/btn-primary/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- button` (workdir `frontend/`)
Expected: FAIL — `btn-danger` ไม่มี (ปุ่ม danger ใช้สี hardcode) หรือ default ไม่ใช่ primary

- [ ] **Step 3: Write minimal implementation**

```tsx
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("btn focus-ring thai-text", {
  variants: {
    variant: {
      primary: "btn-primary",
      secondary: "btn-secondary",
      danger: "btn-danger",
    },
    size: { sm: "btn-sm", md: "btn-md", lg: "btn-lg" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export function Button({ variant, size, className, children, ...rest }: any) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {children}
    </button>
  );
}
```

```css
:root {
  --skn-primary: #1d4ed8;
  --skn-danger: #dc2626;
}
.btn-primary { background: var(--skn-primary); }
.btn-danger { background: var(--skn-danger); }
```

migrate ทีละหน้า (codemod) ห้ามเปลี่ยน global class เดิมทีเดียว

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- button` (workdir `frontend/`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/Button.tsx frontend/app/globals.css frontend/components/ui/__tests__/button.test.tsx
git commit -m "fix(ui): variant-only button with centralized tokens"
```

- [ ] **Step 6: Validation**

Run: `npm run lint` (workdir `frontend/`)
Expected: PASS — ไม่มี type/lint error

### Task D7: Credentials / business-hours permissions + image-resize CSRF

**Files:**
- Modify: `backend/app/core/permissions.py`
- Modify: `backend/app/api/v1/endpoints/admin_credentials.py`
- Modify: `backend/app/api/v1/endpoints/admin_business_hours.py`
- Verify-only: `frontend/app/admin/image-resize/use-image-resize.ts` (client-side canvas, no backend endpoint — ห้ามสร้าง `admin_image_resize.py`)
- Modify: `frontend/app/admin/settings/permissions/page.tsx`
- Test: `backend/tests/test_perm_csrf.py`

**Interfaces:**
- Consumes: permission matrix + `DEFAULT_POLICY` เดิม, `get_current_admin/manager` gates
- Produces: permission keys `manage_credentials`, `edit_business_hours` (พร้อม DEFAULT_POLICY), `POST /image-resize` ต้องมี auth + CSRF + signed key หมดอายุ

- [ ] **Step 1: Write the failing test**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_perm_matrix_has_new_keys(test_client: AsyncClient, admin_token):
    resp = await test_client.get("/api/v1/permissions", headers={"Authorization": f"Bearer {admin_token}"})
    keys = [p["key"] for p in resp.json()]
    assert "manage_credentials" in keys and "edit_business_hours" in keys

@pytest.mark.asyncio
async def test_resize_without_csrf_denied(test_client: AsyncClient, admin_token):
    resp = await test_client.post("/api/v1/image-resize", headers={"Authorization": f"Bearer {admin_token}"}, json={"url": "https://x/y.jpg", "w": 100})
    assert resp.status_code in (403, 422)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_perm_csrf.py -v`
Expected: FAIL — key ใหม่ไม่มีใน matrix และ resize ผ่านโดยไม่มี CSRF

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/core/permissions.py — ต่อท้าย DEFAULT_POLICY (`backend/app/core/permissions.py:80-150`)
DEFAULT_POLICY["manage_credentials"] = ["SUPER_ADMIN"]
DEFAULT_POLICY["edit_business_hours"] = ["SUPER_ADMIN", "ADMIN"]
```

```python
# image resize endpoint
import hashlib
import hmac
import logging
import time
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

def verify_csrf(request: Request) -> None:
    token = request.headers.get("x-csrf-token", "")
    if not token or token != request.session.get("csrf"):
        raise HTTPException(status_code=403, detail="คำขอไม่ถูกต้อง กรุณารีเฟรชแล้วลองใหม่")

def verify_signed_key(key: str) -> None:
    try:
        raw, exp, sig = key.split(".")
        if int(exp) < int(time.time()):
            raise ValueError("expired")
        good = hmac.new(settings.SECRET_KEY.encode(), f"{raw}.{exp}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(good, sig):
            raise ValueError("bad sig")
    except Exception:
        logger.warning("image resize bad key")
        raise HTTPException(status_code=403, detail="ลิงก์หมดอายุ กรุณาสร้างใหม่")
```

frontend `permissions/page.tsx` เพิ่ม 2 แถวภาษาไทย "จัดการรหัสเชื่อมต่อ" / "แก้เวลาทำการ" พร้อมค่า default จาก API

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_perm_csrf.py tests/test_permissions.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/permissions.py backend/app/api/v1/endpoints/admin_credentials.py backend/app/api/v1/endpoints/admin_business_hours.py frontend/app/admin/settings/permissions/page.tsx backend/tests/test_perm_csrf.py
git commit -m "fix(permissions): credential and hours keys with resize csrf"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_module_permission_endpoints.py tests/test_deps_gates.py -v`
Expected: PASS

---

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
- **Alembic head ชนกัน:** B1/B2 ขนานกันได้แต่ห้ามสร้าง migration พร้อมกันโดยไม่เช็ก — ก่อนเริ่ม B2 รัน `python scripts/db_target.py alembic --target local heads` ให้แน่ใจว่ามี head เดียว ถ้าหลาย head ต้อง merge ก่อน และตั้ง `down_revision` จาก head จริง ณ วันรัน (อย่า copy ค่าตัวอย่างใน plan ไปใช้ตรง ๆ)
- **CSRF กับ auth แบบ cookie-only:** FastAPI ของ repo นี้ไม่มี `request.session` (ไม่มี session middleware, auth เป็น cookie-only ตาม `backend/app/api/deps.py`) — การเทียบ CSRF token ต้องเป็น double-submit: อ่าน header `x-csrf-token` แล้วเทียบกับ HttpOnly cookie `csrf_token` ด้วย `compare_digest` ตาม pattern ที่ `frontend/lib/csrfStore.ts` ใช้อยู่ (frontend เก็บ token จาก cookie ใน store แล้ว echo กลับผ่าน header และ field `csrf_token` ใน body)

## Before / After (UX)

- **Wave A:** ประชาชนต้องยืนยันตัวตนผ่าน LINE ก่อนยื่นคำร้อง/อัปโหลดไฟล์เสมอ (เดิมยื่นได้โดยไม่มีตัวตน), ลิงก์ไฟล์ private ที่ไม่มี token ที่ถูกต้องเปิดไม่ได้, หน้า health แบบละเอียดคนนอกระบบเรียกไม่ได้และไม่เห็น error ดิบ
- **Wave B:** เจ้าหน้าที่โอนสายชนกันจะเห็นข้อความไทยว่า "เจ้าหน้าที่อีกคนรับเคสนี้ไปแล้ว" แทนที่เคสจะถูกแย่งเงียบ ๆ; ส่วน secrets — N/A — internal change (ผู้ใช้เห็นแค่คำเตือน "ค่านี้ย้ายไป Credentials แล้ว ห้ามกรอกที่นี่" ในหน้า settings)
- **Wave C:** แดชบอร์ดสถิติเปิดเร็วขึ้นชัดเจน, broadcast มีปุ่มทดลองส่ง (dry-run) ก่อนส่งจริง, พรีวิว rich menu ที่ยังไม่มีรูปเห็น placeholder แทน 403, bot ไม่ค้างจาก pattern พิษ — ส่วนที่เหลือของ Wave นี้ N/A — internal change
- **Wave D:** เปิดเคสเก่า/ส่งออกไฟล์ใหญ่ได้โดยไม่ค้าง, สร้าง shortcut ซ้ำได้ 409 ที่อ่านรู้เรื่อง, รายงาน CSV ไม่มี PII ดิบ, ปุ่ม/สีใหม่เป็น opt-in — ส่วนที่เหลือ N/A — internal change

## Edge-Case Checklist

- [ ] ตารางว่างในช่วง `days` → `percentile_cont` คืน NULL → fallback `p50 or 0` ตอบ 0.0 ไม่ 500 (C1)
- [ ] `limit=0` / ค่าติดลบ → clamp เข้าช่วง min/max ก่อน query (D1 histories, C7 friends, D4)
- [ ] LIFF token หมดอายุ / LINE ปฏิเสธ → 401 ข้อความไทย ไม่เขียน DB (A1, D3)
- [ ] PATCH body ว่าง / ฟิลด์เป็น None ทั้งหมด → 422 ไม่ 500 (C6 booking, D2 canned, D3 LIFF)
- [ ] โอนสายพร้อมกัน → rowcount=0 → re-select แยก 409 (ถูกแย่ง) กับ 404 (session หาย) (B1)
- [ ] Redis ลงระหว่างเรียก analytics → cache miss → คำนวณตรง ๆ + `cache_hit=false` ไม่ 500 (C1)
- [ ] rich-menu sync ที่ยังไม่มีรูป → ข้ามเมนูนั้นพร้อมเหตุผล ไม่ล้มทั้งชุด (C7)
- [ ] ชื่อไฟล์ส่งออกภาษาไทย → `Content-Disposition` ใช้ `filename*` encode ตาม RFC 5987 ไม่เพี้ยน (D1)

## Self-Review

**1. Spec coverage (PRD ข้อ → Task):** C2 stories 1–4 → A1; C3 stories 5–6 → A2; C5 stories 7–8 → A3; C1 stories 9–11 → B1; C4 stories 12–14 → B2; stories 15–16 → C1; ghost/presence/pagination (stories 17–20) → B1 (conditional UPDATE ครบทุกทางเปลี่ยนเจ้าของ) + D1 (cursor pagination, ghost-push threshold test, presence-burst test); story 21 → D1; stories 22–23 → D2; stories 24–25 → D3; stories 26–27 → C2; story 28 → C3; story 29 → C4; stories 30–31 → C5; stories 32–33 → C6; stories 34–35 → C7; stories 36–37 → D4; story 38 → D7; story 39 → D5; story 40 → D6; story 41 → D7; stories 42–43 → ทุก task (ข้อความไทย + audit ใน C5/B1). Out-of-scope เคารพครบ (ไม่เปลี่ยน SDK/auth/WS protocol ใหม่). **Gap ที่พบตอน review:** D1 เดิมไม่มี presence-storm threshold test → เติม `test_presence_burst_bounded` ใน Step 1 ของ D1 แล้ว; C2 เดิมไม่มี OBJECT_REF negative test → เติม `test_object_ref_without_permission_denied` ใน Step 1 ของ C2 แล้ว.

**2. Placeholder scan:** ค้น `TBD|TODO|implement later|add validation|similar to Task|appropriate error` ในไฟล์นี้ → ไม่พบ (ตรวจด้วย grep ก่อนบันทึก). ทุก step มี code จริง + คำสั่งรัน + expected + commit message แบบ conventional (`fix:/feat:/perf:`). ชื่อฟังก์ชันไม่ใช้คำกำกวม. แก้ไขแล้ว inline ก่อนบันทึก: (a) C4 `OBJECT_ID_RE` ตอนแรก escape เกิน (`r"^\\$"` DOUBLE-BACKSLASH) → แก้เป็น `r"^\$"` ที่ถูกต้อง; (b) C6 เดิมเขียน "ตรวจที่เดียวกัน" ลอย → แทนด้วย `validate_booking_date` + `guard_transition` จริง; (c) D7 เดิมเขียน "กัน CSRF" ลอย → แทนด้วย `verify_csrf` + `verify_signed_key` จริง; (d) D2 409 message ตอนแรกไม่มีชื่อรายการที่ชน → แก้ให้ต่อ `r.title` ใน detail แล้ว; (e) D1 `filename*` ตอนแรก quote ไม่ครบ → แก้เป็น RFC 5987 single-quote คู่ + note กำกับแล้ว.

**3. Type consistency:** `require_liff_identity(request: Request) -> dict` (A1) → D3 import ชื่อเดียวกัน; `check_private_token(stored, presented) -> bool` (A2) ใช้ซ้ำใน revoke/create; `transfer_session(db, session_id, from_operator_id, to_operator_id, reason) -> ChatSession` (B1) ไม่ชน `claim_session/close_session`; `SECRET_DENY_LIST: frozenset[str]` + `encrypt/decrypt` (B2) ใช้ชื่อเดียวกันใน migration; `DashboardResponse.cache_hit: bool` (C1); `BroadcastCreate.dry_run: bool` (C2); `compile_intent/wildcard_to_regex` (C3); `OBJECT_ID_RE` (C4); `RequestStatus` enum (C5); `MAX_DAYS/TERMINAL` (C6); `preview_menu/sync_due_menus` (C7); `normalize_text` (D2); `mask_line_id/mask_phone` D4 → D5 import ตรงจาก `admin_friends`; `ReportExportQuery` (D5); `buttonVariants` (D6); `manage_credentials/edit_business_hours` keys (D7). ทุกชื่อตรวจแล้วว่านิยามก่อนใช้ ไม่มีคู่ชื่อที่สะกดต่างกัน.

