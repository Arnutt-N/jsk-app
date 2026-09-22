# LINE Audit Fix Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Summary

ปิดช่องโหว่ Critical C1–C5 และแก้ปัญหา High ที่ระบุใน PRD โดยแบ่งงานเป็น
Wave A–D และใช้ TDD แบบ red → green → regression ต่อ task.

## Metadata

- **Complexity:** XL — 20 tasks across backend, database migration, admin UI, and frontend.
- **Source PRD:** `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
- **PRD Phase:** Research-only audit findings → implementation remediation plan.
- **Branch:** `feat/feature-line-audit-fix-map`.
- **Execution contract:** every task below has explicit `ACTION`, `IMPLEMENT`,
  `MIRROR`, `VALIDATE`, and `GOTCHA` fields in addition to its detailed steps.

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
- Test conventions (ทุก task): `test_client` คือ sync `TestClient` (ห้าม `await test_client.*` — ดู `backend/tests/test_liff_token.py:147-160`); งาน admin ใช้ `app.dependency_overrides[deps.get_current_user]` คืน `SimpleNamespace(id, role=UserRole.*, is_active=True)` แล้ว `clear()` ทุกครั้ง (ดู `backend/tests/test_module_permission_endpoints.py:83-107` — ไฟล์นี้ override `get_current_user` ตรง ๆ; อย่าอ้าง test_admin_requests_endpoints ซึ่ง override `get_current_admin`/`get_current_manager`); งาน DB ใช้ `_fresh_engine()` + NullPool recipe จาก `backend/tests/test_liff_token.py:37-44` (ห้าม reuse pool ของ app ข้าม event loop); ห้าม import helper ข้าม test module (ไม่มี `__init__.py`) — copy สูตรสั้นสั้นไว้ในไฟล์ test นั้นนั้น; `conftest.py` มีแค่ `app/test_client/_reset_http_rate_limits/drain_auth_responses/auth_websocket` (`backend/tests/conftest.py:80-154) — fixture อื่นทุกตัวต้องนิยามเต็มใน task นี้; fixture ที่เป็น `async def` ต้องใช้ `@pytest_asyncio.fixture` เสมอ (repo ใช้ strict mode ไม่มี `asyncio_mode` — ดู precedent `backend/tests/test_booking_create_concurrency.py:91-97`)

## Global Validation Contract

- **Backend gate:** from `backend/`, run the task Step 4 and Step 6 pytest
  commands with the repository virtual environment; migration tasks also run
  the stated Alembic upgrade → downgrade → upgrade cycle.
- **Frontend gate:** from `frontend/`, run `npm run test:unit`,
  `npx tsc --noEmit`, `npm run lint`, and `npm run build` after any task that
  changes frontend code and once again before the Wave D merge.
- **Static/source gate:** run `git diff --check` and inspect only the files
  listed by the task's Step 5 `git add`; unrelated dirty/untracked work stays
  untouched.

---

## Step-by-Step Tasks

Each task below is self-contained: `ACTION` states the outcome, `IMPLEMENT`
points to the production change and its detailed step, `MIRROR` identifies the
existing repository pattern to copy, `VALIDATE` identifies the exact red/green
and regression commands, and `GOTCHA` records the task-local risk.

## File Structure

### Wave A — Critical security (ทำก่อนทุก Wave บนไฟล์ที่ชน)

### Task A1: LIFF strict default true + ห้ามเขียน DB เมื่อไม่มีตัวตน (residual contract after d5b6491)

**ACTION:** ยืนยัน contract ที่ปฏิเสธ LIFF write ทุกชนิดที่ไม่มี token ที่ยืนยันแล้ว แม้ตั้ง strict=false และเก็บเฉพาะ test work ที่ยังเหลือ.
**IMPLEMENT:** production guard, env examples และ strict no-write test ที่จำเป็นลงไปแล้วใน `d5b6491`; task นี้ปรับเฉพาะ residual media/debt contract tests ตาม Step 3.
**MIRROR:** ใช้ `verify_liff_token()` และ `_fresh_engine()` จาก `backend/app/api/v1/endpoints/liff.py:31-52` และ `backend/tests/test_liff_token.py:43-44`.
**VALIDATE:** Step 2 ต้องยืนยันว่า guard ที่ลงไปแล้วผ่าน และแยก residual media/debt failures; Step 4 ต้องผ่าน strict/token/media/debt/config tests; Step 6 ต้องผ่าน LIFF regression suite.
**GOTCHA:** `LIFF_STRICT_MODE=false` เหลือเพื่อ observability/compatibility เท่านั้น ห้ามคืนพฤติกรรมเขียน DB แบบ `LIFF-unverified`.

**Current branch baseline:** `d5b6491` เพิ่ม `require_liff_identity()` และบังคับใช้กับทั้งสาม write route แล้ว รวมถึง env examples และ `test_liff_strict_no_write.py`; executor ห้ามทำ production guard ชุดเดิมซ้ำ.

**Files:**
- Reference (already landed in `d5b6491`): `backend/app/api/v1/endpoints/liff.py`
- Reference: `backend/app/core/config.py` (`LIFF_STRICT_MODE: bool = True` มีอยู่แล้วที่ config.py:50 — ไม่แก้ไฟล์นี้)
- Reference (already aligned in `d5b6491`): `backend/.env.development.example`, `backend/.env.production.example`, `backend/tests/test_liff_token.py`, `backend/tests/test_liff_strict_no_write.py`
- Modify: `backend/tests/test_liff_media_upload.py` (B1 ข้อความ 401 + B7 strict-off no-token contract)
- Modify: `backend/tests/test_liff_debt_mediation.py` (missing-token และ transition-mode contract)
- Test: residual contract suite above; no new production guard file

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

- [ ] **Step 2: Confirm the landed guard and identify residual contract failures**

Run: `python -m pytest tests/test_liff_strict_no_write.py tests/test_liff_token.py tests/test_liff_media_upload.py tests/test_liff_debt_mediation.py tests/test_config_migration_controls.py -v` (workdir `backend/`)
Expected: `test_liff_strict_no_write.py`, token, and config cases pass against the landed guard; only the known residual media/debt contract assertions may be RED until Step 3. Do not require a new RED result for the already-landed guard.

- [ ] **Step 3: Align residual contract tests (production guard already landed)**

**Implementation status:** the `require_liff_identity()` snippet and its three route call sites below are a reference to the implementation already committed in `d5b6491`, not new work in this task. Do not edit `liff.py`, env examples, or `test_liff_strict_no_write.py` unless a failing residual test proves the current contract is inconsistent.

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

บล็อก guard และการแทนที่ call sites ของทั้งสาม endpoint (`upload_liff_media` liff.py:80-96, `create_service_request` liff.py:143-159, `create_debt_mediation_request` liff.py:273-290) ด้านล่างเป็น reference ของ `d5b6491` เท่านั้น ไม่ต้องแก้ซ้ำ:

```python
    line_user_id = await require_liff_identity(x_liff_id_token)
    source_details = {"source": "LIFF v2"}  # debt-mediation ใช้ {"source": "LIFF"} ตามเดิม (liff.py:283)
```

`backend/tests/test_liff_token.py` case1 ถูก align แล้วใน `d5b6491`; ใช้เป็น reference เท่านั้นและห้ามเปลี่ยนกลับไปคาดหวัง 201/body-fallback.

```ini
# backend/.env.development.example + backend/.env.production.example
LIFF_STRICT_MODE=true
# หมายเหตุ: ตั้ง false ก็ยังตอบ 401 (ไม่มีโหมดเขียน DB อีกต่อไป) rollback จริง = redeploy รุ่นก่อน
```

แก้เฉพาะ residual contract tests เดิมที่ยังสะท้อน transition mode ก่อน A1:

- `test_liff_media_upload.py::test_b1_strict_on_no_token_returns_401_without_db_write` ต้องคาดหวังข้อความ `กรุณายืนยันตัวตนผ่าน LINE ก่อนยื่นคำร้อง` แทน `LIFF ID token required`.
- เปลี่ยนชื่อ `test_b7_strict_off_no_token_accepted` เป็น `test_b7_strict_off_no_token_rejected_without_db_write`; เมื่อ `LIFF_STRICT_MODE=false` และไม่มี token ต้องได้ 401 และจำนวน `MediaFile` ต้องไม่เพิ่ม (ลบ assertion การอัปโหลดสำเร็จ/teardown row เดิมออก).
- `test_liff_debt_mediation.py::test_missing_token_rejected_in_strict_mode` ต้องคาดหวังข้อความ 401 ภาษาไทยเดียวกัน.
- เปลี่ยนชื่อ `test_unverified_submission_allowed_in_transition_mode` เป็น `test_unverified_submission_rejected_even_in_transition_mode`; ตั้ง strict=false แล้วไม่มี token ต้อง raise `HTTPException(401)`, ไม่เรียก `db.add`, และไม่พึ่งพา `resolve_by_line_id` หรือ `friend_service`.

เหตุผลของ residual test contract: A1 ที่ลงไปแล้วเรียก `require_liff_identity()` ในทั้งสาม LIFF write endpoints (`media`, `service-requests`, `debt-mediation`) ดังนั้น flag `LIFF_STRICT_MODE=false` เหลือไว้เพื่อ compatibility/config observability เท่านั้น ไม่อนุญาตให้เขียนข้อมูลโดยไม่มี token อีกต่อไป.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_liff_strict_no_write.py tests/test_liff_token.py tests/test_liff_media_upload.py tests/test_liff_debt_mediation.py tests/test_config_migration_controls.py -v`
Expected: PASS ทั้งหมด (case1 และ contract tests ของ media/debt ที่แก้แล้วต้องเขียว)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_liff_media_upload.py backend/tests/test_liff_debt_mediation.py
git commit -m "test(liff): align strict-off residual contracts"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_liff_media_upload.py tests/test_liff_debt_mediation.py tests/test_service_request_liff_validation.py -v`
Expected: PASS — ฟอร์ม LIFF ทั้งสามยังผ่านเมื่อมี token ถูกต้อง และ contract tests ยืนยันว่าไม่มี token จะถูกปฏิเสธทั้ง strict=true และ strict=false โดยไม่เขียน DB

### Task A2: Media private token gate — ว่างชนว่างต้องไม่ผ่าน + preview ส่ง token

**ACTION:** ทำให้ไฟล์ private ต้องมี token จริงทั้งสองฝั่งและให้ preview ส่ง token ไปด้วย.
**IMPLEMENT:** เพิ่ม `check_private_token()` ใน `media.py` และรวม token ใน `buildMediaUrl()` ตาม Step 3.
**MIRROR:** คง `secrets.compare_digest` และ serialization/preview conventions จาก `backend/app/api/v1/endpoints/media.py:137-159`.
**VALIDATE:** Step 2 ต้องจับ empty-token bypass; Step 4 ต้องผ่าน private-gate/upload tests; Step 6 ต้องผ่าน webhook/rich-menu media regression.
**GOTCHA:** ห้ามใช้ `or ""` เป็นหลักฐานว่า token ถูกต้อง; private file ที่ไม่มี token ต้อง 403 เสมอ.

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

**ACTION:** ล็อก detailed/websocket health ให้ admin-only และไม่ส่งข้อความ exception ดิบออก API.
**IMPLEMENT:** ใส่ dependency auth ในสอง route และ log exception ฝั่ง server พร้อมข้อความกลางตาม Step 3.
**MIRROR:** คง public basic health และใช้ gate แบบ `get_current_admin` จาก `pseudonym_gate_status()` ใน `backend/app/api/v1/endpoints/health.py:54-64`.
**VALIDATE:** Step 2 ต้อง fail เมื่อ anonymous เรียก route; Step 4 และ Step 6 ต้องผ่าน hardening/watchdog/startup tests.
**GOTCHA:** `/health` basic ยัง public ได้ แต่ห้ามมี `str(e)` หรือ `*_error` ที่เปิดเผย host/password; อย่าล็อก pseudonym gate เดิมซ้ำ.

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

**ACTION:** ทำให้การโอนแชทแข่งกันมีผู้ชนะได้คนเดียวและแยก 409/404 ถูกต้อง.
**IMPLEMENT:** เปลี่ยน transfer mutation เป็น conditional `UPDATE ... WHERE` ตรวจ rowcount และ map conflict ตาม Step 3.
**MIRROR:** ใช้ atomic claim pattern จาก `backend/app/services/live_chat_service/sessions.py:34-68` และ error mapping เดิมใน WS/admin handlers.
**VALIDATE:** Step 2 ต้องแสดง concurrent winner สองคนก่อนแก้; Step 4/6 ต้องผ่าน race/session choreography/operator tests.
**GOTCHA:** `rowcount=0` อาจหมายถึงถูกแย่งหรือ session หาย ต้อง re-select ก่อนเลือก 409 หรือ 404; ห้ามตอบ 409 เหมารวม.

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

**ACTION:** ห้ามเก็บ secret ใหม่ใน SystemSetting และย้ายค่าที่มีอยู่ไป Credential แบบถอดกลับตรวจได้.
**IMPLEMENT:** เพิ่ม deny-list/masking และ migration backup → encrypt → verify → mask พร้อม downgrade restore ตาม Step 3.
**MIRROR:** ใช้ `credential_service.encrypt_credentials/decrypt_credentials()` ที่ `backend/app/services/credential_service.py:74-82` และ `model_validate().model_copy()` precedent ใน settings/admin responses.
**VALIDATE:** Step 2 ต้อง RED; Step 4/6 ต้องผ่าน migration/credential tests และ upgrade → downgrade → upgrade cycle.
**GOTCHA:** ต้องยืนยัน Alembic head ณ เวลารันและเก็บ backup ของค่าดั้งเดิมก่อนเปลี่ยนแปลง; ห้ามแสดง secret ใน output/test log.

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


def test_migrated_payload_shapes_are_dicts():
    # source-faithful: CredentialService expects dict -> JSON -> Fernet
    # (credential_service.py:74-82). Bare-string rows would break reads.
    expected = {
        "LINE_CHANNEL_ACCESS_TOKEN": ("LINE", {"channel_access_token": "tok"}),
        "LINE_CHANNEL_SECRET": ("LINE", {"channel_secret": "sec"}),
        "TELEGRAM_BOT_TOKEN": ("TELEGRAM", {"bot_token": "tok"}),
        "TELEGRAM_CHAT_ID": ("TELEGRAM", {"chat_id": "123"}),
        "N8N_API_KEY": ("CUSTOM", {"value": "k"}),
        "N8N_WEBHOOK_SECRET": ("CUSTOM", {"value": "s"}),
    }
    for key, (provider, payload) in expected.items():
        assert isinstance(payload, dict)
        enc = credential_service.encrypt_credentials(payload)
        assert credential_service.decrypt_credentials(enc) == payload
    # root keys stay env-only: never migrated, never backed up as plaintext
    assert "ENCRYPTION_KEY" not in expected and "LINE_ID_HMAC_KEY" not in expected


