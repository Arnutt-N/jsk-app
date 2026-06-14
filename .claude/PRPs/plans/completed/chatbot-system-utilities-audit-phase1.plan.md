# Plan: Phase 1 — Audit & Critical Fixes (Role Access Wiring)

## Summary
ปิด "dead policy" ที่ DIRECTOR/HEAD เข้าถึง request workflow ไม่ได้ (ถูก `get_current_admin` บล็อกก่อนถึง `can_*` guards), เติม role ที่ขาดใน frontend type, และจัดทำ audit report เป็น single source of truth — ทั้งหมดยึด least-privilege (ไม่เปิด sensitive endpoints เกิน).

## User Story
As a **DIRECTOR/HEAD (ผอ./หัวหน้าฝ่าย)**, I want **ให้สิทธิ์ assign/self-assign ที่ระบบตั้งไว้ทำงานจริง และเห็นเมนูที่ฉันมีสิทธิ์**, so that **ฉันมอบหมาย/รับงานคำร้องได้ตามบทบาท โดยระบบไม่เปิดสิทธิ์ความลับเกินจำเป็น**.

## Problem → Solution
**Current**: `get_current_admin`=[ADMIN, SUPER_ADMIN] คุมทุก request endpoint → DIRECTOR/HEAD ถูกบล็อกที่ประตู, `can_assign`/`can_self_assign` (ที่ตั้งใจอนุญาต DIRECTOR/HEAD) ไม่มีวันถูกเรียกถึง = dead policy. Frontend `StaffRole` type ใน 2 ไฟล์ขาด DIRECTOR/HEAD → cast พัง + sidebar ว่าง.
**Desired**: gate ใหม่ `get_current_manager` เปิดเฉพาะ request workflow ให้ DIRECTOR/HEAD (sensitive ops ยังถูก `can_*` ชั้นในป้องกัน), frontend type ตรงกับ backend enum, audit report เป็นเอกสารอ้างอิง.

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/chatbot-system-utilities-audit.prd.md`
- **PRD Phase**: Phase 1 — Audit & Critical Fixes (MVP)
- **Estimated Files**: ~10 (3 backend src, 2 frontend src, 2-3 test, 1 audit doc)

---

## UX Design

### Before
```
DIRECTOR/HEAD login ✅ → เห็น sidebar ว่างเปล่า (ไม่มี nav item allow role นี้)
                       → เปิด /admin/requests → 403 "Insufficient permissions"
                       → assign งานไม่ได้ ทั้งที่ policy บอกว่าได้
```

### After
```
DIRECTOR/HEAD login ✅ → เห็นกลุ่ม "Service Requests" (Dashboard, Manage Requests)
                       → เปิด /admin/requests ✅ → assign/self-assign ได้จริง
                       → revert approval / edit details → ยังถูกบล็อก (403) ตาม policy
                       → credentials/permissions/users → ยังเข้าไม่ได้ (sensitive)
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| DIRECTOR/HEAD → request list/detail | 403 | 200 (เข้าได้) | gate → manager |
| DIRECTOR/HEAD → assign/self-assign | unreachable | ทำได้ | inner `can_*` อนุญาต |
| DIRECTOR/HEAD → revert/edit-details | n/a | 403 (บล็อก) | inner `can_*` ปฏิเสธ |
| DIRECTOR/HEAD → DELETE request | 403 | 403 (คงเดิม) | คง `get_current_admin` |
| DIRECTOR/HEAD → sidebar | ว่าง | เห็น Service Requests | type + allowedRoles |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/api/deps.py` | 109-138 | gate ที่จะแก้ + สร้างใหม่ — ตาม pattern เป๊ะ |
| P0 | `backend/app/api/v1/endpoints/admin_requests.py` | 1-20, 79-84, 352-561 | imports + endpoints ที่เปลี่ยน gate + can_* guards ชั้นใน |
| P0 | `backend/app/core/permissions.py` | 50-75, 225-247 | DEFAULT_POLICY + can_* helpers (ห้ามแก้ — แค่พึ่งพา) |
| P1 | `frontend/app/admin/layout.tsx` | 28-37, 156-207 | MenuItem/StaffRole type + menuGroups + isMenuItemVisible |
| P1 | `frontend/components/admin/UserMenu.tsx` | 30, 46-50 | StaffRole type ที่ขาด DIRECTOR/HEAD |
| P1 | `frontend/contexts/AuthContext.tsx` | 7-14 | source of truth: User.role union (มี 6 roles ครบ) |
| P1 | `frontend/components/admin/PageAccessGuard.tsx` | 8-28 | reference: ทำ DIRECTOR/HEAD ถูกแล้ว — mirror วิธีนี้ |
| P2 | `backend/tests/test_permissions.py` | all | test pattern: parametrize ทุก role + DEFAULT_POLICY |
| P2 | `backend/tests/test_auth_login.py` | 1-34 | test pattern: SimpleNamespace mock + _ADMIN_AUTH_ROLES assertion |

## External Documentation
No external research needed — feature uses established internal patterns (FastAPI dependency gates, role enum, pytest parametrize). ทุกอย่างอยู่ใน codebase แล้ว.

---

## Patterns to Mirror

### GATE_DEPENDENCY_PATTERN
```python
// SOURCE: backend/app/api/deps.py:125-138
async def get_current_staff(
    current_user = Depends(get_current_user)
):
    """
    Verify current user is an admin, super_admin, or agent.
    """
    from app.models.user import UserRole

    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user
