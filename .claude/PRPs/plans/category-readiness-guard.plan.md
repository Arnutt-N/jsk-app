# Category Readiness Badge + PUT `is_active` Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ "สถานะพร้อมใช้" (readiness) ของ intent category แม่นยำตรงกับ webhook และอุดช่องโหว่ที่ API เปิด category ที่ยังไม่มี active response ได้

**Architecture:** เพิ่ม `active_response_count` (นับ `IntentResponse.is_active==True`) ลงใน GET categories, เพิ่ม guard ที่ `PUT /categories/{id}` ให้ปฏิเสธการตั้ง `is_active=true` เมื่อ 0 active response, และแก้ frontend ให้ dot 3 สี + StatsCard นับ active จริง โดยดึงตรรกะ readiness เป็น pure helper ที่ test ได้

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async (Postgres `FILTER` clause), Pydantic v2; Next.js/React + Tailwind semantic color tokens; pytest (dependency-override + fake DB, ไม่ต้องมี DB จริง), vitest

## Global Constraints

- **นิยาม serviceable (ห้ามแตกต่างจาก webhook):** `is_active == True` **และ** `active_response_count > 0` — ยึดจาก `backend/app/api/v1/endpoints/webhook.py:249`
- **Guard เฉพาะ `PUT /categories/{id}`** — ไม่แตะ `POST` (chicken-egg), การปิด (`is_active=false`) ผ่านเสมอ, การแก้ field อื่นโดยไม่ส่ง `is_active` ไม่ถูกบล็อก
- **dot 3 สี:** ready→`bg-success`, incomplete→`bg-warning`, inactive→`bg-border-hover` (มี `--color-warning` ใน `frontend/app/globals.css:32`)
- **ข้อความ error เป็นภาษาไทย**; identifier/โค้ดเป็นอังกฤษ
- **ไม่มี DB migration** (ใช้คอลัมน์ `is_active` เดิม); deploy backend→Koyeb (`cd.yml`), frontend→Vercel, PR เดียว
- **Test แบบ dependency-override + fake DB** (mirror `backend/tests/test_rich_menu_alias_endpoints.py`) — ไม่พึ่ง docker/DB จริง

---

## File Structure

- `backend/app/schemas/intent.py` — เพิ่ม field `active_response_count` ใน `IntentCategoryResponse`
- `backend/app/api/v1/endpoints/admin_intents.py` — เพิ่ม helper `_response_counts()`, wire เข้า `list_categories`, เพิ่ม guard ใน `update_category`
- `backend/tests/test_intent_category_readiness.py` — **สร้างใหม่**: unit test helper + endpoint test GET/PUT guard (fake DB)
- `frontend/lib/chatbot-readiness.ts` — **สร้างใหม่**: pure helper `getCategoryReadiness` / `readinessDotClass` / `readinessLabel`
- `frontend/lib/__tests__/chatbot-readiness.test.ts` — **สร้างใหม่**: unit test helper
- `frontend/app/admin/chatbot/page.tsx` — type + StatsCard (`:118`) + dot (`:187`)

---

## Task 1: Backend — `active_response_count` field + count helper

**Files:**
- Modify: `backend/app/schemas/intent.py:67-76`
- Modify: `backend/app/api/v1/endpoints/admin_intents.py:20-50`
- Test: `backend/tests/test_intent_category_readiness.py` (create)

**Interfaces:**
- Produces: `_response_counts(db, category_id: int) -> tuple[int, int]` returns `(total, active)`; `IntentCategoryResponse.active_response_count: int`

- [ ] **Step 1: Write the failing test (helper)**