@pytest.mark.asyncio
async def test_downgrade_preserves_preexisting_credential():
    # seed one pre-existing Credential WITHOUT migrated_by marker;
    # downgrade must preserve it (marker-scoped DELETE only).
    # (test นี้ seed ไว้เป็นหลักฐาน — assert จริงอยู่ใน Step 6
    #  หลัง upgrade/downgrade/upgrade ว่าของเก่าอยู่ครบ)
    from app.models.credential import Credential
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(Credential(
            name="PRE_EXISTING_LINE", provider="LINE",
            credentials=credential_service.encrypt_credentials(
                {"channel_access_token": "keep-me"}),
            is_active=True, is_default=False))
        await db.commit()
        # cleanup กันพังกลางทาง: ลบ seed ออกหลังเทส
        seeded = (await db.execute(
            select(Credential).where(
                Credential.name == "PRE_EXISTING_LINE"))
        ).scalar_one_or_none()
        if seeded is not None:
            await db.delete(seeded)
            await db.commit()
    await engine.dispose()


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
"""one-shot: move secret SystemSetting rows into encrypted Credential rows.

Payload contract (source-faithful to credential_service.py:74-82):
- CredentialService.encrypt_credentials(dict) -> json.dumps(dict) -> Fernet.
- decrypt_credentials(str) -> dict. Bare-string rows would break normal reads.
- Per-key dict shape:
  LINE_CHANNEL_ACCESS_TOKEN -> provider LINE, {"channel_access_token": value}
  LINE_CHANNEL_SECRET -> provider LINE, {"channel_secret": value}
  TELEGRAM_BOT_TOKEN -> provider TELEGRAM, {"bot_token": value}
  TELEGRAM_CHAT_ID -> provider TELEGRAM, {"chat_id": value}
  N8N_API_KEY -> provider CUSTOM, {"value": value}
  N8N_WEBHOOK_SECRET -> provider CUSTOM, {"value": value}
- Root keys ENCRYPTION_KEY / LINE_ID_HMAC_KEY are NEVER migrated here:
  they stay env-only, are deleted from SystemSetting if present, and are
  documented in Step 3 notes. Do not encrypt a root key with itself.
Backup contract (long-lived but locked):
- Table _secret_migration_backup stores the Fernet-encrypted blob (never
  plaintext) + key name + setting id + migrated_by revision + created_at.
- Access requires KEY_MANAGE_CREDENTIALS (created in D7 plan:3697-3711 — Wave D, after Wave B; until D7 lands, backup-table access is manual/DB-admin only, every read/purge writes audit log); every read/purge writes audit log.
- Purge is explicit only: `DELETE FROM _secret_migration_backup WHERE ...`
  after operator confirmation. No auto-DROP on upgrade. Downgrade keeps the
  backup (does not DROP) so upgrade -> downgrade -> upgrade is repeatable.
Rollback ownership:
- Each Credential row created here sets metadata {"migrated_by": revision}.
- Downgrade deletes ONLY rows with that marker, then restores SystemSetting
  plaintext from the decrypted backup. Pre-existing Credentials are preserved.
  Test must seed one pre-existing Credential and assert it survives.
"""
import os
from alembic import op
import sqlalchemy as sa
from cryptography.fernet import Fernet

revision = "a7b8c9d0e1f2"
down_revision = "t1u2v3w4x5y6"  # verified head 2026-09-13 (ยืนยันซ้ำด้วย `alembic heads` ก่อน merge)

_DENY_MIGRATE = (
    "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    "N8N_API_KEY", "N8N_WEBHOOK_SECRET",
)
# Root keys: never encrypted with themselves, never inserted into credentials.
# They stay env-only; if present in SystemSetting they are deleted (value is
# NOT backed up — operator must confirm env already holds them).
_ROOT_KEYS = ("ENCRYPTION_KEY", "LINE_ID_HMAC_KEY")
_MIGRATED_BY = revision


def _payload_for(key: str, value: str) -> tuple[str, dict]:
    if key == "LINE_CHANNEL_ACCESS_TOKEN":
        return ("LINE", {"channel_access_token": value})
    if key == "LINE_CHANNEL_SECRET":
        return ("LINE", {"channel_secret": value})
    if key == "TELEGRAM_BOT_TOKEN":
        return ("TELEGRAM", {"bot_token": value})
    if key == "TELEGRAM_CHAT_ID":
        return ("TELEGRAM", {"chat_id": value})
    return ("CUSTOM", {"value": value})


def upgrade() -> None:
    import json

    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY must be set before running this migration")
    cipher = Fernet(key.encode())
    conn = op.get_bind()

    # 1) backup table แบบเก็บยาวแต่ล็อกแน่น: เก็บเฉพาะ blob เข้ารหัสแล้ว
    # ห้ามเก็บ plaintext. เข้าดูต้องมี KEY_MANAGE_CREDENTIALS + audit log
    # (key สร้างใน D7 Wave D — ก่อนหน้านั้นใช้ manual/DB-admin + audit log).
    # ลบแบบ explicit เท่านั้น (ห้าม auto-DROP). downgrade ไม่ DROP เพื่อให้
    # upgrade -> downgrade -> upgrade ทำซ้ำได้.
    # `"key"`/`"value"` ต้อง quote เสมอ — `key` เป็น reserved word ของ Postgres
    conn.execute(sa.text(
        'CREATE TABLE IF NOT EXISTS _secret_migration_backup ('
        'setting_id INTEGER PRIMARY KEY, '
        '"key" TEXT NOT NULL, '
        'enc_value TEXT NOT NULL, '
        'migrated_by TEXT NOT NULL, '
        'created_at TIMESTAMPTZ DEFAULT now())'
    ))

    # 1b) root keys อยู่ env-only: ถ้าหลงใน SystemSetting ให้ลบทิ้ง
    # (ไม่ backup — operator ต้องยืนยันว่า env มีค่าแล้วก่อนรัน)
    conn.execute(sa.text(
        'DELETE FROM system_settings WHERE "key" = ANY(:keys)'
    ), {"keys": list(_ROOT_KEYS)})

    # 2) อ่านค่า secret 6 ตัวที่ต้องย้าย (idempotent: รันซ้ำไม่สร้างซ้ำ)
    rows = conn.execute(sa.text(
        'SELECT id, "key", "value" FROM system_settings WHERE "key" = ANY(:keys)'
    ), {"keys": list(_DENY_MIGRATE)}).mappings().all()
    for row in rows:
        provider, payload = _payload_for(row["key"], str(row["value"] or ""))
        # verify Fernet(JSON(dict)) roundtrip ก่อน insert (source-faithful)
        raw_json = json.dumps(payload)
        enc = cipher.encrypt(raw_json.encode()).decode()
        if json.loads(cipher.decrypt(enc.encode()).decode()) != payload:
            raise RuntimeError(f"roundtrip verify failed for {row['key']}")
        # backup: เก็บ blob เข้ารหัสของ {"value": plaintext} (ไม่ใช่ plaintext)
        backup_enc = cipher.encrypt(
            json.dumps({"value": str(row["value"] or "")}).encode()
        ).decode()
        conn.execute(sa.text(
            'INSERT INTO _secret_migration_backup (setting_id, "key", enc_value, migrated_by) '
            'VALUES (:sid, :key, :enc, :by) '
            'ON CONFLICT (setting_id) DO UPDATE SET enc_value = EXCLUDED.enc_value, '
            '"key" = EXCLUDED."key", migrated_by = EXCLUDED.migrated_by'
        ), {"sid": row["id"], "key": row["key"], "enc": backup_enc, "by": _MIGRATED_BY})
        # insert Credential แบบ idempotent: ข้ามถ้ามี marker ของ revision นี้แล้ว
        exists = conn.execute(sa.text(
            "SELECT id FROM credentials WHERE name = :name "
            "AND metadata->>'migrated_by' = :by LIMIT 1"
        ), {"name": row["key"], "by": _MIGRATED_BY}).scalar_one_or_none()
        if exists is None:
            conn.execute(sa.text(
                'INSERT INTO credentials (name, provider, credentials, metadata, is_active, is_default) '
                "VALUES (:name, :provider, :credentials, "
                "jsonb_build_object('migrated_by', :by), true, false)"
            ), {"name": row["key"], "provider": provider,
                "credentials": enc, "by": _MIGRATED_BY})
        conn.execute(sa.text(
            'UPDATE system_settings SET "value" = \'***MIGRATED***\' WHERE id = :id'
        ), {"id": row["id"]})


def downgrade() -> None:
    import json

    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY must be set before running this downgrade")
    cipher = Fernet(key.encode())
    conn = op.get_bind()
    # restore จาก backup ที่ถอดรหัสแล้วเท่านั้น — ไม่ถอด Credential กลับอัตโนมัติ.
    # ลบเฉพาะ Credential ที่มี marker migrated_by ของ revision นี้เท่านั้น
    # ของเก่าที่มีก่อน migration ต้องอยู่ครบ. ไม่ DROP backup (เก็บยาว).
    rows = conn.execute(sa.text(
        'SELECT setting_id, "key", enc_value FROM _secret_migration_backup '
        'WHERE migrated_by = :by'
    ), {"by": _MIGRATED_BY}).mappings().all()
    for row in rows:
        plain = json.loads(cipher.decrypt(row["enc_value"].encode()).decode())["value"]
        conn.execute(sa.text(
            'UPDATE system_settings SET "value" = :value WHERE id = :id'
        ), {"value": plain, "id": row["setting_id"]})
    conn.execute(sa.text(
        "DELETE FROM credentials WHERE metadata->>'migrated_by' = :by"
    ), {"by": _MIGRATED_BY})
    # NOTE: ตั้งใจไม่ DROP _secret_migration_backup — purge แบบ explicit เท่านั้น:
    #   DELETE FROM _secret_migration_backup WHERE migrated_by = 'a7b8c9d0e1f2';
    #   (ต้องมี KEY_MANAGE_CREDENTIALS + audit log + operator confirm;
    #    key สร้างใน D7 — ก่อนหน้านั้น manual/DB-admin + audit log)
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
Expected: PASS — รหัสไม่หาย (verify แบบ executable: ก่อน downgrade `SELECT count(*) FROM _secret_migration_backup WHERE migrated_by='a7b8c9d0e1f2'` ต้อง >0 และคงเดิมหลัง downgrade เพราะตั้งใจไม่ DROP; ส่วน credentials ตรวจว่า `SELECT count(*) FROM credentials WHERE metadata->>'migrated_by'='a7b8c9d0e1f2'` เป็น 0 หลัง downgrade แล้วกลับมาเท่าเดิมหลัง upgrade รอบสอง; ของเก่า PRE_EXISTING_* ต้องอยู่ครบทุกขั้น)


## Wave C — High backend (เริ่มหลัง Wave A merge บนไฟล์ที่ชน: liff.py / media.py)

### Task C1: Analytics single-query dashboard + percentile ใน SQL + response schema

**ACTION:** ผ่าตัดใหญ่ — รวม dashboard เป็น data query ครั้งเดียว (+auth/ambient แยก), ย้าย percentile เข้า SQL, และล็อก response shape พร้อม cache-hit.
**IMPLEMENT:** query รวมชุดเดียวผ่าน CTE/subquery + percentile_cont ใน SQL ตาม Step 3 โดยต้อง fallback เมื่อ Redis ล่ม.
**MIRROR:** ยึด route shape เดิมจาก `admin_analytics.py:67` แต่ service เปลี่ยนภายในจาก compose-5-fns เป็น single-query (เก็บ fns เดิมไว้ให้ route อื่นใช้ ห้ามลบ).
**VALIDATE:** Step 2 ต้องแสดง query/cache gap; Step 4/6 ต้องผ่าน performance/service tests รวม empty-set และ Redis-down cases. งบ query: data statements ต้องไม่เกิน 2 (1 หลัก + 1 สำรองเมื่อ planner แยก CTE) — ถ้าเกินถือว่า FAIL ต้องกลับไปรวมใหม่ ไม่ใช่แก้เทสให้ผ่าน.
**GOTCHA:** ห้ามเปลี่ยน route เป็น non-admin; empty percentile ต้องได้ 0 ไม่ใช่ 500 และ cache miss จาก Redis down ต้องไม่ล้ม request. ผ่าตัดใหญ่ query เดียวซับซ้อน — ห้ามลบ helper เดิม (live-kpis/operator-performance/hourly ยังใช้อยู่) และต้องคง shape เดิมทุก field + เพิ่ม generated_at/cache_hit เท่านั้น.

**Files:**
- Modify: `backend/app/services/analytics_service.py`
- Modify: `backend/app/api/v1/endpoints/admin_analytics.py`
- Create: `backend/app/schemas/analytics.py`
- Test: `backend/tests/test_analytics_perf.py`

**Interfaces (verified):**
- Consumes: `GET /api/v1/admin/analytics/dashboard?days=` (prefix `/admin/analytics` ใน api.py:54 + `@router.get("/dashboard")` ใน admin_analytics.py:67) gated `require_permission(KEY_VIEW_REPORTS)`; `analytics_service.get_dashboard(db, days)` (analytics_service.py:433-451) ประกอบจาก `get_kpi_trends` (:368) + `get_session_volume` (:251) + `get_conversation_funnel` (:302) + `get_peak_hours_heatmap` (:277) + `get_percentiles` (:333-367 — คำนวณใน Python ด้วย `_percentile` :670) — **ไม่มีคอลัมน์** `duration_seconds` ใน `ChatSession`; ช่วงเวลาจริงมาจาก `started_at/first_response_at/closed_at` (chat_session.py:29-33); `redis_client.get/setex/delete` (redis_client.py:77-132)
- Produces: percentile SQL ผ่าน `func.percentile_cont(...).within_group(func.extract("epoch", ...))`; cache Redis TTL 120s ต่อ `days`; `DashboardResponse` Pydantic ล็อก shape เดิม + `cache_hit: bool`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_analytics_perf.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_analytics_perf.py -v`
Expected: FAIL — ไม่มี field `cache_hit`/`generated_at` และ request ที่สองยิง query ซ้ำ (ยังไม่มี cache; percentile คำนวณใน Python ด้วย `_percentile` ดึงข้อมูลดิบมาหมด)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/schemas/analytics.py (Create)
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trends: dict
    session_volume: list[dict]
    peak_hours: list[dict]
    funnel: dict
    percentiles: dict
    generated_at: datetime
    cache_hit: bool = False
```