```
→ gate ใหม่ `get_current_manager` ต้องตามรูปนี้เป๊ะ (local import UserRole, 403 + "Insufficient permissions").

### INNER_PERMISSION_GUARD (ห้ามแตะ — ป้องกัน sensitive ops)
```python
// SOURCE: backend/app/api/v1/endpoints/admin_requests.py:382-416
if is_changing_assignee:
    ...
    is_self_assign = update_data.assigned_agent_id == current_admin.id
    if is_self_assign and not can_self_assign(current_admin.role):
        raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์รับเรื่องด้วยตนเอง (self-assign)")
    if not is_self_assign and not can_assign(current_admin.role):
        raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์มอบหมายงานให้ผู้อื่น")
...
if is_revert_from_completed and not can_revert_approval(current_admin.role):
    raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ยกเลิกการอนุมัติ")
```
→ guards เหล่านี้คือเหตุผลที่เปลี่ยน gate เป็น manager แล้วปลอดภัย: DIRECTOR/HEAD assign ได้ แต่ revert/edit-details ยังถูกปฏิเสธ.

### TEST_PARAMETRIZE_PATTERN
```python
// SOURCE: backend/tests/test_permissions.py:19-32
@pytest.mark.parametrize(
    "role,expected",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, False),
        (UserRole.HEAD, False),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
        (None, False),
    ],
)
def test_can_revert_approval(role, expected):
    assert can_revert_approval(role) is expected
```

### GATE_TEST_PATTERN (async + SimpleNamespace mock)
```python
// SOURCE: backend/tests/test_auth_login.py:43-60 (adapt for gate)
@pytest.mark.asyncio
async def test_login_returns_401_for_invalid_stored_hash() -> None:
    db = AsyncMock()
    ...
    with pytest.raises(HTTPException) as exc_info:
        await login(LoginRequest(username="admin", password="admin1234"), db)
    assert exc_info.value.status_code == 401