สร้าง `backend/tests/test_intent_category_readiness.py`:
```python
"""Readiness count helper + PUT is_active guard (issue #122 follow-up).

Uses FastAPI dependency-override + a fake async DB (mirrors
test_rich_menu_alias_endpoints.py) so no real DB is required.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.permissions import invalidate_cache
from app.main import app
from app.models.user import UserRole


# --- fake DB primitives -----------------------------------------------------
class _Result:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def first(self):
        return self._value[0] if self._value else None

    def all(self):
        return list(self._value)

    def one(self):
        return self._value  # a tuple, e.g. (total, active)


class _FakeDB:
    def __init__(self, execute_results=None, scalar_results=None):
        self._exec = list(execute_results or [])
        self._scalar = list(scalar_results or [])
        self.committed = False

    async def execute(self, stmt):
        return _Result(self._exec.pop(0))

    async def scalar(self, stmt):
        return self._scalar.pop(0)

    def add(self, obj):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass


def _cat(id=1, name="ราคา", is_active=True):
    return SimpleNamespace(
        id=id, name=name, description=None, is_active=is_active,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


# --- helper unit test -------------------------------------------------------
@pytest.mark.asyncio
async def test_response_counts_filters_active():
    from app.api.v1.endpoints.admin_intents import _response_counts

    db = _FakeDB(execute_results=[(3, 2)])
    total, active = await _response_counts(db, category_id=1)

    assert total == 3
    assert active == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_intent_category_readiness.py::test_response_counts_filters_active -v`
Expected: FAIL with `ImportError: cannot import name '_response_counts'`

- [ ] **Step 3: Add the schema field**

`backend/app/schemas/intent.py` — ใน `IntentCategoryResponse` (หลัง `response_count: int = 0` บรรทัด 73):
```python
    active_response_count: int = 0  # responses ที่ is_active == True (serviceable def, webhook.py:249)
```

- [ ] **Step 4: Add the helper + wire into `list_categories`**

`backend/app/api/v1/endpoints/admin_intents.py` — เพิ่ม helper ก่อน `list_categories` (หลังบรรทัด 17 `router = APIRouter()`):
```python
async def _response_counts(db: AsyncSession, category_id: int) -> tuple[int, int]:
    """คืน (total, active) จำนวน IntentResponse ของ category ใน query เดียว.

    ใช้ Postgres FILTER clause นับ 'ทั้งหมด' กับ 'active' พร้อมกัน (ไม่เพิ่ม
    round-trip). active = is_active == True — ตรงเกณฑ์ serviceable ใน webhook.py:249.
    """
    row = (await db.execute(
        select(
            func.count(IntentResponse.id),
            func.count(IntentResponse.id).filter(IntentResponse.is_active == True),
        ).where(IntentResponse.category_id == category_id)
    )).one()
    return int(row[0]), int(row[1])
```

แทนที่บล็อกนับ response ใน `list_categories` (บรรทัด 36-47) — เปลี่ยนบรรทัด `r_count = ...` เป็นการเรียก helper และเซ็ต field ใหม่:
```python
        k_count = await db.scalar(select(func.count(IntentKeyword.id)).filter(IntentKeyword.category_id == cat.id))
        r_total, r_active = await _response_counts(db, cat.id)

        # Fetch first 5 keywords for preview
        kw_stmt = select(IntentKeyword.keyword).filter(IntentKeyword.category_id == cat.id).limit(5)
        kw_result = await db.execute(kw_stmt)
        keywords_preview = [kw for kw in kw_result.scalars().all()]

        resp = IntentCategoryResponse.model_validate(cat)
        resp.keyword_count = k_count
        resp.response_count = r_total
        resp.active_response_count = r_active
        resp.keywords_preview = keywords_preview
        out.append(resp)
```

- [ ] **Step 5: Run helper test to verify it passes**

Run: `cd backend && python -m pytest tests/test_intent_category_readiness.py::test_response_counts_filters_active -v`
Expected: PASS

- [ ] **Step 6: Write the GET endpoint test**