```python
# backend/app/services/analytics_service.py — แทน get_dashboard (:433-451)
# ผ่าตัดใหญ่: single data statement (scalar-subquery SELECT เดียว).
# เก็บ helpers เดิม (get_kpi_trends/get_session_volume/... ) ไว้ให้ route อื่น
# (live-kpis/operator-performance/hourly) — ห้ามลบ. get_dashboard เท่านั้นที่
# เปลี่ยนมาใช้ _get_dashboard_row() ด้านล่าง.
# เพิ่ม import ด้านบนไฟล์: import json (ของเดิมยังไม่มี json —
# ข้างล่างใช้ json.loads/json.dumps ถ้าไม่เพิ่มจะ NameError พังกลางทาง)
# + from sqlalchemy import and_, exists (ของเดิมมี and_, exists แล้วที่ :4 —
# ใช้ซ้ำได้ ไม่ต้องเพิ่ม); + from sqlalchemy.orm import aliased;
# + from sqlalchemy import literal_column (มีแล้วที่ :4);
# Message/MessageDirection/CsatResponse/child_column มี import แล้วที่ :9-15.
# (กันพังกลางทาง: ถ้าไฟล์จริงขาดตัวไหน ให้เพิ่มก่อนรัน — ห้าม NameError)
CACHE_TTL_SECONDS = 120


async def _get_dashboard_row(self, db: AsyncSession, days: int) -> dict:
    # Scalar-subquery SELECT เดียว: planner เห็นเป็น 1 statement.
    # ทุก metric เป็น scalar subquery — ห้าม await ข้างใน, ห้าม loop query.
    # window ใช้ started_at/claimed_at/first_response_at/closed_at/created_at
    # ตามของจริงใน chat_session.py/message.py (ไม่มี duration_seconds).
    # volume/heatmap ฝังเป็น JSON scalar subquery ใน statement เดียวกัน
    # (heatmap ใช้ Message.created_at dow/hour; volume ปั้น full date-range
    # ต่อใน Python จาก volume_json โดยไม่ยิง DB เพิ่ม).
    # trends ครบ 6 metrics แบบเดียวกับ get_kpi_trends() เดิม เพื่อให้
    # frontend analytics/page.tsx:66-82 + TrendBadge ไม่พัง.
    # (round-7 Minor): FCR trend ที่นี่ใช้ window today/yesterday (ตาม
    # get_kpi_trends) ส่วน calculate_fcr_rate(days=7) ฉบับ 7 วันยังคงแยกอยู่
    # ใน live-kpis — ไม่ใช่บั๊ก อย่าแก้ให้เหมือนกัน.
    now = datetime.now(timezone.utc)
    safe_days = max(1, min(days, 30))
    cutoff = now - timedelta(days=safe_days)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    frt_expr = func.extract("epoch", ChatSession.first_response_at - ChatSession.claimed_at)
    res_expr = func.extract("epoch", ChatSession.closed_at - ChatSession.started_at)
    # FCR aliases (aliased ChatSession x4 — add import:
    # from sqlalchemy import and_, exists; from sqlalchemy.orm import aliased)
    ClosedA = aliased(ChatSession)
    ReopenA = aliased(ChatSession)
    ClosedB = aliased(ChatSession)
    ReopenB = aliased(ChatSession)
    vol_day = func.date_trunc(literal_column("'day'"), ChatSession.started_at)
    vol_sub = (
        select(vol_day.label("day"), func.count(ChatSession.id).label("sessions"))
        .where(ChatSession.started_at >= today_start - timedelta(days=safe_days - 1))
        .group_by(vol_day)
        .subquery()
    )
    heat_sub = (
        select(
            func.extract("dow", Message.created_at).label("dow"),
            func.extract("hour", Message.created_at).label("hour"),
            func.count(Message.id).label("message_count"),
        )
        .where(Message.created_at >= cutoff)
        .group_by(func.extract("dow", Message.created_at),
                  func.extract("hour", Message.created_at))
        .subquery()
    )
    stmt = select(
        # trends 6 metrics (today + yesterday) แบบเดียวกับ get_kpi_trends
        select(func.count(ChatSession.id))
        .where(ChatSession.started_at >= today_start)
        .scalar_subquery().label("sessions_today"),
        select(func.count(ChatSession.id))
        .where(ChatSession.started_at >= yesterday_start,
               ChatSession.started_at < today_start)
        .scalar_subquery().label("yesterday_sessions"),
        select(func.avg(frt_expr))
        .where(ChatSession.first_response_at.isnot(None),
               ChatSession.claimed_at >= today_start)
        .scalar_subquery().label("avg_frt"),
        select(func.avg(frt_expr))
        .where(ChatSession.first_response_at.isnot(None),
               ChatSession.claimed_at >= yesterday_start,
               ChatSession.claimed_at < today_start)
        .scalar_subquery().label("yesterday_frt"),
        select(func.avg(res_expr))
        .where(ChatSession.status == SessionStatus.CLOSED,
               ChatSession.closed_at >= today_start)
        .scalar_subquery().label("avg_res"),
        select(func.avg(res_expr))
        .where(ChatSession.status == SessionStatus.CLOSED,
               ChatSession.closed_at >= yesterday_start,
               ChatSession.closed_at < today_start)
        .scalar_subquery().label("yesterday_res"),
        select(func.avg(CsatResponse.score))
        .where(CsatResponse.created_at >= today_start)
        .scalar_subquery().label("csat_avg"),
        select(func.avg(CsatResponse.score))
        .where(CsatResponse.created_at >= yesterday_start,
               CsatResponse.created_at < today_start)
        .scalar_subquery().label("yesterday_csat_avg"),
        # (closed_today/closed_yesterday เดิมถูกลบ — ใช้ fcr_today_total/
        # fcr_yest_total แทนแล้ว เพื่อไม่นับซ้ำใน statement เดียว)
        # FCR exact (same semantics as _fcr_rate: closed not reopened within
        # 24h). Total + OK counts per window, all inside this one statement.
        # Needs `aliased` import (add: from sqlalchemy.orm import aliased).
        # Reopen check mirrors _fcr_rate:132-167 via child_column() FK path.
        select(func.count(ClosedA.id))
        .where(ClosedA.status == SessionStatus.CLOSED,
               ClosedA.closed_at >= today_start)
        .scalar_subquery().label("fcr_today_total"),
        select(func.count(ClosedA.id))
        .where(ClosedA.status == SessionStatus.CLOSED,
               ClosedA.closed_at >= today_start,
               ~exists(select(ReopenA.id).where(and_(
                   child_column(ReopenA) == child_column(ClosedA),
                   ReopenA.started_at > ClosedA.closed_at,
                   ReopenA.started_at < ClosedA.closed_at + timedelta(hours=24)))))
        .scalar_subquery().label("fcr_today_ok"),
        select(func.count(ClosedB.id))
        .where(ClosedB.status == SessionStatus.CLOSED,
               ClosedB.closed_at >= yesterday_start,
               ClosedB.closed_at < today_start)
        .scalar_subquery().label("fcr_yest_total"),
        select(func.count(ClosedB.id))
        .where(ClosedB.status == SessionStatus.CLOSED,
               ClosedB.closed_at >= yesterday_start,
               ClosedB.closed_at < today_start,
               ~exists(select(ReopenB.id).where(and_(
                   child_column(ReopenB) == child_column(ClosedB),
                   ReopenB.started_at > ClosedB.closed_at,
                   ReopenB.started_at < ClosedB.closed_at + timedelta(hours=24)))))
        .scalar_subquery().label("fcr_yest_ok"),
        # Abandon exact (same as _abandonment_rate: abandoned /
        # (abandoned + claimed) * 100). Counts per window, percent in Python.
        select(func.count(ChatSession.id))
        .where(ChatSession.closed_at >= today_start,
               ChatSession.closed_by == "SYSTEM_TIMEOUT")
        .scalar_subquery().label("abd_today_abandoned"),
        select(func.count(ChatSession.id))
        .where(ChatSession.claimed_at >= today_start,
               ChatSession.claimed_at.isnot(None))
        .scalar_subquery().label("abd_today_claimed"),
        select(func.count(ChatSession.id))
        .where(ChatSession.closed_at >= yesterday_start,
               ChatSession.closed_at < today_start,
               ChatSession.closed_by == "SYSTEM_TIMEOUT")
        .scalar_subquery().label("abd_yest_abandoned"),
        select(func.count(ChatSession.id))
        .where(ChatSession.claimed_at >= yesterday_start,
               ChatSession.claimed_at < today_start,
               ChatSession.claimed_at.isnot(None))
        .scalar_subquery().label("abd_yest_claimed"),
        # funnel 3 ค่า (bot/human/resolved) ใน statement เดียวกัน
        select(func.count(func.distinct(child_column(Message))))
        .where(Message.created_at >= cutoff,
               Message.direction == MessageDirection.INCOMING,
               child_column(Message).isnot(None))
        .scalar_subquery().label("funnel_bot"),
        select(func.count(ChatSession.id))
        .where(ChatSession.started_at >= cutoff,
               ChatSession.claimed_at.isnot(None))
        .scalar_subquery().label("funnel_human"),
        select(func.count(ChatSession.id))
        .where(ChatSession.closed_at >= cutoff,
               ChatSession.status == SessionStatus.CLOSED)
        .scalar_subquery().label("funnel_resolved"),
        # volume/heatmap เป็น JSON scalar subquery ใน statement เดียวกัน
        select(func.coalesce(func.json_agg(
            func.json_build_object("day", vol_sub.c.day,
                                   "sessions", vol_sub.c.sessions)), "[]"))
        .select_from(vol_sub)
        .scalar_subquery().label("volume_json"),
        select(func.coalesce(func.json_agg(
            func.json_build_object("day_of_week", heat_sub.c.dow,
                                   "hour", heat_sub.c.hour,
                                   "message_count", heat_sub.c.message_count)), "[]"))
        .select_from(heat_sub)
        .scalar_subquery().label("heatmap_json"),
        select(func.percentile_cont(0.5)).within_group(frt_expr)
        .where(ChatSession.first_response_at.isnot(None), ChatSession.claimed_at >= cutoff)
        .scalar_subquery().label("frt_p50"),
        select(func.percentile_cont(0.9)).within_group(frt_expr)
        .where(ChatSession.first_response_at.isnot(None), ChatSession.claimed_at >= cutoff)
        .scalar_subquery().label("frt_p90"),
        select(func.percentile_cont(0.99)).within_group(frt_expr)
        .where(ChatSession.first_response_at.isnot(None), ChatSession.claimed_at >= cutoff)
        .scalar_subquery().label("frt_p99"),
        select(func.percentile_cont(0.5)).within_group(res_expr)
        .where(ChatSession.closed_at.isnot(None), ChatSession.closed_at >= cutoff)
        .scalar_subquery().label("res_p50"),
        select(func.percentile_cont(0.9)).within_group(res_expr)
        .where(ChatSession.closed_at.isnot(None), ChatSession.closed_at >= cutoff)
        .scalar_subquery().label("res_p90"),
        select(func.percentile_cont(0.99)).within_group(res_expr)
        .where(ChatSession.closed_at.isnot(None), ChatSession.closed_at >= cutoff)
        .scalar_subquery().label("res_p99"),
    )
    row = (await db.execute(stmt)).one()
    # volume/heatmap/funnel/trends ประกอบจาก row เดียว + Python shaping
    # (ไม่ยิง DB เพิ่ม): volume ปั้น full date-range จาก sessions_window,
    # heatmap/funnel ใช้ค่าที่มีใน row, trends ใช้ waiting/active/sessions_today
    # เทียบ yesterday ที่ฝังใน subquery เดียวกัน (ไม่เรียก get_kpi_trends ซ้ำ).
    return row._asdict()


async def get_dashboard(self, db: AsyncSession, days: int = 7) -> dict:
    key = f"analytics:dashboard:{days}"
    try:
        cached = await redis_client.get(key)
    except Exception:
        cached = None  # Redis-down -> คำนวณตรง ๆ (fail-open)
    if cached:
        data = json.loads(cached)
        data["cache_hit"] = True
        return data
    row = await self._get_dashboard_row(db, days)
    # ปั้นค่าต่อใน Python จาก row เดียว (ไม่ยิง DB เพิ่ม):
    # csat_pct = avg/5*100 ให้ตรง get_live_kpis เดิม;
    # FCR exact = ok/total*100 (same as _fcr_rate: no reopen in 24h);
    # abandon exact = abandoned/(abandoned+claimed)*100
    # (same as _abandonment_rate). Zero-division -> 0.0.
    row["csat_pct"] = (float(row["csat_avg"] or 0) / 5) * 100
    row["yesterday_csat_pct"] = (float(row["yesterday_csat_avg"] or 0) / 5) * 100
    _ft, _fo = (row["fcr_today_total"] or 0), (row["fcr_today_ok"] or 0)
    _yt, _yo = (row["fcr_yest_total"] or 0), (row["fcr_yest_ok"] or 0)
    row["fcr"] = ((_fo / _ft) * 100) if _ft else 0.0
    row["yesterday_fcr"] = ((_yo / _yt) * 100) if _yt else 0.0
    _aa, _ac = (row["abd_today_abandoned"] or 0), (row["abd_today_claimed"] or 0)
    _ya, _yc = (row["abd_yest_abandoned"] or 0), (row["abd_yest_claimed"] or 0)
    _at = _aa + _ac
    _yt2 = _ya + _yc
    row["abandon"] = ((_aa / _at) * 100) if _at else 0.0
    row["yesterday_abandon"] = ((_ya / _yt2) * 100) if _yt2 else 0.0
    def _trend(cur: float, prev: float) -> dict:
        delta = float(cur or 0) - float(prev or 0)
        return {"current": round(float(cur or 0), 2),
                "previous": round(float(prev or 0), 2),
                "delta": round(delta, 2),
                "delta_percent": round((delta / prev * 100), 1) if prev else 0.0}
    # volume/heatmap มาจาก JSON subquery ใน statement เดียวกัน (ไม่ยิง DB เพิ่ม):
    # row["volume_json"] = [{"day": iso, "sessions": n}, ...] ครบ days วัน
    # row["heatmap_json"] = [{"day_of_week": int, "hour": int, "message_count": n}, ...]
    # funnel_* / trend ครบ 6 metrics เพื่อให้ frontend analytics/page.tsx:66-82
    # + TrendBadge (metric: current/previous/delta/delta_percent) ไม่พัง
    payload = {
        "trends": {
            "sessions_today": _trend(row["sessions_today"], row["yesterday_sessions"]),
            "avg_first_response_seconds": _trend(row["avg_frt"], row["yesterday_frt"]),
            "avg_resolution_seconds": _trend(row["avg_res"], row["yesterday_res"]),
            "csat_percentage": _trend(row["csat_pct"], row["yesterday_csat_pct"]),
            "fcr_rate": _trend(row["fcr"], row["yesterday_fcr"]),
            "abandonment_rate": _trend(row["abandon"], row["yesterday_abandon"]),
        },
        "session_volume": row["volume_json"] or [],
        "peak_hours": row["heatmap_json"] or [],
        "funnel": {"bot_entries": row["funnel_bot"] or 0,
                   "human_handoff": row["funnel_human"] or 0,
                   "resolved": row["funnel_resolved"] or 0},
        "percentiles": {
            "frt": {"p50": round(row["frt_p50"] or 0, 1),
                    "p90": round(row["frt_p90"] or 0, 1),
                    "p99": round(row["frt_p99"] or 0, 1)},
            "resolution": {"p50": round(row["res_p50"] or 0, 1),
                           "p90": round(row["res_p90"] or 0, 1),
                           "p99": round(row["res_p99"] or 0, 1)},
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cache_hit": False,
    }
    try:
        await redis_client.setex(key, CACHE_TTL_SECONDS, json.dumps(payload, default=str))
    except Exception:
        pass  # Redis-down -> ไม่ล้ม request
    return payload
```