```
→ gate tests: สร้าง `SimpleNamespace(role=UserRole.DIRECTOR)` ส่งเข้า `get_current_manager(current_user=...)`, assert ไม่ raise; ส่ง `UserRole.USER` assert raise 403.

### FRONTEND_ROLE_TYPE_SOURCE_OF_TRUTH
```typescript
// SOURCE: frontend/contexts/AuthContext.tsx:11-13
// Mirrors backend UserRole enum (backend/app/models/user.py).
// DIRECTOR + HEAD added 2026-05-04 alongside the request workflow split.
role: 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT' | 'USER';
```
→ `StaffRole` ใน layout.tsx + UserMenu.tsx ต้องเป็น subset ที่รวม DIRECTOR/HEAD (ตัด USER ออก เพราะไม่ใช่ staff).

### NAV_ALLOWEDROLES_PATTERN
```typescript
// SOURCE: frontend/app/admin/layout.tsx:160-161
{ name: 'Dashboard', href: '/admin', icon: LayoutDashboard, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
{ name: 'Manage Requests', href: '/admin/requests', icon: FileText, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
```
→ เพิ่ม 'DIRECTOR', 'HEAD' เข้า allowedRoles ของ 2 item นี้ (Service Requests group) เท่านั้น.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/api/deps.py` | UPDATE | เพิ่ม `get_current_manager`; เติม DIRECTOR/HEAD ใน `get_current_staff` |
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | เปลี่ยน import + gate ของ view/workflow endpoints → manager; คง DELETE = admin |
| `frontend/app/admin/layout.tsx` | UPDATE | type MenuItem.allowedRoles + StaffRole += DIRECTOR/HEAD; nav Service Requests allowedRoles |
| `frontend/components/admin/UserMenu.tsx` | UPDATE | StaffRole type += DIRECTOR/HEAD |
| `backend/tests/test_deps_gates.py` | CREATE | unit test gate ใหม่ + staff gate ครบทุก role |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATE | DIRECTOR/HEAD assign ได้, revert/delete ถูกบล็อก |
| `frontend/app/admin/__tests__/nav-visibility.test.ts` | CREATE | isMenuItemVisible: DIRECTOR/HEAD เห็น Service Requests, ไม่เห็น System |
| `.claude/PRPs/reports/chatbot-system-utilities-audit-report.md` | CREATE | audit report single source of truth (รวมผล agents) |

## NOT Building
- **ไม่แตะ `get_current_admin`** — sensitive endpoints (credentials, permissions, users, settings) คงเป็น ADMIN/SUPER_ADMIN
- **ไม่ rename enum/label** `AGENT`→Operator — เป็นงาน Phase 2
- **ไม่ทำ permission v2 / module UI** — เป็นงาน Phase 3
- **ไม่แตะ AGENT hard-lock** (`layout.tsx:55-82`) — Phase 3 ค่อยทบทวน nav ของ Operator
- **ไม่แก้ business logic** ใน PATCH handler (assign/revert/edit) — แค่เปลี่ยน gate ชั้นนอก
- **ไม่เพิ่ม DIRECTOR/HEAD nav** ในกลุ่ม Chatbot/System — Phase 3 (permissions) เป็นผู้กำหนด

---

## Step-by-Step Tasks

### Task 1: เพิ่ม `get_current_manager` gate + เติม staff gate
- **ACTION**: แก้ `backend/app/api/deps.py`
- **IMPLEMENT**:
  - เพิ่มฟังก์ชันใหม่ `get_current_manager` หลัง `get_current_admin` (≈ line 123): allow `[UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTOR, UserRole.HEAD]`, docstring อธิบายว่าใช้กับ request workflow ที่ DIRECTOR/HEAD มีสิทธิ์ตาม policy
  - แก้ `get_current_staff` (line 133): เพิ่ม `UserRole.DIRECTOR, UserRole.HEAD` เข้า list → `[ADMIN, SUPER_ADMIN, AGENT, DIRECTOR, HEAD]`; อัปเดต docstring
- **MIRROR**: GATE_DEPENDENCY_PATTERN (local `from app.models.user import UserRole`, 403 + "Insufficient permissions")
- **IMPORTS**: ไม่ต้องเพิ่ม top-level import (ตาม pattern เดิมใช้ local import ในฟังก์ชัน)
- **GOTCHA**: คง `get_current_admin` เดิมไว้ทุกตัวอักษร — มี 26 ไฟล์พึ่งพา; การแก้มันจะกระทบ sensitive endpoints
- **VALIDATE**: `python -c "from app.api.deps import get_current_manager, get_current_staff"` import ผ่าน

### Task 2: เปลี่ยน gate ของ request endpoints → manager (selective)
- **ACTION**: แก้ `backend/app/api/v1/endpoints/admin_requests.py`
- **IMPLEMENT**:
  - line 11: `from app.api.deps import get_current_admin` → `from app.api.deps import get_current_admin, get_current_manager`
  - เปลี่ยน `Depends(get_current_admin)` → `Depends(get_current_manager)` ที่ endpoints เหล่านี้: POST "" (create, :83), GET /stats (:146), /stats/monthly (:179), /stats/workload (:207), /stats/performance (:233), GET "" list (:268), GET /{id} (:309), PATCH /{id} (:357), POST /{id}/comments (:573), GET /{id}/comments (:601)
  - **คง `get_current_admin`** ที่ DELETE /{request_id} (:550) — ไม่มี inner guard
- **MIRROR**: INNER_PERMISSION_GUARD (guards ใน PATCH ทำให้ปลอดภัย)
- **IMPORTS**: เพิ่ม `get_current_manager` ใน import line 11
- **GOTCHA**: ห้ามเปลี่ยน DELETE เป็น manager; ตรวจให้ครบทุก `Depends(get_current_admin)` ใน request endpoints ยกเว้น DELETE — ใช้ grep ยืนยันหลังแก้
- **VALIDATE**: `grep -n "get_current_admin" backend/app/api/v1/endpoints/admin_requests.py` → เหลือเฉพาะ DELETE handler

### Task 3: แก้ frontend StaffRole type (layout.tsx + UserMenu.tsx)
- **ACTION**: แก้ `frontend/app/admin/layout.tsx` + `frontend/components/admin/UserMenu.tsx`
- **IMPLEMENT**:
  - layout.tsx:32 `allowedRoles?: Array<'SUPER_ADMIN' | 'ADMIN' | 'AGENT'>` → เพิ่ม `'DIRECTOR' | 'HEAD'`
  - layout.tsx:37 `type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT'` → เพิ่ม `'DIRECTOR' | 'HEAD'`
  - UserMenu.tsx:30 เช่นเดียวกัน
- **MIRROR**: FRONTEND_ROLE_TYPE_SOURCE_OF_TRUTH (AuthContext union)
- **IMPORTS**: none
- **GOTCHA**: อย่าใส่ `'USER'` ใน StaffRole — USER ไม่ใช่ staff; `isMenuItemVisible` กรอง USER ออกแล้ว (`layout.tsx:195`)
- **VALIDATE**: `npx tsc --noEmit` zero errors

### Task 4: เพิ่ม DIRECTOR/HEAD เข้า Service Requests nav
- **ACTION**: แก้ `frontend/app/admin/layout.tsx:160-161`
- **IMPLEMENT**: เพิ่ม `'DIRECTOR', 'HEAD'` เข้า allowedRoles ของ Dashboard + Manage Requests (กลุ่ม Service Requests เท่านั้น)
- **MIRROR**: NAV_ALLOWEDROLES_PATTERN
- **IMPORTS**: none
- **GOTCHA**: เฉพาะกลุ่ม Service Requests — อย่าเพิ่มเข้า Chatbot/System groups (Phase 3 จัดการ)
- **VALIDATE**: manual — DIRECTOR/HEAD เห็นเฉพาะ Service Requests group

### Task 5: Backend tests — gates
- **ACTION**: สร้าง `backend/tests/test_deps_gates.py`
- **IMPLEMENT**: parametrize ทุก role สำหรับ `get_current_manager` (SUPER_ADMIN/ADMIN/DIRECTOR/HEAD → ผ่าน; AGENT/USER → 403) และ `get_current_staff` (เพิ่ม DIRECTOR/HEAD → ผ่าน; USER → 403). ใช้ `SimpleNamespace(role=...)` เป็น current_user, `pytest.raises(HTTPException)` เช็ค 403
- **MIRROR**: TEST_PARAMETRIZE_PATTERN + GATE_TEST_PATTERN
- **IMPORTS**: `import pytest`, `from types import SimpleNamespace`, `from fastapi import HTTPException`, `from app.api.deps import get_current_manager, get_current_staff`, `from app.models.user import UserRole`
- **GOTCHA**: gates เป็น async → ใช้ `@pytest.mark.asyncio` + `await`
- **VALIDATE**: `python -m pytest backend/tests/test_deps_gates.py -v` ผ่านหมด

### Task 6: Backend tests — request endpoint authorization
- **ACTION**: แก้ `backend/tests/test_admin_requests_endpoints.py`
- **IMPLEMENT**: เพิ่ม test ว่า DIRECTOR/HEAD เรียก update_request เพื่อ assign ได้ (ไม่ raise 403), แต่ revert-from-COMPLETED ถูก raise 403 (can_revert_approval=False), และ DELETE ยังต้องการ admin. Mirror โครงสร้าง test เดิมในไฟล์ (มี UserRole.AGENT cases อยู่แล้ว :310,555,565)
- **MIRROR**: existing tests ในไฟล์เดียวกัน
- **IMPORTS**: ตามที่ไฟล์ใช้อยู่
- **GOTCHA**: revert test ต้องตั้ง request.status=COMPLETED + update.status=AWAITING_APPROVAL เพื่อ trigger `is_revert_from_completed`
- **VALIDATE**: `python -m pytest backend/tests/test_admin_requests_endpoints.py -v`

### Task 7: Frontend test — nav visibility
- **ACTION**: สร้าง `frontend/app/admin/__tests__/nav-visibility.test.ts` (extract `isMenuItemVisible` เป็น pure function ที่ test ได้ หรือ test ผ่าน logic จำลอง)
- **IMPLEMENT**: ยืนยัน DIRECTOR/HEAD เห็น Dashboard + Manage Requests แต่ไม่เห็น User Management; USER เห็น nav ว่าง; ADMIN เห็นครบ
- **MIRROR**: vitest pattern ใน `frontend/lib/__tests__/*.test.ts`
- **IMPORTS**: vitest `describe/it/expect`
- **GOTCHA**: ถ้า `isMenuItemVisible` ฝังใน component ยาก test — refactor เป็น exported pure helper (รับ user.role + item.allowedRoles) เพื่อ testability โดยไม่เปลี่ยนพฤติกรรม
- **VALIDATE**: `npx vitest run nav-visibility`

### Task 8: เขียน Audit Report (single source of truth)
- **ACTION**: สร้าง `.claude/PRPs/reports/chatbot-system-utilities-audit-report.md`
- **IMPLEMENT**: รวมผล audit จาก agents (Chatbot Management gaps, System Management gaps, role/permission findings) + แก้ความคลาดเคลื่อน (`get_current_admin` line 117 ไม่ใช่ 133; auth login แก้แล้ว) + ตาราง gap ranked + AGENT blast radius reference สำหรับ Phase 2
- **MIRROR**: รูปแบบ report ใน `.claude/PRPs/reports/*.md` (session ก่อน)
- **GOTCHA**: ระบุชัดว่าอะไรแก้แล้ว (login) vs ยังค้าง — กัน Phase ถัดไปทำซ้ำ
- **VALIDATE**: review เนื้อหาครบ 3 โดเมน + อ้าง file:line จริง

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| get_current_manager allows DIRECTOR | role=DIRECTOR | returns user (no raise) | - |
| get_current_manager allows HEAD | role=HEAD | returns user | - |
| get_current_manager rejects AGENT | role=AGENT | HTTPException 403 | ✅ |
| get_current_manager rejects USER | role=USER | HTTPException 403 | ✅ |
| get_current_staff allows DIRECTOR/HEAD | role=DIRECTOR/HEAD | returns user | - |
| update_request DIRECTOR assign | assignee≠self | success (can_assign=True) | - |
| update_request DIRECTOR revert | COMPLETED→AWAITING | 403 (can_revert=False) | ✅ |
| nav DIRECTOR sees Service Requests | role=DIRECTOR | Dashboard+Requests visible | - |
| nav DIRECTOR hides System | role=DIRECTOR | User Mgmt not visible | ✅ |

### Edge Cases Checklist
- [ ] role=None → 403 (gates)
- [ ] role=USER → 403 ทุก gate + nav ว่าง
- [ ] DIRECTOR/HEAD: assign ได้ แต่ revert/edit-details/delete ไม่ได้
- [ ] AGENT ยังถูก redirect ไป /admin/live-chat (ไม่ regress)
- [ ] ADMIN/SUPER_ADMIN ไม่ regress (เข้าได้ทุกอย่างเหมือนเดิม)

---

## Validation Commands

### Static Analysis
```bash
cd frontend && npx tsc --noEmit --pretty false
```
EXPECT: Zero type errors

```bash
cd frontend && npx eslint app/admin/layout.tsx components/admin/UserMenu.tsx
```
EXPECT: No lint errors

### Unit Tests (backend)
```bash
cd backend && python -m pytest tests/test_deps_gates.py tests/test_permissions.py tests/test_admin_requests_endpoints.py -v
```
EXPECT: All pass

### Unit Tests (frontend)
```bash
cd frontend && npx vitest run
```
EXPECT: All pass (29 existing + new nav-visibility)

### Full Test Suite
```bash
cd backend && python -m pytest
cd frontend && npm run build
```
EXPECT: No regressions, build green

### Guard verification
```bash
grep -n "get_current_admin\|get_current_manager" backend/app/api/v1/endpoints/admin_requests.py
```
EXPECT: DELETE handler = get_current_admin; อื่น ๆ = get_current_manager

### Manual Validation
- [ ] สร้าง user role=DIRECTOR → login → เห็น Service Requests group
- [ ] เปิด /admin/requests → list โหลดได้ (ไม่ 403)
- [ ] assign งานให้คนอื่น → สำเร็จ
- [ ] พยายาม revert COMPLETED request → 403 "คุณไม่มีสิทธิ์ยกเลิกการอนุมัติ"
- [ ] เปิด /admin/users → ถูก redirect (sensitive ยังปิด)

---

## Acceptance Criteria
- [ ] `get_current_manager` ทำงาน + `get_current_staff` รวม DIRECTOR/HEAD
- [ ] request view/assign endpoints ใช้ manager; DELETE ยังเป็น admin
- [ ] frontend type ตรง backend enum; DIRECTOR/HEAD เห็น Service Requests
- [ ] All validation commands pass; coverage ≥ 80% โค้ดที่แก้
- [ ] No type/lint errors; build green
- [ ] Audit report เขียนเสร็จเป็น single source of truth

## Completion Checklist
- [ ] Code ตาม patterns ที่ค้นพบ (gate, guard, parametrize)
- [ ] Error handling = 403 + ข้อความตามแบบเดิม
- [ ] Tests ตาม pattern (parametrize ทุก role)
- [ ] ไม่มี hardcoded values นอกเหนือ role enum
- [ ] ไม่แตะ get_current_admin / sensitive endpoints
- [ ] Self-contained — ไม่ต้องค้น codebase เพิ่มตอน implement

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| เปลี่ยน gate ตกหล่น (เผลอเปลี่ยน DELETE) | M | High | grep verification command + checklist ต่อ endpoint |
| Service Requests workflow regress | L | High | รัน test_admin_requests_endpoints เต็ม; can_* guards ไม่แตะ |
| Frontend nav DIRECTOR/HEAD เห็นเกิน | L | Med | จำกัด allowedRoles เฉพาะ Service Requests group + test |
| AGENT redirect regress | L | Med | คง layout.tsx:55-82; edge-case test |

## Notes
- การแก้ scope นี้ "ปลด dead policy" ที่มีอยู่ — `can_assign`/`can_self_assign` ตั้ง DIRECTOR/HEAD ไว้ตั้งแต่ 2026-05-04 แต่เข้าไม่ถึงเพราะ gate ชั้นนอก
- `core/audit.py` `create_audit_log` มีอยู่แล้วและถูกเรียกใน request edits — audit ของ request workflow ทำงานแล้ว (ต่างจากที่ audit agent เข้าใจว่า log แค่ live-chat); การขยาย audit ครอบ User/Settings เป็นงาน Phase 5
- Design System audit (agent 3) ไม่เกี่ยวกับ Phase 1 — ผลจะใช้ใน Phase 6
- **Pipeline ถัดไป**: review plan (as-if) → `/prp-implement` → code review → fix → commit → push → PR → CI/E2E → merge → Phase 2

---
*Generated: 2026-06-14*
*Status: READY for implementation*