เพิ่มใน `backend/tests/test_intent_category_readiness.py`:
```python
CATEGORIES_URL = "/api/v1/admin/intents/categories"


def _override_db_and_admin(db):
    invalidate_cache()

    async def _get_db():
        yield db

    async def _get_user():
        return SimpleNamespace(
            id=7, username="tester", display_name="Tester",
            role=UserRole.ADMIN, is_active=True,
        )

    app.dependency_overrides[deps.get_db] = _get_db
    app.dependency_overrides[deps.get_current_user] = _get_user


def _clear():
    app.dependency_overrides.clear()
    invalidate_cache()


def test_get_categories_exposes_active_response_count():
    # list_categories issues, per category: execute(categories),
    # scalar(keyword count), execute(counts .one()), execute(keywords preview)
    db = _FakeDB(
        execute_results=[[_cat()], (3, 2), ["ราคา"]],
        scalar_results=[2],
    )
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.get(CATEGORIES_URL)
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    body = resp.json()[0]
    assert body["response_count"] == 3
    assert body["active_response_count"] == 2
    assert body["keyword_count"] == 2
```

- [ ] **Step 7: Run the GET test to verify it passes**

Run: `cd backend && python -m pytest tests/test_intent_category_readiness.py -v`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/intent.py backend/app/api/v1/endpoints/admin_intents.py backend/tests/test_intent_category_readiness.py
git commit -m "feat(chatbot): add active_response_count to GET intent categories (#122 follow-up)"
```

---

## Task 2: Backend — PUT `is_active` guard

**Files:**
- Modify: `backend/app/api/v1/endpoints/admin_intents.py:77-89`
- Test: `backend/tests/test_intent_category_readiness.py` (append)

**Interfaces:**
- Consumes: `_cat()`, `_FakeDB`, `_override_db_and_admin`, `_clear`, `CATEGORIES_URL` from Task 1
- Produces: `PUT /categories/{id}` returns 400 when `is_active=true` requested while active response count == 0

- [ ] **Step 1: Write the failing guard tests**

เพิ่มใน `backend/tests/test_intent_category_readiness.py`:
```python
def test_put_activate_without_active_response_returns_400():
    db = _FakeDB(execute_results=[[_cat(is_active=False)]], scalar_results=[0])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"is_active": True})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 400
    assert "active response" in resp.json()["detail"]
    assert db.committed is False


def test_put_activate_with_active_response_ok():
    db = _FakeDB(execute_results=[[_cat(is_active=False)]], scalar_results=[1])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"is_active": True})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert db.committed is True


def test_put_name_only_not_blocked_when_incomplete():
    # active-but-incomplete category; editing name (no is_active) must NOT be blocked.
    db = _FakeDB(execute_results=[[_cat(is_active=True)]], scalar_results=[])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"name": "ราคาใหม่"})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert db.committed is True


def test_put_deactivate_always_ok():
    db = _FakeDB(execute_results=[[_cat(is_active=True)]], scalar_results=[])
    _override_db_and_admin(db)
    client = TestClient(app)
    try:
        resp = client.put(f"{CATEGORIES_URL}/1", json={"is_active": False})
    finally:
        client.close()
        _clear()

    assert resp.status_code == 200
    assert db.committed is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_intent_category_readiness.py -k "put_" -v`
Expected: `test_put_activate_without_active_response_returns_400` FAILs (returns 200, no guard yet); the `scalar_results=[]` cases raise `IndexError` on the extra scalar call (guard not yet gated) — confirms guard missing

- [ ] **Step 3: Add the guard to `update_category`**

`backend/app/api/v1/endpoints/admin_intents.py` — แทน body ของ `update_category` (บรรทัด 77-89) ด้วย:
```python
@router.put("/categories/{cat_id}", response_model=IntentCategoryResponse)
async def update_category(cat_id: int, data: IntentCategoryUpdate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentCategory).filter(IntentCategory.id == cat_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    payload = data.model_dump(exclude_unset=True)

    # Guard (#122 follow-up): ห้ามเปิดใช้งานหมวดที่ยังไม่มี active response.
    # เกณฑ์ serviceable ตรงกับ webhook.py:249 (is_active AND >=1 active response).
    if payload.get("is_active") is True:
        active_count = await db.scalar(
            select(func.count(IntentResponse.id)).where(
                IntentResponse.category_id == cat_id,
                IntentResponse.is_active == True,
            )
        )
        if not active_count:
            raise HTTPException(
                status_code=400,
                detail="ไม่สามารถเปิดใช้งานหมวดนี้ได้ เพราะยังไม่มีการตอบกลับที่เปิดใช้งาน (active response) — กรุณาเพิ่มอย่างน้อย 1 รายการก่อน",
            )

    for field, value in payload.items():
        setattr(cat, field, value)

    await db.commit()
    await db.refresh(cat)
    return cat
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_intent_category_readiness.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full intent/webhook suite (no regression)**

Run: `cd backend && python -m pytest tests/test_webhook_intent_fallthrough.py tests/test_webhook_intent_matching.py tests/test_intent_category_readiness.py -v`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/endpoints/admin_intents.py backend/tests/test_intent_category_readiness.py
git commit -m "feat(chatbot): guard PUT category is_active=true against zero active responses (#122 follow-up)"
```

---

## Task 3: Frontend — readiness helper + 3-color dot + StatsCard

**Files:**
- Create: `frontend/lib/chatbot-readiness.ts`
- Create: `frontend/lib/__tests__/chatbot-readiness.test.ts`
- Modify: `frontend/app/admin/chatbot/page.tsx:21-26` (type), `:118` (StatsCard), `:187` (dot)

**Interfaces:**
- Produces: `getCategoryReadiness(cat) -> 'ready'|'incomplete'|'inactive'`, `readinessDotClass(r) -> string`, `readinessLabel(r) -> string`

- [ ] **Step 1: Write the failing helper test**

สร้าง `frontend/lib/__tests__/chatbot-readiness.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getCategoryReadiness, readinessDotClass } from '../chatbot-readiness';