(คีย์ระดับบน + `percentiles.frt`/`resolution` ตรง shape เดิมของ `get_dashboard` (:433-451) และ `DashboardData` ใน `frontend/app/admin/analytics/page.tsx:66-82` — ห้าม rename (frontend ผูก `session_volume`/`peak_hours` อยู่); Redis ล่ม → `redis_client.get` คืน None → คำนวณตรง ๆ ตามพฤติกรรม redis_client.py:103-111)

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

**ACTION:** เพิ่ม preview/dry-run ที่ไม่สร้างงานหรือส่ง LINE, ทำ multicast retry แบบ bounded backoff + failed-token persistence, และเพิ่มปุ่มทดลองส่งฝั่ง UI.
**IMPLEMENT:** เพิ่ม request/response dry-run path, backoff + failed-token store ใน sender/scheduler, และปุ่ม preview ฝั่ง frontend ตาม Step 3.
**MIRROR:** ใช้ `resolve_object`, scheduling normalization และ chunking ที่มีอยู่ใน broadcast service ตาม interface refs ของ task.
**VALIDATE:** Step 2 ต้อง RED; Step 4/6 ต้องผ่าน dry-run/service/scheduler tests รวม timezone และ retry exhaustion.
**GOTCHA:** dry-run ห้ามสร้าง broadcast jobหรือเรียก push provider; retry ต้องมีเพดานและเก็บ failed token อย่างปลอดภัย.

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_broadcast.py`
- Modify: `backend/app/services/broadcast_service.py`
- Create: `backend/app/models/broadcast_failed_recipient.py` (failed-token store สำหรับ retry รอบหน้า)
- Create: `backend/alembic/versions/b8c9d0e1f2a3_broadcast_failed_recipients.py` (สร้างตาราง broadcast_failed_recipients + unique uq_broadcast_failed_recipient; downgrade DROP TABLE — กันพังกลางทาง: ไม่มี migration = UndefinedTable ตอน chunk แรกที่พัง)
- Test: `backend/tests/test_broadcast_dryrun.py`
- Modify: `frontend/app/admin/chatbot/broadcast/new/page.tsx` (เพิ่มปุ่มทดลองส่ง dry-run ขั้นตรวจสอบ)
- Modify: `frontend/app/admin/chatbot/broadcast/[id]/page.tsx` (แสดงผล preview + failed count)
- Test: `frontend/app/admin/chatbot/broadcast/__tests__/dryrun-button.test.tsx`

**Interfaces (verified):**
- Consumes: `BroadcastCreate(title, message_type: BroadcastType, content: dict, target_audience="all", target_filter)` (admin_broadcast.py:27-32); `POST /api/v1/admin/broadcasts` (api.py:62) gated `require_permission(KEY_MANAGE_BROADCAST)` DEFAULT {SUPER_ADMIN, ADMIN} (permissions.py:106); OBJECT_REF resolve มีอยู่แล้วผ่าน `resolve_object` (broadcast_service.py:158-165); `schedule_broadcast` normalize naive→UTC และปฏิเสธอดีตอยู่แล้ว (broadcast_service.py:229-245); multicast chunk 500/รอบ (broadcast_service.py:199-216)
- Produces: `dry_run: bool = False` ใน BroadcastCreate → POST ตอบ preview (200) โดยไม่ persist ไม่สร้าง audit; retry 3 รอบ exponential ต่อ multicast chunk + persist failed tokens ลง `broadcast_failed_recipient` (idempotent ตาม broadcast_id+token_hash) เพื่อ retry/ล้างรอบหน้า; ปุ่มทดลองส่งฝั่ง `new/page.tsx` + แสดง preview/failed ที่ `[id]/page.tsx`

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


@pytest.mark.asyncio
async def test_retry_exhaustion_persists_failed_tokens(test_client, monkeypatch):
    # mock multicast พังครบ 3 รอบ -> ต้องมี failed-token rows ถูกสร้าง
    # (idempotent: รันซ้ำไม่สร้างซ้ำ) + timezone ข้ามวันยังตรง
    import asyncio as _asyncio
    from app.services.broadcast_service import broadcast_service
    from app.models.broadcast import Broadcast, BroadcastType
    from app.models.broadcast_failed_recipient import BroadcastFailedRecipient
    calls = {"n": 0}

    async def _boom(*_a, **_k):
        calls["n"] += 1
        raise RuntimeError("LINE down")

    async def _no_sleep(_s):
        return None

    monkeypatch.setattr(broadcast_service, "api", SimpleNamespace(multicast=_boom))
    monkeypatch.setattr(_asyncio, "sleep", _no_sleep)
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            b = Broadcast(title="retry", message_type=BroadcastType.TEXT,
                          content={"text": "hi"}, target_audience="all",
                          target_filter={}, status="draft")
            db.add(b)
            await db.commit()
            await db.refresh(b)
            # RED: ก่อน implement send จะไม่ retry 3 รอบ และไม่มี failed rows
            out = await broadcast_service.send_broadcast(db, b)
            assert calls["n"] >= 3, "retry must attempt multicast 3 times before giving up"
            assert out.failure_count and out.failure_count > 0
            rows = (await db.execute(
                select(BroadcastFailedRecipient).where(
                    BroadcastFailedRecipient.broadcast_id == b.id))
            ).scalars().all()
            assert len(rows) > 0
            # cleanup กันพังกลางทาง
            for r in rows:
                await db.delete(r)
            await db.delete(b)
            await db.commit()
    finally:
        await engine.dispose()
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
# เพิ่ม import ด้านบนไฟล์: from fastapi.responses import JSONResponse
# + from types import SimpleNamespace
# (dry-run ต้องเลี่ยง response_model=BroadcastResponse/201 ของ decorator — คืน JSONResponse ตรง ๆ)
    if payload.dry_run:
        # dry-run preview (round-7 Important): _build_messages() ของจริงรับ
        # Broadcast ORM (broadcast_service.py:111 — เข้าถึง .content/.message_type/
        # .title/.id). ที่นี่ส่ง SimpleNamespace ที่มี 4 ฟิลด์นั้นครบ + id=0
        # (OBJECT_REF branch ใช้ broadcast.id แค่ตอน log warning — id=0 ปลอดภัย).
        # ตอน implement ต้องยืนยันว่า shape นี้ไม่แตกก่อน scheduler (ไม่ต้องแก้แผน).
        preview = SimpleNamespace(
            id=0, title=payload.title,
            message_type=payload.message_type, content=payload.content,
        )
        messages = await broadcast_service._build_messages(preview, db)
        estimated = None
        if payload.target_audience != "all":
            estimated = len((payload.target_filter or {}).get("user_ids", []))
        return JSONResponse(
            status_code=200,
            content=BroadcastDryRunResponse(
                title=payload.title,
                message_type=payload.message_type.value,
                estimated_recipients=estimated,
                messages_valid=bool(messages),
            ).model_dump(mode="json"),
        )
```

```python
# backend/app/models/broadcast_failed_recipient.py (ไฟล์ใหม่ — กันพังกลางทาง:
# เก็บ hash ไม่เก็บ token จริง; unique กันซ้ำ; Alembic revision ใหม่ต้องมีใน task นี้)
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base


class BroadcastFailedRecipient(Base):
    __tablename__ = "broadcast_failed_recipients"

    id = Column(Integer, primary_key=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    token_hash = Column(String(64), nullable=False)  # sha256 hex ของ LINE user id
    attempt_count = Column(Integer, default=3, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("broadcast_id", "token_hash",
                         name="uq_broadcast_failed_recipient"),
    )
```

```python
# backend/alembic/versions/b8c9d0e1f2a3_broadcast_failed_recipients.py
"""create broadcast_failed_recipients (C2 failed-token store)."""
revision = "b8c9d0e1f2a3"
down_revision = None  # executor: rebase ต่อ head ของ Wave C lane นี้ก่อนรัน.
# กัน head ชน (round-7 Important): ก่อนรัน migration ใหม่ ต้องตรวจก่อนว่า
# มี head เดียวด้วย `python scripts/db_target.py alembic --target local heads`.
# ถ้ามีหลาย heads (เช่น lane C อื่นสร้าง revision พร้อมกัน) ห้าม upgrade ต่อ —
# ให้ merge heads ก่อน (`alembic merge -m "merge wave-c heads" <rev1> <rev2>`)
# แล้วค่อยตั้ง down_revision ของไฟล์นี้เป็น head ที่ merge แล้ว.
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "broadcast_failed_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("broadcast_id", sa.Integer(),
                  sa.ForeignKey("broadcasts.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, default=3),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("broadcast_id", "token_hash",
                            name="uq_broadcast_failed_recipient"),
    )


def downgrade() -> None:
    op.drop_table("broadcast_failed_recipients")
```

```python
# backend/app/services/broadcast_service.py — แทน chunk loop (:201-210)
# เพิ่ม import ด้านบนไฟล์: import asyncio, hashlib
# (ของเดิมมีแค่ logging/datetime/typing — ไม่มี 2 ตัวนี้ ถ้าไม่เพิ่มจะ NameError)
# + from app.models.broadcast_failed_recipient import BroadcastFailedRecipient
# bounded retry + failed-token persistence (เก็บรายชื่อ chunk ที่พังครบ 3 รอบ
# ลง broadcast_failed_recipient เพื่อล้าง/ลองใหม่รอบหน้า ไม่ใช่แค่นับเลข)
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
                                # persist failed tokens (idempotent by broadcast_id+token hash)
                                for token in chunk:
                                    db.add(BroadcastFailedRecipient(
                                        broadcast_id=broadcast.id,
                                        token_hash=hashlib.sha256(token.encode()).hexdigest(),
                                        attempt_count=3,
                                    ))
                            else:
                                await asyncio.sleep(2 ** attempt)
```

```tsx
// frontend/app/admin/chatbot/broadcast/new/page.tsx — ขั้นตรวจสอบและส่ง
// ปุ่มทดลองส่ง: POST dry_run=true แล้วแสดง preview โดยไม่สร้างงานจริง
async function handleDryRun() {
  const res = await fetch(`${API_BASE}/admin/broadcasts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...draft, dry_run: true }),
  });
  const preview = await res.json(); // {dry_run, estimated_recipients, messages_valid}
  setPreview(preview);
}
// frontend test: __tests__/dryrun-button.test.tsx — กดปุ่มแล้ว fetch ถูกเรียก
// ด้วย dry_run:true, มี preview แสดง, ไม่ navigate ไปหน้าส่งจริง
```

(`scheduled_at` เก็บ UTC + normalize อยู่แล้วที่ :235-239; UI แปลง Asia_Bangkok ตอนแสดง; retry exhaustion test ต้อง mock multicast พัง 3 รอบแล้ว assert failed-token rows ถูกสร้าง + timezone ข้ามวันยังตรง)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_broadcast_dryrun.py tests/test_broadcast_service.py tests/test_broadcast_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_broadcast.py backend/app/services/broadcast_service.py backend/app/models/broadcast_failed_recipient.py backend/alembic/versions/b8c9d0e1f2a3_broadcast_failed_recipients.py backend/tests/test_broadcast_dryrun.py frontend/app/admin/chatbot/broadcast/new/page.tsx "frontend/app/admin/chatbot/broadcast/[id]/page.tsx" frontend/app/admin/chatbot/broadcast/__tests__/dryrun-button.test.tsx
git commit -m "feat(broadcast): dry-run preview with multicast backoff"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_broadcast_service.py tests/test_broadcast_scheduler.py -v`
Expected: PASS — scheduled ข้าม timezone ยังตรง
Run: `python scripts/db_target.py alembic --target local upgrade head` แล้ว `downgrade -1` ตามด้วย `upgrade head` ซ้ำ (ต้องมีตาราง broadcast_failed_recipients หลัง upgrade และหายหลัง downgrade รอบเดียว แล้วกลับมาใหม่ — verify ด้วย `SELECT to_regclass('broadcast_failed_recipients')`)
### Task C3: Intent keyword — REGEX write-guard + LIKE escape + precompile cache

**ACTION:** ปิด ReDoS/LIKE wildcard bypass และไม่ compile regex ซ้ำทุกข้อความ.
**IMPLEMENT:** เพิ่ม pattern guard, wildcard escaping, compiled cache/invalidation และใช้ order เดิมตาม Step 3.
**MIRROR:** ยึด matcher ordering/category behavior จาก intent service และ webhook intent tests ที่ระบุใน task.
**VALIDATE:** Step 2 ต้อง fail กับ dangerous pattern/wildcard; Step 4/6 ต้องผ่าน regex, webhook, category, and fallthrough suites.
**GOTCHA:** ต้อง escape user wildcard ก่อนแปลง regex, จำกัดความยาว/รูปแบบ และ invalidation ต้องไม่คืน compiled pattern เก่า.

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

**ACTION:** จำกัด placeholder `$name` ให้ปลอดภัยและบังคับ validation ตอน update เช่นเดียวกับ create.
**IMPLEMENT:** เพิ่ม strict regex/schema validation และใช้กับ update/response parser ตาม Step 3.
**MIRROR:** ใช้ Pydantic validation patterns ใน reply-object schemas และ parser tests ที่ task อ้างถึง.
**VALIDATE:** Step 2 ต้องจับ `$100`/รูปแบบผิด; Step 4/6 ต้องผ่าน guard, validation, parser suites.
**GOTCHA:** อย่าขยาย regex จนยอมรับ token ที่อาจตีความเป็นราคา/field reference; update ต้องไม่ bypass create rules.

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

**ACTION:** ทุกการลบคำร้องต้องมี audit log และใช้ RequestStatus definition เดียว.
**IMPLEMENT:** เพิ่ม delete guard/audit และลบ duplicate enum ตาม Step 3 โดยไม่สร้าง status ใหม่.
**MIRROR:** ใช้ `create_audit_log` และ status values จาก request endpoint/model ที่มีอยู่แล้ว.
**VALIDATE:** Step 2 ต้อง RED เมื่อ delete ไม่มี audit/enum ซ้ำ; Step 4/6 ต้องผ่าน request guard/workflow/admin endpoint tests.
**GOTCHA:** fixture teardown ต้องเก็บ row id ก่อน yield; ห้ามใช้ `row_id` ที่ไม่ได้ประกาศหรือเพิ่ม DONE/CANCELLED นอก enum กลาง.

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
        rid = row.id
        yield Session, rid
    async with Session() as s:
        for r in (await s.execute(
            select(AuditLog).where(AuditLog.resource_id == str(rid))
        )).scalars():
            await s.delete(r)
        left = await s.get(ServiceRequest, rid)
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

**ACTION:** รวมกติกาวันจองสูงสุด 62 วัน ป้องกัน terminal transition และปฏิเสธ PATCH ว่าง.
**IMPLEMENT:** ใช้ shared validation/error path ใน schema/endpoint ตาม Step 3.
**MIRROR:** ใช้ booking guard/create/update/list/slot test conventions ที่มีอยู่ใน backend/tests.
**VALIDATE:** Step 2 ต้อง RED กับ >62/terminal/None; Step 4/6 ต้องผ่าน booking guard/create/update/list and availability suites.
**GOTCHA:** terminal state ห้ามย้อนกลับ และ error ต้องเป็น 409/422 ตาม contract ไม่ใช่ 500 หรือการแก้ข้อมูลเงียบ ๆ.

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

**ACTION:** preview menu ที่ไม่มีรูปต้องแสดง placeholder และ scheduler ต้องข้ามเมนูเสียโดยไม่ล้มทั้งชุด.
**IMPLEMENT:** เพิ่ม preview response และแยก try/เหตุผลต่อ menu ตาม Step 3.
**MIRROR:** ใช้ rich-menu media/display/scheduler paths และ timezone conventions ที่ระบุใน task.
**VALIDATE:** Step 2 ต้อง RED สำหรับ imageless/one-menu failure; Step 4/6 ต้องผ่าน preview/display/scheduler/schema suites.
**GOTCHA:** อย่าเปลี่ยน missing image เป็น 403 ทั้งระบบ และอย่าให้ exception เมนูเดียวหยุดการ sync เมนูอื่น.

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

**ACTION:** ห้าม push ข้อความไป session ที่ปิด/เปลี่ยนเจ้าของ และลด presence burst ที่เขียนซ้ำ.
**IMPLEMENT:** ตรวจ active owner ก่อน push และ throttle/debounce presence พร้อม Redis fallback ตาม Step 3.
**MIRROR:** ใช้ owner check จาก live-chat session service และ Redis expiry/presence patterns เดิม.
**VALIDATE:** Step 2 ต้องจับ ghost push/presence storm; Step 4/6 ต้องผ่าน live-chat, websocket, and Redis tests.
**GOTCHA:** ต้องกำหนด contract 403/409 ให้สอดคล้องกับ owner pre-check และ guard; Redis down ต้อง fallback ไม่ทำให้ WebSocket ค้าง.

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
            # contract ที่ล็อก: pre-check เดิม (_require_active_session_owner,
            # sessions.py:148-152) ยิงก่อน guard เสมอ → displaced operator ได้ 403
            # (พฤติกรรมเดิม ห้ามเปลี่ยนเพราะ admin_live_chat ผูกอยู่); 409 เป็นของ
            # guard สำหรับ TOCTOU race ในเทสถัดไป
            assert exc.value.status_code == 403
        assert pushed == []  # ไม่มี ghost push ถึงประชาชน
    finally:
        async with Session() as db:
            await db.delete(await db.get(User, other_id))
            await db.commit()


@pytest.mark.asyncio
async def test_push_race_blocked_409(live_session, monkeypatch):
    """TOCTOU race: pre-check ผ่านตอนยังเป็นเจ้าของ แล้วเคสถูกโอนก่อนถึง push."""
    from app.services.live_chat_service import live_chat_service

    Session, ids = live_session
    pushed = []
    import app.services.live_chat_service.messaging as messaging_module

    async def _fake_push(line_user_id, messages):
        pushed.append(line_user_id)

    monkeypatch.setattr(messaging_module.line_service, "push_messages", _fake_push)
    async with Session() as db:
        other = User(username="t-ghost-op3", role=UserRole.AGENT, is_active=True)
        db.add(other)
        await db.flush()
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == ids["session"])
            .values(operator_id=other.id)
        )
        await db.commit()
        other_id = other.id

    # จำลอง pre-check ที่ผ่านไปแล้วก่อนโอน: คืน session ตาม id โดยไม่ตรวจเจ้าของ
    async def _stale_check(line_user_id, operator_id, db):
        return await db.get(ChatSession, ids["session"])

    monkeypatch.setattr(live_chat_service, "_require_active_session_owner", _stale_check)
    try:
        async with Session() as db:
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.send_message(ids["line"], "ผี", ids["op"], db)
            assert exc.value.status_code == 409  # guard จับได้หลัง save ก่อน push
        assert pushed == []
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
Expected: FAIL — เทส race: push สำเร็จโดยไม่มี 409 (ยังไม่มี guard); เทส contract (403) ผ่านอยู่แล้วเป็นตัวล็อกพฤติกรรมเดิม; และ zadd ถูกเรียก 100 ครั้ง

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
- `backend/app/core/permissions.py` (Modify: D7 — เพิ่ม 2 keys + DEFAULT_POLICY + seed descriptions; `ensure_seed_rows` จะ seed เอง ไม่ต้อง migration) + `backend/app/api/v1/endpoints/admin_credentials.py` + `backend/app/api/v1/endpoints/admin_business_hours.py` + `backend/app/api/v1/endpoints/media.py` (Modify: D7 — gate ด้วย `require_permission`, short-lived resize ticket และ authenticated upload) + `backend/app/core/security.py` (Reference: ใช้ `create_access_token`/`verify_token` เดิม ไม่เพิ่ม crypto library) + `frontend/app/admin/settings/permissions/page.tsx` + `frontend/app/admin/image-resize/page.tsx` + `frontend/app/admin/image-resize/use-image-resize.ts` (D7 — permission/CSRF contract); หมายเหตุ: ห้ามสร้าง public `backend/app/api/v1/endpoints/admin_image_resize.py` หรือ `/api/v1/image-resize`; image resize ยังคงทำ canvas ใน browser แต่ upload ต้องเข้าทาง route ใน `media.py` ที่มี auth/CSRF/expiry — ห้ามใช้ `request.session` เพราะ FastAPI ไม่มี session middleware

**Ordering note:** A1 เป็นเจ้าของ `liff.py` ก่อน D3; A2 เป็นเจ้าของ `media.py` ก่อนงาน preview/sync ใดใดใน C/D; B ขนาน A ได้; C เริ่มบน `liff.py`/`media.py` ได้ก็ต่อเมื่อ A merge แล้วเท่านั้น; B1 เป็นเจ้าของ `sessions.py` + `errors.py` + transfer mapping ใน `admin_live_chat.py`/`ws_session/handlers.py` (C8 แตะแค่ `messaging.py` ขนานได้); C8 (ghost-push) ก่อน D1 export-stream ก็ได้ ไฟล์ไม่ชน

### Task D1: Histories limit clamp + export streaming + PDF ฟอนต์ไทย (PRD stories 20–21)

**ACTION:** เปิดประวัติแบบจำกัดช่วงและส่งออกไฟล์ใหญ่แบบ stream พร้อมรองรับชื่อไฟล์/ฟอนต์ไทย.
**IMPLEMENT:** เพิ่ม clamp, async chunk streaming, RFC 5987 filename และ Thai font asset ตาม Step 3.
**MIRROR:** ใช้ cursor/limit behavior ของ conversations service และ response streaming conventions ที่มีอยู่.
**VALIDATE:** Step 2 ต้อง RED กับ limit/10k rows/Thai PDF; Step 4/6 ต้องผ่าน histories/export/websocket suites และ frontend build gate.
**GOTCHA:** ห้ามใช้ `Query(le=...)` หาก PRD ต้องการ clamp; ห้ามรวม CSV/PDF ทั้งก้อนใน memory และต้องมี font asset จริง.

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

Run: `npx tsc --noEmit` (workdir `frontend/`) + `npm run lint` (workdir `frontend/`) + `npm run build` (workdir `frontend/`)
Expected: PASS — frontend type-check, lint, and production build ผ่านหลังแก้ contract การส่งออก

### Task D2: Canned normalize + 409 + optimistic concurrency (PRD stories 22–23)

**ACTION:** ป้องกัน canned response ซ้ำและการ update ชนกันด้วยข้อความไทยที่อ่านรู้เรื่อง.
**IMPLEMENT:** normalize ก่อน duplicate check และตรวจ version/updated_at ก่อน update ตาม Step 3.
**MIRROR:** ใช้ existing canned CRUD/schema error conventions และ frontend unit/lint pattern ใน task.
**VALIDATE:** Step 2 ต้อง RED กับ space/case/version collision; Step 4/6 ต้องผ่าน backend tests, `npm run test:unit -- canned`, lint, typecheck, and build.
**GOTCHA:** 409 ต้องไม่เขียนข้อมูลทับของเดิม และ normalize ต้องคงความหมายภาษาไทยไม่ลบข้อมูลเกินจำเป็น.

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
Run: `npx tsc --noEmit` (workdir `frontend/`)
Run: `npm run build` (workdir `frontend/`)
Expected: PASS — unit, lint, type-check, and production build ผ่าน

### Task D3: LIFF verify timeout + retry + 502 (ต่อยอด A1 — ต้องหลัง A1 เท่านั้น) (PRD stories 24–25)

**ACTION:** ทำ LINE verification ให้มี timeout/retry ที่จำกัดและแปลง upstream failure เป็น 502.
**IMPLEMENT:** เติม timeout/exception mapping ใน `verify_liff_token()` และ reuse identity helper จาก A1 ตาม Step 3.
**MIRROR:** ใช้ `verify_liff_token()`/`require_liff_identity()` ใน `liff.py:31-63` และ rate-limit dependencies เดิม.
**VALIDATE:** Step 2 ต้อง RED กับ timeout; Step 4/6 ต้องผ่าน hardening, token, media, debt, service-request, and rate-limit tests.
**GOTCHA:** ต้อง retry แบบ bounded เท่านั้น ไม่ retry 401/invalid token และห้ามทำให้ network failure หลุดเป็น 500.

**Files:**
- Modify: `backend/app/api/v1/endpoints/liff.py` (เฉพาะ `verify_liff_token` — เติม timeout/retry/502)
- Test: `backend/tests/test_liff_hardening.py`

**Interfaces (verified):**
- Consumes: `verify_liff_token(id_token: str) -> str` (liff.py:31-52) — เปิด `httpx.AsyncClient()` เปล่าเปล่า (:37) **ไม่มี timeout**; network error ไม่ถูก catch (หลุดเป็น 500); 3 POSTs (`/media` :59, `/service-requests` :118, `/debt-mediation` :250) มี `http_rate_limit` อยู่แล้ว (:65, :127, :259); `require_liff_identity` จาก A1 อยู่ในไฟล์เดียวกัน
- Route-inventory contract: ใช้ `app.routes` ของ FastAPI เป็น source of truth (รวม router prefix จริง `/api/v1/liff`); ล็อก set ของ `(path, method)` แบบเท่ากันทุกตัว ไม่ใช้ subset. Route ใหม่ทุก method ต้องทำให้ test แดงก่อน แล้วเพิ่ม contract test ของ route นั้นพร้อมปรับ expected set; GET ต้องมี rate-limit และ PATCH ต้องมี `None → 422` test ถ้ามีในอนาคต. `rg` ใช้สำรวจประกอบเท่านั้น ไม่ใช่หลักฐาน route ครบ.
- PRD story 25 ระบุเงื่อนไขเมื่อมี LIFF GET/PATCH แล้ว (แก้ความคลาดเคลื่อนจาก audit ณ 2026-09-21): `liff.py` **ไม่มี** route GET/PATCH ใน runtime ปัจจุบัน จึงไม่มี endpoint ให้เพิ่ม rate-limit/None guard ใน task นี้. Equality test ด้านล่างทำให้ route ใหม่ทุก method แดง; task ที่เพิ่ม GET ในอนาคตต้องมี rate-limit → 429 test และ task ที่เพิ่ม PATCH ต้องมี `None → 422` test ก่อนปรับ expected set. Rate-limit ของ POST คงไว้แบบ verify-only; PATCH-None ของ booking/canned เป็นคนละ scope ไม่ใช่หลักฐานแทน LIFF.
- Produces: `httpx.Timeout(connect=3.0, read=5.0)` + retry 1 ครั้งเฉพาะ timeout; timeout/network error → 502 ข้อความไทย (พฤติกรรม 401/503 เดิมคงไว้)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_liff_hardening.py
import httpx
import pytest

from app.api.v1.endpoints import liff as liff_module
from app.main import app


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


def test_liff_route_inventory_is_explicit():
    routes = {
        (route.path, method)
        for route in app.routes
        if route.path.startswith("/api/v1/liff/")
        for method in (route.methods or set())
    }
    expected_writes = {
        ("/api/v1/liff/media", "POST"),
        ("/api/v1/liff/service-requests", "POST"),
        ("/api/v1/liff/debt-mediation", "POST"),
    }
    assert routes == expected_writes  # new GET/PATCH/POST/DELETE must fail until reviewed
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

**ACTION:** จำกัดรายการเพื่อนและ mask LINE ID/เบอร์ตาม role ก่อนส่ง response.
**IMPLEMENT:** เพิ่ม cap/pagination และ reuse masking helpers ใน friends/users admin routes ตาม Step 3.
**MIRROR:** ใช้ non-reversible masking precedent จาก `backend/app/core/logging_utils.py:8-18` แต่สร้าง helper สำหรับ response/export แยกใน `backend/app/core/pii_masking.py`; ใช้ `UserRole` และ RBAC dependency conventions โดยไม่ import helper ข้าม endpoint.
**VALIDATE:** Step 2 ต้อง RED กับ limit/role; Step 4/6 ต้องผ่าน PII/friend/admin-user/module-permission suites.
**GOTCHA:** ห้ามส่ง password hash/token หรือ PII ดิบให้ role ที่ไม่มีสิทธิ์ และอย่าเขียน masking logic ซ้ำใน D5.