describe('getCategoryReadiness', () => {
  it('returns ready when active and has active responses', () => {
    expect(getCategoryReadiness({ is_active: true, active_response_count: 2 })).toBe('ready');
  });
  it('returns incomplete when active but zero active responses', () => {
    expect(getCategoryReadiness({ is_active: true, active_response_count: 0 })).toBe('incomplete');
  });
  it('returns inactive when not active regardless of responses', () => {
    expect(getCategoryReadiness({ is_active: false, active_response_count: 5 })).toBe('inactive');
  });
});

describe('readinessDotClass', () => {
  it('maps readiness to the right Tailwind color', () => {
    expect(readinessDotClass('ready')).toBe('bg-success');
    expect(readinessDotClass('incomplete')).toBe('bg-warning');
    expect(readinessDotClass('inactive')).toBe('bg-border-hover');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/__tests__/chatbot-readiness.test.ts`
Expected: FAIL — cannot resolve `../chatbot-readiness`

- [ ] **Step 3: Create the helper**

สร้าง `frontend/lib/chatbot-readiness.ts`:
```ts
export type CategoryReadiness = 'ready' | 'incomplete' | 'inactive';

export interface ReadinessInput {
  is_active: boolean;
  active_response_count: number;
}

/** เกณฑ์ serviceable ตรงกับ backend webhook.py:249 (is_active AND active_response_count > 0). */
export function getCategoryReadiness(cat: ReadinessInput): CategoryReadiness {
  if (!cat.is_active) return 'inactive';
  return cat.active_response_count > 0 ? 'ready' : 'incomplete';
}

/** คลาส Tailwind ของจุดสถานะ (dot). */
export function readinessDotClass(readiness: CategoryReadiness): string {
  switch (readiness) {
    case 'ready':
      return 'bg-success';
    case 'incomplete':
      return 'bg-warning';
    case 'inactive':
      return 'bg-border-hover';
  }
}

/** ป้ายกำกับสถานะ (ไทย) สำหรับ title/aria-label. */
export function readinessLabel(readiness: CategoryReadiness): string {
  switch (readiness) {
    case 'ready':
      return 'พร้อมใช้งาน';
    case 'incomplete':
      return 'เปิดอยู่แต่ยังไม่มีการตอบกลับที่เปิดใช้งาน';
    case 'inactive':
      return 'ปิดใช้งาน';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/__tests__/chatbot-readiness.test.ts`
Expected: PASS (5 assertions across 2 suites)

- [ ] **Step 5: Wire helper into the page**

`frontend/app/admin/chatbot/page.tsx`:

(a) เพิ่ม field ใน type (บรรทัด 21-26) — หลัง `response_count: number;`:
```tsx
    active_response_count: number;
```

(b) เพิ่ม import (ใกล้ import อื่นด้านบนไฟล์):
```tsx
import { getCategoryReadiness, readinessDotClass, readinessLabel } from '@/lib/chatbot-readiness';
```

(c) StatsCard "Active Responses" (บรรทัด 118) — เปลี่ยน `value`:
```tsx
                        value={intentCategories.reduce((acc: number, curr) => acc + curr.active_response_count, 0)}
```

(d) dot (บรรทัด 187) — แทน `<span className=... />` ด้วย:
```tsx
                                    {(() => {
                                        const readiness = getCategoryReadiness(category);
                                        return (
                                            <span
                                                className={`w-2 h-2 rounded-full ${readinessDotClass(readiness)}`}
                                                title={readinessLabel(readiness)}
                                                aria-label={readinessLabel(readiness)}
                                            />
                                        );
                                    })()}
```

- [ ] **Step 6: Verify lint + types + build**

Run: `cd frontend && npx tsc --noEmit && npx eslint app/admin/chatbot/page.tsx lib/chatbot-readiness.ts`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/chatbot-readiness.ts frontend/lib/__tests__/chatbot-readiness.test.ts frontend/app/admin/chatbot/page.tsx
git commit -m "feat(chatbot): 3-state readiness dot + active-response StatsCard on chatbot page (#122 follow-up)"
```

---

## Task 4: Full validation + PR

- [ ] **Step 1: Backend full suite**

Run: `cd backend && python -m pytest`
Expected: PASS (existing + 6 new)

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/category-readiness-guard
gh pr create --base main --title "feat(chatbot): category readiness badge + PUT is_active guard (#122 follow-up)" --body "..."
```
PR body: อ้าง spec `.claude/PRPs/prds/category-readiness-guard.prd.md`, สรุป 3 การเปลี่ยน (active_response_count / PUT guard / 3-color dot+StatsCard), test plan (backend 6 + frontend 5), deploy note (Koyeb backend + Vercel frontend, no migration).

---

## Self-Review

**1. Spec coverage:**
- `active_response_count` field (spec §A) → Task 1 ✓
- GET นับ total+active query เดียว (spec §A, FILTER) → Task 1 `_response_counts` ✓
- PUT guard 400 + ข้อความไทย (spec §B) → Task 2 ✓
- guard เฉพาะ is_active=true, ไม่แตะ name-only/deactivate/POST (spec §B) → Task 2 tests 3,4 + no POST change ✓
- dot 3 สี (spec §C) → Task 3 `readinessDotClass` ✓
- StatsCard นับ active (spec §C) → Task 3 step 5c ✓
- Test 5 backend cases (spec §Test) → Task 1 (helper+GET) + Task 2 (4 guard) = 6 ✓
- Frontend dot-color logic test (spec §Test) → Task 3 ✓
- No migration / Koyeb+Vercel (spec §Deploy) → Task 4 ✓

**2. Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ด/คำสั่งจริง ✓ (PR body ระบุโครงเนื้อหาไว้ — เขียนจริงตอน Task 4)

**3. Type consistency:** `_response_counts -> (int,int)` ใช้ตรงกันใน Task 1; `active_response_count` ชื่อตรงกันทั้ง schema/frontend type/helper; `getCategoryReadiness`/`readinessDotClass`/`readinessLabel` ชื่อตรงกัน Task 3 helper↔page↔test ✓

**Note:** `_response_counts` ใช้ `db.execute(...).one()` (ไม่ใช่ `db.scalar`) — fake DB ใน test จึงมีทั้ง `execute` และ `scalar`; guard ใช้ `db.scalar(...)` (คืน int ตรง) เพื่อความกระชับ — ทั้งคู่รองรับใน `_FakeDB`