**Files:**
- Create: `backend/app/core/pii_masking.py` (`mask_line_id` + `mask_phone` พร้อม role policy กลาง)
- Modify: `backend/app/api/v1/endpoints/admin_friends.py` (cap limit + mask `line_user_id`)
- Modify: `backend/app/api/v1/endpoints/admin_users.py` (mask `line_user_id` ใน list — `UserOut` ไม่มี password/token อยู่แล้ว :26-38)
- Modify: `frontend/app/admin/friends/page.tsx` + `frontend/app/admin/users/page.tsx` (รองรับค่าที่ถูก mask — แสดงตามที่ API ส่งมา ห้ามเดาเลขเต็ม)
- Test: `backend/tests/test_pii_masking.py`

**Interfaces (verified):**
- Consumes: `GET /admin/friends` (`limit: int = 100` **ไม่มี cap บน** — admin_friends.py:22-31; คืน decrypted raw LINE ID ให้ทุก admin — :56-64); `GET /admin/users` (`per_page = Query(20, ge=1, le=100)` มี cap แล้ว — admin_users.py:161-167); `escape_ilike` precedent (app/core/query_utils.py:4, ใช้ที่ admin_users.py:181); `FriendEventType` รวมศูนย์อยู่แล้ว (friend_event.py:8-14 — ไม่ต้องสร้างใหม่)
- Produces: `app.core.pii_masking.mask_line_id(v, role)` / `mask_phone(v, role)` เป็น helper กลางที่คืนค่าเต็มเฉพาะ `SUPER_ADMIN`/`ADMIN` และ mask role อื่น; friends `limit = Query(100, ge=1, le=100)` ตรงกับ users. `backend/app/core/logging_utils.py:8` มี helper log คนละ signature — ห้ามแก้หรือ import มาทำ response masking

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_pii_masking.py
from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.core.pii_masking import mask_line_id, mask_phone
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
# backend/app/core/pii_masking.py
from app.models.user import UserRole

_FULL_PII_ROLES = frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN})


def _can_view_full(role: UserRole | str) -> bool:
    value = role.value if isinstance(role, UserRole) else role
    return any(value == allowed.value for allowed in _FULL_PII_ROLES)


def mask_line_id(v: str | None, role: UserRole | str) -> str | None:
    if not v:
        return v
    if _can_view_full(role):
        return v
    return v[:3] + "***" + v[-2:] if len(v) > 5 else "***"


def mask_phone(v: str | None, role: UserRole | str) -> str | None:
    if not v:
        return v
    if _can_view_full(role):
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
# mask line_user_id ต่อ row ด้วย helper กลาง (ห้าม import จาก endpoint อื่น)
    from app.core.pii_masking import mask_line_id
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_pii_masking.py tests/test_friend_service.py tests/test_admin_users.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/pii_masking.py backend/app/api/v1/endpoints/admin_friends.py backend/app/api/v1/endpoints/admin_users.py frontend/app/admin/friends/page.tsx frontend/app/admin/users/page.tsx backend/tests/test_pii_masking.py
git commit -m "fix(pii): cap friends limit with role-based masking"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_module_permission_endpoints.py tests/test_deps_gates.py -v`
Expected: PASS

Run: `npx tsc --noEmit` (workdir `frontend/`) + `npm run lint` (workdir `frontend/`) + `npm run build` (workdir `frontend/`)
Expected: PASS — frontend type-check, lint, and production build ผ่าน

### Task D5: Reports CSV PII masking + PDF param alignment (PRD story 39)

**ACTION:** เอา PII ดิบออกจาก CSV และทำให้พารามิเตอร์ PDF ตรงกันทั้ง backend/frontend.
**IMPLEMENT:** ใช้ masking helper จาก D4 ผ่าน `_csv_line_id` และ align PDF params ตาม Step 3.
**MIRROR:** ใช้ report helper/CSV/PDF conventions ที่มีอยู่ใน `admin_reports` และ import `mask_line_id` จาก `backend/app/core/pii_masking.py` ตาม D4; ห้าม import จาก endpoint อื่นหรือเขียน helper ซ้ำ.
**VALIDATE:** Step 2 ต้อง RED เมื่อ role ต่ำเห็น PII; Step 4/6 ต้องผ่าน reports guard/helper tests และ frontend build gate.
**GOTCHA:** ห้ามสร้าง `mask_line_id`/`mask_phone` ซ้ำ และต้องตรวจทั้ง CSV output กับ PDF parameter validation.

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
from app.core.pii_masking import mask_line_id  # D4 — helper กลาง, ห้ามเขียนซ้ำ


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

Run: `npx tsc --noEmit` (workdir `frontend/`) + `npm run lint` (workdir `frontend/`) + `npm run build` (workdir `frontend/`)
Expected: PASS — frontend type-check, lint, and production build ผ่านหลัง align PDF parameters

### Task D6: Button variant test + token centralization check (PRD story 40)

**ACTION:** ล็อก Button variant ใหม่แบบ opt-in และยืนยัน token สีไม่กระจาย.
**IMPLEMENT:** เพิ่ม/ปรับ unit test ของ `buttonVariants` และตรวจ token source ตาม Step 3 โดยไม่ redesign ทั้งระบบ.
**MIRROR:** ใช้ CVA/button test และ design-token conventions ใน frontend ที่มีอยู่แล้ว.
**VALIDATE:** Step 2 ต้อง RED กับ primary/danger contract; Step 4/6 ต้องผ่าน Vitest, lint, `npx tsc --noEmit`, and `npm run build`.
**GOTCHA:** ห้ามเปลี่ยน default/global class ของทุกหน้าโดยไม่ตั้งใจ; migration ต้อง opt-in ทีละ component.

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
Run: `npx tsc --noEmit` (workdir `frontend/`)
Run: `npm run build` (workdir `frontend/`)
Expected: PASS — lint, type-check, and production build ผ่านโดยไม่เปลี่ยน default variant

### Task D7: Credentials/business-hours permission keys + secure image-resize upload (PRD stories 38, 41)

**ACTION:** เพิ่ม permission keys ใหม่ให้ registry/backend/frontend mirror ตรงกัน และทำให้เส้นทาง image-resize ที่อัปโหลดเข้า media ปลอดภัยจริง.
**IMPLEMENT:** เพิ่ม constants, `DEFAULT_POLICY`, seed descriptions, registry และ endpoint gates ตาม Step 3; คงการ resize บน canvas ใน browser แต่เปลี่ยน upload เป็น route ที่ใช้ `KEY_IMAGE_RESIZE`, CSRF และ short-lived signed ticket. ห้ามสร้าง public `/api/v1/image-resize` หรือ endpoint แยกที่เปิดโดยไม่มี auth.
**MIRROR:** ใช้ `KEY_IMAGE_RESIZE`, `DEFAULT_POLICY`, `_SEED_DESCRIPTIONS`, `PERMISSION_REGISTRY`, `require_permission` ใน `backend/app/core/permissions.py`; ใช้ `get_current_user` CSRF contract ใน `backend/app/api/deps.py:128-140`, `installAdminAuthFetchInterceptor` (`frontend/lib/authFetch.ts:156-179`) + `setCsrfToken` (`frontend/lib/csrfStore.ts:20-22`) ฝั่ง frontend และ `create_access_token`/`verify_token` ใน `backend/app/core/security.py:65-166` สำหรับ ticket ชนิด `image_resize_ticket` ที่ใช้ล็อกอินไม่ได้.
**VALIDATE:** Step 2 ต้อง RED กับ registry mirror หรือ image-resize security contract; Step 4/6 ต้องผ่าน permission/deps/credential/image-resize tests, frontend mirror/security test, typecheck, lint, and build.
**GOTCHA:** จำนวน registry keys ต้องตรง backend/frontend; generic `/api/v1/admin/media` ยังคงใช้ `KEY_MANAGE_FILES`, ส่วน resize upload ใช้ `KEY_IMAGE_RESIZE`; raw `fetch` ที่ไม่ส่ง CSRF, token ใน URL/log, `request.session`, และ auth bypass ห้ามใช้.

**Files:**
- Modify: `backend/app/core/permissions.py` (2 keys + DEFAULT_POLICY + descriptions + registry — `ensure_seed_rows` seed เอง ไม่ต้อง migration)
- Modify: `backend/app/api/v1/endpoints/admin_credentials.py` (gate ด้วย `require_permission`)
- Modify: `backend/app/api/v1/endpoints/admin_business_hours.py` (PUT gate ด้วย `require_permission`)
- Modify: `backend/app/api/v1/endpoints/media.py` (เพิ่ม authenticated resize-ticket + resize-upload routes ใน router เดิม; ห้ามสร้าง public image-resize router)
- Modify: `backend/app/schemas/media.py` (เพิ่ม `ResizeTicketResponse` สำหรับ ticket + `expires_in`; ใช้ response model ไม่คืน dict ดิบ)
- Reference: `backend/app/core/security.py` (`create_access_token` รองรับ `expires_delta`/`additional_claims`, `verify_token` ตรวจ signature/expiry — ไม่เพิ่ม crypto library)
- Test: `backend/tests/test_image_resize_security.py` (auth, CSRF, role, signed-ticket expiry/subject/nonce, upload)
- Modify: `frontend/app/admin/image-resize/page.tsx` (ใช้ `image_resize` permission สำหรับ resize action)
- Modify: `frontend/app/admin/image-resize/use-image-resize.ts` (เรียก ticket แล้ว upload ผ่าน `window.fetch` ที่ `AuthProvider` ติดตั้ง interceptor อยู่แล้ว)
- Test: `frontend/app/admin/image-resize/__tests__/upload-security.test.ts`
- Modify: `frontend/lib/constants/permission-modules.ts` (เติม 2 entries ใน `PERMISSION_REGISTRY` — static mirror ของ backend registry)
- Modify: `frontend/lib/constants/__tests__/permission-modules.test.ts` (ขยับค่าตายตัวให้ตรง mirror ใหม่ — ดู Step 3)
- Reference: `frontend/app/admin/settings/permissions/page.tsx` (matrix render จาก API + mirror นี้ — ไม่ต้องแก้ page โดยตรง)
- Test: `backend/tests/test_new_permission_keys.py`

**Interfaces (verified):**
- Consumes: `KEY_*` constants (permissions.py:42-76) + `DEFAULT_POLICY: dict[str, frozenset[UserRole]]` (:80 — **type นี้เท่านั้น ห้าม assign list**); entries ตัวอย่าง `KEY_IMAGE_RESIZE: frozenset({SUPER_ADMIN, ADMIN})` (:123); `_SEED_DESCRIPTIONS` (:213) + `ensure_seed_rows` (:241); `PERMISSION_REGISTRY` (`PermissionMeta(key, module, level, label_th)` — :415-440); `GET /api/v1/admin/settings/permissions` (settings router prefix `/admin/settings` — api.py:51; gate `get_current_admin` — settings.py:118-122); business-hours `PUT ""` gate `get_current_admin` อยู่ (admin_business_hours.py:57-62 — ยังไม่ผูก key ใหม่); credentials endpoints ผสม `get_current_admin`/`require_permission(KEY_EDIT_SYSTEM_SETTINGS)` (admin_credentials.py:28, 47, 77, 99, 116)
- Produces: `KEY_MANAGE_CREDENTIALS = "manage_credentials"` + `KEY_EDIT_BUSINESS_HOURS = "edit_business_hours"` ครบทั้ง 4 จุด (constants, DEFAULT_POLICY, descriptions, registry); `GET /api/v1/admin/media/resize-ticket` ตอบ `ResizeTicketResponse` พร้อม JWT ticket อายุ 5 นาทีด้วย `type=image_resize_ticket`, `purpose=image_resize`, subject และ nonce (cookie auth รับเฉพาะ `type=access`); `POST /api/v1/admin/media/resize` ตรวจ permission, cookie/header CSRF, signature, expiry, type, purpose, subject, ตรวจ JPEG/PNG จริง แล้ว consume nonce ก่อนบันทึก MediaFile
- Frontend contract: `page.tsx` ใช้ `useHasPermission('image_resize')`; hook ขอ ticket แล้วใช้ `fetch` ภายใต้ `AuthProvider` ซึ่งเรียก `installAdminAuthFetchInterceptor()` จาก `frontend/lib/authFetch.ts:156`. Interceptor เติม `credentials: 'include'` และ `X-CSRF-Token` ให้ mutating API request (`:105-154`); ticket อยู่ใน multipart body ไม่อยู่ใน URL/log. ไม่มีฟังก์ชัน export ชื่อ `authFetch` ใน repo; canvas resize ยังคงทำใน browser.
- ขอบเขตที่ตัดทิ้งอย่าง explicit: **ไม่มี public `/api/v1/image-resize` และไม่มี `admin_image_resize.py`**; security coverage ยิงเฉพาะ authenticated routes ใน `media.py` และตรวจว่า generic `/api/v1/admin/media` ยังไม่ถูกเปลี่ยน permission โดยไม่ตั้งใจ

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
async def test_business_hours_put_admin_keeps_access(test_client):
    # LOCK (ไม่ใช่ red-green — 200 ทั้งก่อนและหลัง):
    # ADMIN อยู่ใน DEFAULT_POLICY ของ key ใหม่ ({SUPER_ADMIN, ADMIN} ตาม Step 3)
    # เทสนี้กัน regression ว่า ADMIN ไม่เสียสิทธิ์หลังผูก gate;
    # RED-GREEN ของ task นี้อยู่ที่ test_matrix_has_new_keys (keys โผล่ใน matrix)
    async def _override():
        yield SimpleNamespace(id=2, role=UserRole.ADMIN, is_active=True)

    # body ครบ 7 วันตาม BusinessHoursUpdate (schemas/business_hours.py:51-52)
    # เพื่อให้ gate/200 เป็นตัวตอบ ไม่ใช่ body validation (422)
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
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_business_hours_put_agent_still_forbidden(test_client):
    # LOCK (ไม่ใช่ red-green — ผ่านทั้งก่อนและหลัง): AGENT โดน gate เดิมกันอยู่แล้ว
    async def _override():
        yield SimpleNamespace(id=3, role=UserRole.AGENT, is_active=True)

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

- [ ] **Step 1b: Add executable image-resize security contract tests**

```python
# backend/tests/test_image_resize_security.py
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
    # เพราะจะพังตั้งแต่ fixture setup (AttributeError) ไม่ใช่ RED ที่ route.
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
```

Test isolation: `resize_setup` uses real cookie auth/CSRF and `DEFAULT_POLICY` with fresh NullPool DB sessions; no `get_current_user` override. Its Redis tri-state double models success/replay/outage, so cleanup touches no shared Redis keys. The `finally` block removes only fixture-created media/audit/users and restores the shared TestClient cookie jar. Handler-level rejection audit records a fixed reason code; auth/CSRF/permission dependency failures occur before the handler and are not claimed as handler audit events. Step 4 must also run this file against the actual route; a static review cannot certify it as passing.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_new_permission_keys.py tests/test_image_resize_security.py -v`
Expected: registry test RED เพราะยังไม่มี 2 keys ใหม่ และ image-resize security test RED เพราะปัจจุบัน page ใช้ `manage_files`, hook ยิง generic `/api/v1/admin/media` ด้วย raw `fetch`, และยังไม่มี resize ticket/route.

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

```ts
// frontend/lib/constants/permission-modules.ts — กลุ่ม system ต่อท้าย access_live_chat
// (static mirror ของ backend registry + integrity-test source of truth — ดู lib/constants/__tests__/permission-modules.test.ts)
{ key: 'manage_credentials', label: 'จัดการรหัสเชื่อมต่อ (credentials/integrations)', module: 'system', level: 3 },
{ key: 'edit_business_hours', label: 'แก้เวลาทำการ (business hours)', module: 'system', level: 2 },
```

```ts
// frontend/lib/constants/__tests__/permission-modules.test.ts — ขยับค่าตายตัวให้ตรง mirror ใหม่
// (ไม่แก้ไฟล์นี้ Step 6 จะแดง: registry 22 keys แต่เทสล็อก 20)
```

```diff
 // permission-modules.test.ts
-const BACKEND_KEYS = [ ... 'access_live_chat', ]
+const BACKEND_KEYS = [ ... 'access_live_chat', 'manage_credentials', 'edit_business_hours', ]
-    expect(PERMISSION_REGISTRY).toHaveLength(20)
+    expect(PERMISSION_REGISTRY).toHaveLength(22)
-    expect(grouped.system).toHaveLength(11)
+    expect(grouped.system).toHaveLength(13)
     expect(grouped.system.map((m) => m.key)).toEqual([
       ...same 11 keys...,
       'access_live_chat',
+      'manage_credentials',
+      'edit_business_hours',
     ])
-    expect(keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.MANAGE)).toHaveLength(11)
+    expect(keysForLevel(PERMISSION_REGISTRY, 'system', LEVEL.MANAGE)).toHaveLength(13)
```
(ชุด View ไม่เปลี่ยน — 2 keys ใหม่เป็น level 3/2; availableLevels/levelForKeys ที่เหลือไม่แตะ)

(`ensure_seed_rows` seed rows ใหม่ตอน startup — ไม่ต้อง migration; page.tsx ไม่ต้องแก้โดยตรง)

```python
# backend/app/schemas/media.py — import BaseModel จาก pydantic
class ResizeTicketResponse(BaseModel):
    ticket: str
    expires_in: int


# backend/app/api/v1/endpoints/media.py — เพิ่ม imports:
# from typing import Annotated; from datetime import timedelta; import secrets
# from fastapi import File, Form; from app.core.security import create_access_token, verify_token
# from app.core.permissions import KEY_IMAGE_RESIZE
# from app.schemas.media import ResizeTicketResponse
# from app.core.audit import create_audit_log
# from app.core.redis_client import redis_client (เพิ่ม import ใหม่; set(..., seconds=300, nx=True)
# คืน True=สำเร็จ, False=nonce ซ้ำ, None=Redis ใช้งานไม่ได้)
# ROUTE ORDER (สำคัญ — กันพังกลางทาง): ต้องวาง static
# `GET /admin/media/resize-ticket` ไว้ก่อน dynamic
# `GET /admin/media/{media_id}` (:348) เสมอ ไม่เช่นนั้น dynamic route
# จะดัก path "resize-ticket" แล้วตอบ UUID validation error (422).
# ตอน implement ให้ย้าย/เพิ่ม static route ขึ้นก่อนบรรทัด :348 ห้ามไว้หลัง.
# Extract from existing upload_media: _validate_media_upload(file) checks
# MAX_UPLOAD_BYTES before/after read, then _sniff_mime, returning
# (content, mime, filename). _store_media_upload(db, content, mime, filename)
# builds/adds MediaFile and returns the ORM row WITHOUT committing; both the
# generic and resize routes call these helpers. Generic upload still commits,
# refreshes and returns _serialise(media) as before; resize route commits only
# after create_audit_log so media and success audit share one transaction.
async def _reject_resize(db, admin_id, status_code, detail, reason):
    try:
        await create_audit_log(db, admin_id, "image_resize_upload_rejected", "media_file",
                               details={"reason": reason})
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=503, detail="บริการอัปโหลดรูปยังไม่พร้อมใช้งาน")
    raise HTTPException(status_code=status_code, detail=detail)


@router.get("/admin/media/resize-ticket", response_model=ResizeTicketResponse)
async def issue_resize_ticket(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_permission(KEY_IMAGE_RESIZE)),
):
    nonce = secrets.token_urlsafe(24)
    ticket = create_access_token(
        subject=str(admin.id),
        expires_delta=timedelta(minutes=5),
        # create_access_token defaults to type=access; override to prevent
        # this ticket authenticating through get_current_user's cookie path.
        additional_claims={"type": "image_resize_ticket",
                           "purpose": "image_resize", "nonce": nonce},
    )
    try:
        await create_audit_log(db, admin.id, "image_resize_ticket_issued", "media_file",
                               details={"result": "issued"})
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=503, detail="บริการอัปโหลดรูปยังไม่พร้อมใช้งาน")
    return ResizeTicketResponse(ticket=ticket, expires_in=300)


@router.post("/admin/media/resize", dependencies=[Depends(_upload_rate_limit)])
async def upload_resize_media(
    ticket: Annotated[str, Form()],
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_permission(KEY_IMAGE_RESIZE)),
):
    # require_permission -> get_current_user enforces cookie/header CSRF for POST.
    payload = verify_token(ticket)
    if (not payload or payload.get("type") != "image_resize_ticket"
            or payload.get("purpose") != "image_resize"):
        await _reject_resize(db, admin.id, 401,
                             "ตั๋วอัปโหลดรูปไม่ถูกต้องหรือหมดอายุ", "invalid_ticket")
    if str(payload.get("sub")) != str(admin.id):
        await _reject_resize(db, admin.id, 403,
                             "ตั๋วอัปโหลดรูปไม่ตรงกับผู้ใช้", "wrong_subject")
    nonce = payload.get("nonce")
    if not isinstance(nonce, str) or not nonce or len(nonce) > 128:
        await _reject_resize(db, admin.id, 401,
                             "ตั๋วอัปโหลดรูปไม่ถูกต้องหรือหมดอายุ", "invalid_ticket")
    try:
        content, mime, filename = await _validate_media_upload(file)
    except HTTPException as exc:
        if exc.status_code == 413:
            await _reject_resize(db, admin.id, 413, "ไฟล์ใหญ่เกิน 10 MB", "invalid_file")
        await _reject_resize(db, admin.id, 422,
                             "รองรับเฉพาะรูป JPEG หรือ PNG", "invalid_file")
    if mime not in {"image/jpeg", "image/png"}:
        await _reject_resize(db, admin.id, 422,
                             "รองรับเฉพาะรูป JPEG หรือ PNG", "invalid_file")
    # Consume only after validation; invalid files do not burn ticket.
    consumed = await redis_client.set(
        f"image-resize-ticket:{nonce}", "1", seconds=300, nx=True
    )
    if consumed is False:
        await _reject_resize(db, admin.id, 409,
                             "ตั๋วอัปโหลดรูปนี้ถูกใช้แล้ว", "replay")
    if consumed is not True:
        await _reject_resize(db, admin.id, 503,
                             "บริการอัปโหลดรูปยังไม่พร้อมใช้งาน", "redis_unavailable")
    try:
        media = await _store_media_upload(db, content, mime, filename)
        await create_audit_log(db, admin.id, "image_resize_upload", "media_file",
                               resource_id=str(media.id), details={"result": "success"})
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=503, detail="บริการอัปโหลดรูปยังไม่พร้อมใช้งาน")
    await db.refresh(media)
    return _serialise(media)
```

ใช้ `create_access_token`/`verify_token` ที่มีอยู่แล้ว ไม่เพิ่ม JWT/crypto library; ticket ต้องมี `type=image_resize_ticket` ซึ่ง `get_current_user` ปฏิเสธเมื่อใส่เป็น access cookie. ห้าม log ticket. `/admin/media` เดิมยัง gate ด้วย `KEY_MANAGE_FILES` ต่อไป ส่วน route ใหม่ gate ด้วย `KEY_IMAGE_RESIZE` และรับ ticket ใน multipart body เท่านั้น. `_reject_resize` บันทึก fixed reason code เท่านั้น ไม่มี ticket/nonce/filename. การปฏิเสธที่เกิดใน FastAPI dependency ก่อนเข้า route (anonymous/CSRF/permission) ให้ทดสอบ status แต่ไม่อ้างว่ามี audit row จาก helper นี้. หาก DB audit commit ล้ม ให้ fail closed (ไม่บันทึก media) และรายงาน 503 ภาษาไทยตาม error boundary ของ route; ห้ามแปลงเป็น 500 ดิบ.

```tsx
// frontend/app/admin/image-resize/use-image-resize.ts
const ticketResponse = await fetch('/api/v1/admin/media/resize-ticket', { credentials: 'include' });
const { ticket } = await ticketResponse.json();
const form = new FormData();
form.append('ticket', ticket);
form.append('file', resizedFile, resizedFile.name);
return fetch('/api/v1/admin/media/resize', { method: 'POST', body: form, credentials: 'include' });
```

`page.tsx` ต้องใช้ `useHasPermission('image_resize')` ควบคุมปุ่ม/การเรียก resize; `manage_files` ใช้เฉพาะความสามารถจัดการ media ทั่วไป. ใน `upload-security.test.ts` ให้ mount hook ภายใต้ `AuthProvider` หรือเรียก `installAdminAuthFetchInterceptor()` จริงกับ native fetch stub (restore global fetch/installed flag ใน teardown), ตั้ง CSRF ผ่าน `csrfStore`, แล้ว assert native fetch ได้ `credentials: 'include'` ทั้ง GET/POST และ POST มี `X-CSRF-Token: server-token`; ticket อยู่ใน FormData เท่านั้น, URL ไม่มี ticket, ไม่ตั้ง `Content-Type` เอง, ไม่มีการเรียก generic `/admin/media`.

```ts
// frontend/app/admin/image-resize/__tests__/upload-security.test.ts
import { expect, it, vi } from 'vitest'
import { installAdminAuthFetchInterceptor } from '@/lib/authFetch'
import { setCsrfToken } from '@/lib/csrfStore'

it('uses the installed cookie/CSRF transport for a resize upload', async () => {
  const oldFetch = window.fetch
  const oldInstalled = window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__
  const native = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response('{}', { status: 200 }))
  try {
    window.fetch = native as typeof window.fetch
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false
    setCsrfToken('server-token')
    installAdminAuthFetchInterceptor()
    await window.fetch('/api/v1/admin/media/resize-ticket')
    const form = new FormData()
    form.append('ticket', 'test-ticket')
    form.append('file', new File(['x'], 'test.png', { type: 'image/png' }))
    await window.fetch('/api/v1/admin/media/resize', { method: 'POST', body: form })
    const [ticketUrl, ticketInit] = native.mock.calls[0]
    const [uploadUrl, uploadInit] = native.mock.calls[1]
    expect(ticketUrl).toBe('/api/v1/admin/media/resize-ticket')
    expect(ticketInit?.credentials).toBe('include')
    expect(uploadUrl).toBe('/api/v1/admin/media/resize')
    expect(uploadInit?.credentials).toBe('include')
    expect(new Headers(uploadInit?.headers).get('X-CSRF-Token')).toBe('server-token')
    expect(uploadInit?.body).toBe(form)
    expect(form.get('ticket')).toBe('test-ticket')
    expect(new Headers(uploadInit?.headers).has('Content-Type')).toBe(false)
    expect(native).toHaveBeenCalledTimes(2)
  } finally {
    setCsrfToken(null)
    window.fetch = oldFetch
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = oldInstalled
  }
})
```

Add a hook-level test in the same file that sets a valid `outputBlob` through the existing `selectFile`/resize flow (mock `decodeDimensions` and `resizeImage` from `image-utils.ts`, and object-URL methods), then calls `uploadToMedia()` and asserts the same ticket→upload order and that no generic `/api/v1/admin/media` call is made. The transport test above is the concrete CSRF assertion; the hook-level test verifies routing, not CSRF internals.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_new_permission_keys.py tests/test_image_resize_security.py tests/test_module_permission_endpoints.py tests/test_deps_gates.py -v`
Expected: PASS — matrix/gates และ no-auth/CSRF/role/ticket/upload security contracts ผ่าน.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/permissions.py backend/app/api/v1/endpoints/admin_credentials.py backend/app/api/v1/endpoints/admin_business_hours.py backend/app/api/v1/endpoints/media.py backend/app/schemas/media.py backend/tests/test_new_permission_keys.py backend/tests/test_image_resize_security.py frontend/app/admin/image-resize/page.tsx frontend/app/admin/image-resize/use-image-resize.ts frontend/app/admin/image-resize/__tests__/upload-security.test.ts frontend/lib/constants/permission-modules.ts frontend/lib/constants/__tests__/permission-modules.test.ts
git commit -m "fix(permissions): secure image resize and add admin keys"
```

- [ ] **Step 6: Validation**

Run: `python -m pytest tests/test_module_permission_endpoints.py tests/test_deps_gates.py tests/test_credential_service.py -v`
Expected: PASS

Run: `npm run test:unit -- permission-modules` (workdir `frontend/`)
Expected: PASS — mirror ใหม่ตรง backend registry (`lib/constants/__tests__/permission-modules.test.ts`)

Run: `npm run test:unit -- image-resize` (workdir `frontend/`)
Expected: PASS — image-resize ใช้ `fetch` ที่ interceptor ครอบ, ส่ง cookie/CSRF/ticket ใน body และไม่เรียก generic/public route

Run: `npx tsc --noEmit` (workdir `frontend/`) + `npm run lint` (workdir `frontend/`) + `npm run build` (workdir `frontend/`)
Expected: PASS — frontend mirror, type-check, lint, and production build ผ่าน




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
- ไม่สร้าง public image-resize endpoint หรือเปลี่ยน canvas resize เป็น server-side processing; D7 เพิ่มเฉพาะ authenticated ticket/upload routes ใน `media.py`

## Risks & Mitigations / GOTCHAs

- **LIFF strict mode ปิดฟอร์ม production:** env examples ทุกไฟล์เปลี่ยนเป็น `LIFF_STRICT_MODE=true` (A1) — ผู้ใช้ที่เคยยื่นคำร้องแบบไม่ยืนยันตัวตนจะเริ่มเจอ 401 ทันทีหลัง deploy → frontend ต้องจับ 401 แล้วพาไปยืนยันตัวตนผ่าน LINE ก่อน; เฝ้า log `liff_unverified_attempt` หลัง deploy รอบแรก; rollback ชั่วคราวได้ตามคอมเมนต์ใน env example แต่ต้องนัดถอนกลับ (ห้ามลืม)
- **Secrets migration ทำรหัสหาย:** migration ของ B2 ต้องสำรองค่า plaintext ลงตาราง backup ชั่วคราวก่อนเสมอ แล้วค่อย encrypt → verify (ถอดรหัสเทียบ) → mask; `downgrade` ต้อง restore ค่าเดิมจากตาราง backup กลับเข้า SystemSetting แล้วลบ Credential rows ที่สร้างไว้ (re-encrypt กลับเป็น plaintext จาก backup เท่านั้น ห้ามเดา) และห้าม `DROP TABLE` backup ก่อน verify ว่าครบทุก key; ซ้อม upgrade → downgrade → upgrade ครบใน Step 6 ของ B2
- **Transfer race ตอนโหลดสูง (rowcount=0):** conditional UPDATE ตอบ rowcount=0 ได้ทั้งกรณีถูกแย่งกัน (409) และ session ปิด/หายไปแล้ว (404) — ต้อง re-select แล้วแยกกรณีก่อนตอบตาม B1 Step 3 ห้ามตอบ 409 เฉย ๆ; test ด้วย `asyncio.gather` ให้เห็น winner เดียวเสมอ
- **Redis ลง:** ทุกจุดที่ใช้ `redis_client.get/setex` ต้อง degrade ตามพฤติกรรมเดิม (redis_client.py:103-111) — analytics (C1) คำนวณตรง ๆ + `cache_hit=false`, presence throttle (C8) ต้องมีทาง fallback ไม่ใช้พังทั้ง WebSocket; Redis ลงต้องไม่กลายเป็น 500
- **Alembic head ชนกัน:** B1/B2 ขนานกันได้แต่ห้ามสร้าง migration พร้อมกันโดยไม่เช็ก — ก่อนเริ่ม B2 รัน `python scripts/db_target.py alembic --target local heads` ให้แน่ใจว่ามี head เดียวคือ `t1u2v3w4x5y6` (verified 2026-09-13; `z1a2b3c4d5e6` อยู่กลาง chain — `a2b3c4d5e6f7` revises มันแล้ว — ห้ามใช้เป็น `down_revision`) ถ้าหลาย head ต้อง merge ก่อน แล้วตั้ง `down_revision` จาก head จริง ณ วันรัน
- **CSRF กับ auth แบบ cookie-only:** FastAPI ของ repo นี้ไม่มี `request.session` (ไม่มี session middleware, auth เป็น cookie-only ตาม `backend/app/api/deps.py`) — การเทียบ CSRF token ต้องเป็น double-submit: อ่าน header `x-csrf-token` แล้วเทียบกับ HttpOnly cookie `csrf_token` ด้วย `compare_digest` ตาม pattern ที่ `frontend/lib/csrfStore.ts` ใช้อยู่ (frontend เก็บ token จาก cookie ใน store แล้ว echo กลับผ่าน header และ field `csrf_token` ใน body)
- **Image-resize ticket/Redis ล่ม:** resize upload ต้อง fail closed เมื่อ ticket หมดอายุ, `type`/subject/purpose ไม่ตรง, nonce ถูกใช้แล้ว หรือ Redis consume ไม่สำเร็จ; ticket ต้องไม่ใช้ล็อกอินเป็น access cookie ได้ (`type=image_resize_ticket` เท่านั้น). ห้าม fallback ไป generic `KEY_MANAGE_FILES` หรือรับ raw upload โดยไม่มี `KEY_IMAGE_RESIZE` + CSRF; route resize รับ JPEG/PNG เท่านั้น แม้ generic media route รองรับ PDF.

## Before / After (UX)

- **Wave A:** ประชาชนต้องยืนยันตัวตนผ่าน LINE ก่อนยื่นคำร้อง/อัปโหลดไฟล์เสมอ (เดิมยื่นได้โดยไม่มีตัวตน), ลิงก์ไฟล์ private ที่ไม่มี token ที่ถูกต้องเปิดไม่ได้, หน้า health แบบละเอียดคนนอกระบบเรียกไม่ได้และไม่เห็น error ดิบ
- **Wave B:** เจ้าหน้าที่โอนสายชนกันจะเห็นข้อความไทยว่า "เจ้าหน้าที่อีกคนรับเคสนี้ไปแล้ว" แทนที่เคสจะถูกแย่งเงียบ ๆ; ส่วน secrets — N/A — internal change (ผู้ใช้เห็นแค่คำเตือน "ค่านี้ย้ายไป Credentials แล้ว ห้ามกรอกที่นี่" ในหน้า settings)
- **Wave C:** แดชบอร์ดสถิติเปิดเร็วขึ้นชัดเจน, broadcast มีปุ่มทดลองส่ง (dry-run) ก่อนส่งจริง, พรีวิว rich menu ที่ยังไม่มีรูปเห็น placeholder แทน 403, bot ไม่ค้างจาก pattern พิษ — ส่วนที่เหลือของ Wave นี้ N/A — internal change
- **Wave D:** เปิดเคสเก่า/ส่งออกไฟล์ใหญ่ได้โดยไม่ค้าง, สร้าง shortcut ซ้ำได้ 409 ที่อ่านรู้เรื่อง, รายงาน CSV ไม่มี PII ดิบ, ปุ่ม/สีใหม่เป็น opt-in — ส่วนที่เหลือ N/A — internal change
- **Image-resize:** เดิมปุ่มอิง `manage_files` และ hook ส่ง `fetch` ไป generic media; หลังแก้ ผู้มี `image_resize` เท่านั้นจึงใช้ action ได้ และ upload ผ่าน `fetch` ที่ AuthProvider ติดตั้ง interceptor เติม cookie/CSRF + ticket อายุ 5 นาที/nonce โดย media library เดิมไม่เปลี่ยน

## Edge-Case Checklist

- [ ] ตารางว่างในช่วง `days` → `percentile_cont` คืน NULL → fallback `p50 or 0` ตอบ 0.0 ไม่ 500 (C1)
- [ ] `limit=0` / ค่าติดลบ → clamp/cap เข้าช่วงก่อน query (D1 messages clamp-only, D4 friends `le=100`)
- [ ] LIFF token หมดอายุ / LINE ปฏิเสธ → 401 ข้อความไทย ไม่เขียน DB (A1, D3)
- [ ] PATCH/PUT body ว่าง / ฟิลด์เป็น None ทั้งหมด → 422 ไม่ 500 (C6 booking, D2 canned — `liff.py` ไม่มี PATCH จึงไม่มีเคสนี้ใน D3)
- [ ] โอนสายพร้อมกัน → rowcount=0 → re-select แยก 409 (ถูกแย่ง) กับ 404 (session หาย) (B1)
- [ ] Redis ลงระหว่างเรียก analytics → cache miss → คำนวณตรง ๆ + `cache_hit=false` ไม่ 500 (C1)
- [ ] rich-menu sync ที่ยังไม่มีรูป → ข้ามเมนูนั้นพร้อมเหตุผล ไม่ล้มทั้งชุด (C7)
- [ ] ชื่อไฟล์ส่งออกภาษาไทย → `Content-Disposition` ใช้ `filename*` encode ตาม RFC 5987 ไม่เพี้ยน (D1)
- [ ] image-resize anonymous → 401; role ไม่มี `image_resize` → 403; missing/mismatched CSRF → 403; expired/wrong-type/wrong-subject/replayed ticket → 401/403/409 ตาม failure mode โดยไม่มี MediaFile ใหม่; ticket ใส่ access cookie ต้อง 401; PDF ต้อง 422, Redis ลงต้อง 503 และไม่มีไฟล์ใหม่ (D7)
- [ ] image-resize valid path → `fetch` ผ่าน interceptor ส่ง ticket ใน multipart body + cookie/CSRF header, ticket ไม่อยู่ใน URL/log และ generic media permission ไม่ถูกใช้แทน (D7)

## Self-Review (ตรวจซ้ำ 2026-09-21 หลังแก้ตาม PRP validation review รอบ 2)

**1. Spec coverage (PRD ข้อ → Task):** C2 stories 1–4 → A1; C3 stories 5–6 → A2; C5 stories 7–8 → A3; C1 stories 9–11 → B1; C4 stories 12–14 → B2; stories 15–16 → C1; story 17 (lock param) → B1 (คง `lock` param + conditional UPDATE); stories 18–19 → C8 (ghost-push guard + presence throttle — `test_push_after_transfer_blocked`, `test_presence_burst_bounded`); story 20 → D1 (endpoint clamp + cursor เดิม); story 21 → D1 (streaming export + Thai font + RFC 5987); stories 22–23 → D2 (normalize 409 + `updated_at` guard); stories 24–25 → D3 (timeout/retry/502 + route-inventory proof; no applicable LIFF GET/PATCH route remains); stories 26–27 → C2 (dry-run + backoff); story 28 → C3; story 29 → C4; stories 30–31 → C5; stories 32–33 → C6; stories 34–35 → C7; stories 36–37 → D4; story 38 → D7 (authenticated resize ticket/upload + permission + CSRF + expiry; no public endpoint); story 39 → D5; story 40 → D6; story 41 → D7 (2 keys + gates); stories 42–43 → ทุก task (ข้อความไทย + audit ใน C5/B1/D4-D7). Out-of-scope เคารพครบ (ไม่เปลี่ยน SDK/auth/WS protocol ใหม่; ไม่สร้าง public `/api/v1/image-resize`).

**2. Single-definition + banned-string scan (ผล grep จริง 2026-09-13):** `grep -o '^### Task [A-D][0-9]*'` → 20 headings, แต่ละ ID ปรากฏครั้งเดียว (A1–A3, B1–B2, C1–C8, D1–D7); pattern ของ stale copy ไม่เหลือแล้ว — ไม่มี test_client ที่ถูก await, ไม่มี fixture DB กลาง, ไม่มี session-middleware access, ไม่มี PUT head จริง (เหลือแค่ prohibition ใน Global Constraints :22 ที่ห้ามไว้); Pydantic เหลือแค่ prohibition note + `model_copy` ที่ B2; `httpx.AsyncClient` ที่เหลืออยู่ใน D3 เท่านั้น (production class ใต้ test — :2288, :2317, :2349); `pytest_asyncio` ปรากฏ 13 จุด (5 import blocks + 5 async fixtures + Global Constraints + D1 import/fixture).

**3. Type consistency (ทุกชื่อมีนิยามในไฟล์นี้ — ผล grep):** `require_liff_identity(x_liff_id_token: Optional[str]) -> str` (A1 reference already landed, D3 reuse); `check_private_token(stored, presented) -> bool` (A2); `TRANSFER_ERR_CONFLICT` (B1: errors.py + export ใน `__init__.py` + map 409; signature `transfer_session` ไม่เปลี่ยน); `SECRET_DENY_LIST: frozenset[str]` (B2 — service + migration + mask ใช้ชื่อเดียวกัน); `DashboardResponse.cache_hit: bool` (C1); `BroadcastCreate.dry_run: bool` + `BroadcastDryRunResponse` (C2); `compile_intent_keyword` + `invalidate_intent_regex_cache` + `_like_safe` (C3); `OBJECT_ID_RE = ^\$[A-Za-z][A-Za-z0-9_]{2,39}$` (C4); `RequestStatus` 6 ค่าเดิม — ห้าม DONE/CANCELLED (C5); `BookingWindowError` + `validate_booking_date` + `MAX_ADVANCE_BOOKING_DAYS = 62` (C6); `preview` route + per-menu try (C7); `normalize_text` (D2); `mask_line_id/mask_phone` นิยามใน `backend/app/core/pii_masking.py` (D4) → D5 ใช้ผ่าน `_csv_line_id` (import กลาง ห้าม import จาก endpoint/เขียนซ้ำ); `buttonVariants` (D6 — test ล็อก primary/danger); `KEY_MANAGE_CREDENTIALS/KEY_EDIT_BUSINESS_HOURS` ครบ 4 จุด (constants, `DEFAULT_POLICY: dict[str, frozenset[UserRole]]`, descriptions, registry) และ image-resize ticket claims ใช้ `create_access_token`/`verify_token` เดิม (D7). D1 ตัดสินแล้ว: clamp-only ไม่ใช้ `le=` (ใช้ `le` จะได้ 422 ขัด PRD) — test คาด 200 + clamp.

**4. PRP validation correction (2026-09-21):** เพิ่ม `Metadata`, `Step-by-Step Tasks`, global validation contract และฟิลด์ `ACTION`/`IMPLEMENT`/`MIRROR`/`VALIDATE`/`GOTCHA` ให้ครบทั้ง 20 tasks; เพิ่มคำสั่ง frontend `npx tsc --noEmit`, `npm run lint`, และ `npm run build` ใน validation ของงานที่เกี่ยวข้อง.

**5. Round-2 review corrections (2026-09-21):** A1 ระบุ baseline `d5b6491` และเหลือเฉพาะ residual tests; D3 เพิ่ม route-inventory proof แทนการอ้าง grep อย่างเดียว; D4/D5 ใช้ helper กลาง `app.core.pii_masking`; D7 แก้จาก false client-only/verify-only claim เป็น authenticated media upload ที่ตรวจ permission, CSRF, signed expiry และ nonce พร้อม backend/frontend tests.

**6. Round-3 review corrections (2026-09-21):** D3 inventory เปลี่ยนเป็น equality บน `app.routes`/full path เพื่อให้ route ใหม่ทุกชนิดทำ test แดง; D7 ใช้ `fetch` ภายใต้ `AuthProvider` interceptor พร้อม native-transport CSRF assertion; ระบุ media helper extraction, imports, Redis tri-state, nonce consumption timing, audit events และ Thai error contracts.

**7. Round-4 review corrections (2026-09-21):** PRD story 25 ทำให้ conditional ตาม runtime inventory จริง (ไม่มี LIFF GET/PATCH วันนี้; route ใหม่ต้องเพิ่ม tests ก่อน); D7 `type=image_resize_ticket` แยกจาก access cookie และตรวจซ้ำบน upload; แทน undefined fixtures ด้วย `resize_setup` ที่สร้างผู้ใช้/คุกกี้/Redis double/cleanup ครบ, ใช้ PNG จริง, เพิ่ม access-cookie abuse, CSRF, PDF, expiry, replay, Redis outage และ audit assertions; MIRROR ชี้ `installAdminAuthFetchInterceptor`/`setCsrfToken` ที่มีอยู่. ทั้งหมดเป็นแผน/PRD ยังไม่ได้รัน tests หรืออ้างว่า implementation ผ่าน.
