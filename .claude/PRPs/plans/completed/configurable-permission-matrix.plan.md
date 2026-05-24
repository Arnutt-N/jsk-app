# Plan: Configurable Permission Matrix — Revert Approval

## Summary

แปลง hardcoded `ADMIN+SUPER_ADMIN` check สำหรับ revert approval (PRD B) ให้เป็น permission key `revert_approval` ใน `permission_settings` table ที่แอดมินสามารถปรับแต่งได้ผ่าน `/admin/settings/permissions` โดยไม่ต้องแก้โค้ด

## User Story

As a **Super Admin**, I want **กำหนดว่า role ใดสามารถยกเลิกการอนุมัติได้** โดยไม่ต้องให้ dev แก้โค้ด, so that **เมื่อองค์กรเปลี่ยนโครงสร้าง ฉันสามารถปรับสิทธิ์เองได้ทันที**

## Problem → Solution

**Current state**: revert approval ตรวจสอบสิทธิ์ด้วย `canApprove` (alias ของ `can_assign`) ซึ่งให้สิทธิ์ DIRECTOR และ HEAD ด้วย แต่ revert เป็น action ที่ละเอียดอ่อนกว่า ควรแยกควบคุมได้
**Desired state**: revert approval มี permission key เป็นของตัวเอง (`revert_approval`) ปรับได้ใน Settings UI

## Metadata
- **Complexity**: Medium
- **Source PRD**: `.claude/PRPs/prds/configurable-permission-matrix.prd.md`
- **PRD Phase**: covers Phases 1-5 (Phase 6 UAT is post-implementation)
- **Estimated Files**: 7 files (3 backend update, 2 backend test create/update, 2 frontend update, 1 frontend test update). Migration NOT needed — `ensure_seed_rows()` self-heal hook (permissions.py:133) auto-inserts new keys on startup.

---

## UX Design

### Before
```
/admin/settings/permissions แสดงตาราง 3 แถว:
- assign_request
- self_assign_request
- edit_permission_settings

/admin/requests/[id] กรณี COMPLETED:
- kebab "การจัดการพิเศษ" แสดง revert items ถ้า canApprove=true
  (canApprove = can_assign ซึ่งให้สิทธิ์ DIRECTOR/HEAD ด้วย)
```

### After
```
/admin/settings/permissions แสดงตาราง 4 แถว:
- assign_request
- self_assign_request
- edit_permission_settings
- revert_approval  ← ใหม่

/admin/requests/[id] กรณี COMPLETED:
- kebab แสดง revert items ถ้า can_revert_approval=true
  (ควบคุมได้ใน Settings ว่า role ใดเห็น)
```

### Interaction Changes

| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Settings permissions table | 3 แถว | 4 แถว | แถวใหม่: "ยกเลิกการอนุมัติ" |
| Request detail revert kebab | ใช้ `can_assign` | ใช้ `can_revert_approval` | ไม่เปลี่ยน UI appearance |
| Backend revert guard | ไม่มี (frontend-only) | มี backend guard | defense in depth |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/core/permissions.py` | all | Permission system source of truth |
| P0 | `backend/app/api/v1/endpoints/settings.py` | 1-65 | Schema + endpoint patterns |
| P0 | `frontend/lib/permissions.ts` | all | Frontend permission client |
| P1 | `frontend/app/admin/requests/[id]/page.tsx` | 313-320, 493-520 | Where revert items are gated |
| P1 | `backend/app/api/v1/endpoints/admin_requests.py` | 340-390 | Revert detection block |
| P2 | `frontend/app/admin/settings/permissions/page.tsx` | all | Matrix UI pattern |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| N/A | N/A | ใช้ internal patterns ที่มีอยู่ — ไม่ต้อง research ภายนอก |

---

## Patterns to Mirror

### PERMISSION_KEY_CONSTANT
```python
# SOURCE: backend/app/core/permissions.py:40-42
KEY_ASSIGN = "assign_request"
KEY_SELF_ASSIGN = "self_assign_request"
KEY_EDIT_SETTINGS = "edit_permission_settings"
```

### DEFAULT_POLICY_ENTRY
```python
# SOURCE: backend/app/core/permissions.py:46-63
DEFAULT_POLICY: dict[str, frozenset[UserRole]] = {
    KEY_ASSIGN: frozenset({
        UserRole.SUPER_ADMIN, UserRole.ADMIN,
        UserRole.DIRECTOR, UserRole.HEAD,
    }),
    # ...
}
```

### CAN_HELPER_PATTERN
```python
# SOURCE: backend/app/core/permissions.py:211-223
def can_assign(role: UserRole | str | None) -> bool:
    return _check(role, KEY_ASSIGN)
```

### SEED_DESCRIPTION
```python
# SOURCE: backend/app/core/permissions.py:126-130
_SEED_DESCRIPTIONS: dict[str, str] = {
    KEY_ASSIGN: "มอบหมายงานให้ผู้อื่น",
    # ...
}
```

### PERMISSION_SUMMARY
```python
# SOURCE: backend/app/core/permissions.py:226-237
def get_permission_summary() -> dict[str, list[str]]:
    return {
        "assign_allowed_roles": sorted(r.value for r in _allowed_for(KEY_ASSIGN)),
        # ...
    }
```

### ALLOWED_KEYS_SET
```python
# SOURCE: backend/app/api/v1/endpoints/settings.py:63
ALLOWED_PERMISSION_KEYS = {KEY_ASSIGN, KEY_SELF_ASSIGN, KEY_EDIT_SETTINGS}
```

### MYPERMISSIONS_SCHEMA
```python
# SOURCE: backend/app/api/v1/endpoints/settings.py:55-59
class MyPermissions(BaseModel):
    role: str
    can_assign: bool
    can_self_assign: bool
    can_edit_permissions: bool
```

### PERMISSION_SUMMARY_SCHEMA
```python
# SOURCE: backend/app/api/v1/endpoints/settings.py:40-47
# GOTCHA: Pydantic v2 raises ValidationError on extra keys when unpacking
# `PermissionSummary(**summary, rules=rules)` (settings.py:96).
# So adding a key to get_permission_summary() MUST also add it to this schema.
class PermissionSummary(BaseModel):
    assign_allowed_roles: List[str]
    self_assign_allowed_roles: List[str]
    permission_settings_editor_roles: List[str]
    rules: List[PermissionRule] = Field(default_factory=list)
```

### SEED_AUTOHEAL_PATTERN
```python
# SOURCE: backend/app/core/permissions.py:133-170
# ensure_seed_rows() runs on startup (lifespan hook) and inserts any
# DEFAULT_POLICY key that's missing from permission_settings table —
# using _SEED_DESCRIPTIONS for the Thai label. This means: adding a new
# key to DEFAULT_POLICY + _SEED_DESCRIPTIONS is sufficient — NO alembic
# migration needed.
async def ensure_seed_rows(db: AsyncSession) -> int:
    # ... iterates DEFAULT_POLICY, INSERT if missing ...
```

### FRONTEND_MYPERMISSIONS_INTERFACE
```typescript
// SOURCE: frontend/lib/permissions.ts:18-23
export interface MyPermissions {
  role: string
  can_assign: boolean
  can_self_assign: boolean
  can_edit_permissions: boolean
}
```

### FRONTEND_PERMISSION_CHECK
```typescript
// SOURCE: frontend/app/admin/requests/[id]/page.tsx:319
const canApprove = permissions?.can_assign ?? false;
```

### BACKEND_REVERT_DETECTION
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:362-369
is_revert_from_completed = (
    update_data.status is not None
    and request.status == RequestStatus.COMPLETED
    and update_data.status in (
        RequestStatus.AWAITING_APPROVAL,
        RequestStatus.IN_PROGRESS,
    )
)
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/core/permissions.py` | UPDATE | Add KEY_REVERT_APPROVAL, can_revert_approval, update DEFAULT_POLICY, _SEED_DESCRIPTIONS, get_permission_summary |
| `backend/app/api/v1/endpoints/settings.py` | UPDATE | Add can_revert_approval to imports, ALLOWED_PERMISSION_KEYS, MyPermissions schema, get_my_permissions |
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | Import can_revert_approval, add backend guard on revert path |
| `backend/alembic/versions/` | CREATE (migration) | Seed revert_approval row with default roles |
| `frontend/lib/permissions.ts` | UPDATE | Add can_revert_approval to MyPermissions interface |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATE | Use can_revert_approval for revert kebab items |
| `backend/tests/test_permissions.py` | CREATE | Unit tests for new can_revert_approval helper |
| `frontend/e2e/permission-settings.spec.ts` | UPDATE | Assert 4th row exists |

## NOT Building

- **Migration to remove hardcoded check อื่นๆ** — แก้เฉพาะ revert_approval ตาม PRD B scope
- **Frontend Settings UI redesign** — ใช้ table แบบเดิมที่มีอยู่
- **Backend ALLOWED_TRANSITIONS state machine** — ยังไม่ใช่ scope นี้
- **Permission history/audit** — ใช้ audit_log ที่มีอยู่แล้ว
- **Real-time permission refresh** — page reload ยังพอ (same as Stage 2)

---

## Step-by-Step Tasks

### Task 1: Backend — Add revert_approval to permission core
- **ACTION**: แก้ `backend/app/core/permissions.py`
- **IMPLEMENT**:
  1. เพิ่ม `KEY_REVERT = "revert_approval"` บรรทัดหลัง `KEY_EDIT_SETTINGS`
  2. เพิ่ม entry ใน `DEFAULT_POLICY`: `KEY_REVERT: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN})`
  3. เพิ่ม `_SEED_DESCRIPTIONS[KEY_REVERT] = "ยกเลิกการอนุมัติ"`
  4. เพิ่ม `def can_revert_approval(role): return _check(role, KEY_REVERT)`
  5. อัพเดท `get_permission_summary()` ให้รวม `"revert_approval_allowed_roles"`
- **MIRROR**: `CAN_HELPER_PATTERN`, `DEFAULT_POLICY_ENTRY`, `SEED_DESCRIPTION`
- **IMPORTS**: ไม่มีใหม่ (ใช้ UserRole ที่มีอยู่)
- **GOTCHA**: `get_permission_summary()` return type เป็น `dict[str, list[str]]` — key ใหม่ต้อง snake_case
- **VALIDATE**: `python -c "from app.core.permissions import can_revert_approval, get_permission_summary; print(can_revert_approval('ADMIN'))"`

### Task 2: Backend — Update settings endpoint schemas
- **ACTION**: แก้ `backend/app/api/v1/endpoints/settings.py`
- **IMPLEMENT**:
  1. Import `can_revert_approval` และ `KEY_REVERT` จาก `app.core.permissions`
  2. เพิ่ม `KEY_REVERT` เข้า `ALLOWED_PERMISSION_KEYS`
  3. เพิ่ม `can_revert_approval: bool` เข้า `MyPermissions` schema
  4. อัพเดท `get_my_permissions()` ให้ return `can_revert_approval=can_revert_approval(current_admin.role)`
- **MIRROR**: `ALLOWED_KEYS_SET`, `MYPERMISSIONS_SCHEMA`
- **IMPORTS**: `can_revert_approval, KEY_REVERT` from `app.core.permissions`
- **GOTCHA**: อย่าลืม update `get_permission_summary()` ใน permissions.py ก่อน task นี้ เพราะ settings endpoint อาจอ่านจาก cache
- **VALIDATE**: Run backend dev server, curl `/api/v1/admin/settings/permissions/me` → ต้องมี `can_revert_approval` ใน response

### Task 3: Backend — Add revert guard to admin_requests endpoint
- **ACTION**: แก้ `backend/app/api/v1/endpoints/admin_requests.py`
- **IMPLEMENT**:
  1. Import `can_revert_approval` จาก `app.core.permissions`
  2. หลัง detect `is_revert_from_completed` (บรรทัด ~362) เพิ่ม guard:
     ```python
     if is_revert_from_completed and not can_revert_approval(current_admin.role):
         raise HTTPException(status_code=403, detail="คุณไม่มีสิทธิ์ยกเลิกการอนุมัติ")
     ```
- **MIRROR**: `BACKEND_REVERT_DETECTION`
- **IMPORTS**: `can_revert_approval` from `app.core.permissions`
- **GOTCHA**: Guard ต้องอยู่ก่อน `request.status = update_data.status` เพื่อไม่ให้ mutate ก่อน reject
- **VALIDATE**: pytest สำหรับ admin_requests endpoint

### Task 4: Backend — Create alembic migration for seed
- **ACTION**: สร้าง migration ใหม่
- **IMPLEMENT**:
  ```bash
  cd backend && python scripts/db_target.py alembic --target local revision -m "add_revert_approval_permission"
  ```
  แล้วแก้ migration file ให้ INSERT `revert_approval` row (คัดลอก pattern จาก migration `n4o5p6q7r8s9`)
- **MIRROR**: Migration `n4o5p6q7r8s9` seed block
- **IMPORTS**: N/A (migration SQL)
- **GOTCHA**: ใช้ `ON CONFLICT (key) DO NOTHING` เพื่อ idempotent
- **VALIDATE**: `python scripts/db_target.py alembic --target local upgrade head` → ต้องผ่าน

### Task 5: Frontend — Update MyPermissions interface
- **ACTION**: แก้ `frontend/lib/permissions.ts`
- **IMPLEMENT**:
  1. เพิ่ม `can_revert_approval: boolean` เข้า `MyPermissions` interface
- **MIRROR**: `FRONTEND_MYPERMISSIONS_INTERFACE`
- **IMPORTS**: N/A
- **GOTCHA**: ต้องตรงกับ backend schema (snake_case)
- **VALIDATE**: `cd frontend && npx tsc --noEmit` → zero errors

### Task 6: Frontend — Update request detail page to use can_revert_approval
- **ACTION**: แก้ `frontend/app/admin/requests/[id]/page.tsx`
- **IMPLEMENT**:
  1. Extract `canRevertApproval` จาก `usePermissions()`:
     ```typescript
     const canRevertApproval = permissions?.can_revert_approval ?? false;
     ```
  2. แก้ revert kebab items (2 รายการ "ยกเลิกอนุมัติ → ...") ให้ check `canRevertApproval` แทน `canApprove`
  3. kebab visibility ทั่วไปยังใช้ `canApprove` เหมือนเดิม (เพราะมี items อื่น เช่น force-complete ที่ยังใช้ can_assign)
  4. แต่ละ revert item ภายใน self-gate ด้วย `request.status === 'COMPLETED' && canRevertApproval`
- **MIRROR**: `FRONTEND_PERMISSION_CHECK`
- **IMPORTS**: N/A
- **GOTCHA**: อย่าเปลี่ยน `canApprove` ที่ใช้กับ items อื่น (force-complete, reopen) — แก้เฉพาะ revert items
- **VALIDATE**: `cd frontend && npx tsc --noEmit && npm run lint`

### Task 7: Backend — Write tests for can_revert_approval
- **ACTION**: สร้าง `backend/tests/test_permissions.py`
- **IMPLEMENT**:
  ```python
  import pytest
  from app.core.permissions import (
      can_revert_approval,
      get_permission_summary,
      KEY_REVERT,
      DEFAULT_POLICY,
  )
  from app.models.user import UserRole

  @pytest.mark.parametrize("role,expected", [
      (UserRole.SUPER_ADMIN, True),
      (UserRole.ADMIN, True),
      (UserRole.DIRECTOR, False),  # default policy excludes
      (UserRole.HEAD, False),
      (UserRole.AGENT, False),
      (UserRole.USER, False),
      (None, False),
  ])
  def test_can_revert_approval(role, expected):
      assert can_revert_approval(role) == expected

  def test_get_permission_summary_includes_revert():
      summary = get_permission_summary()
      assert "revert_approval_allowed_roles" in summary
  ```
- **MIRROR**: Test patterns ใน `backend/tests/test_admin_requests_endpoints.py` (FakeDB pattern)
- **IMPORTS**: `pytest`, `app.core.permissions`, `app.models.user.UserRole`
- **GOTCHA**: `get_permission_summary()` อ่านจาก `_policy_cache` ซึ่งอาจเป็น None ในตอนแรก → จะ fallback ไป DEFAULT_POLICY ซึ่งมี revert_approval อยู่แล้ว
- **VALIDATE**: `cd backend && python -m pytest tests/test_permissions.py -v`

### Task 8: Frontend E2E — Update permission settings spec
- **ACTION**: แก้ `frontend/e2e/permission-settings.spec.ts`
- **IMPLEMENT**:
  1. เปลี่ยน assertion "at least three rule rows" → "at least four rule rows"
  2. เพิ่ม test: `matrix shows revert_approval row`
  3. Assert ว่า row ที่มี text "ยกเลิกการอนุมัติ" มีอยู่
- **MIRROR**: `frontend/e2e/permission-settings.spec.ts`
- **IMPORTS**: N/A
- **GOTCHA**: อย่า mutate policy ใน E2E (comment ใน spec เตือนไว้แล้ว)
- **VALIDATE**: `cd frontend && npx playwright test e2e/permission-settings.spec.ts`

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| can_revert_approval(SUPER_ADMIN) | UserRole.SUPER_ADMIN | True | |
| can_revert_approval(ADMIN) | UserRole.ADMIN | True | |
| can_revert_approval(DIRECTOR) | UserRole.DIRECTOR | False | Default policy |
| can_revert_approval(None) | None | False | Null role |
| can_revert_approval("ADMIN") | string "ADMIN" | True | String input |
| get_permission_summary keys | — | มี revert_approval_allowed_roles | |
| Backend guard allows revert | role=ADMIN | 200 OK | |
| Backend guard blocks revert | role=DIRECTOR | 403 | |

### Edge Cases Checklist
- [ ] Role string ที่ไม่รู้จัก → False (ไม่ crash)
- [ ] _policy_cache = None → fallback DEFAULT_POLICY ทำงาน
- [ ] Frontend โหลด permissions ก่อน render → revert items ซ่อนจนกว่าจะรู้สิทธิ์
- [ ] เรียก PATCH revert โดยตรง (ไม่ผ่าน UI) → backend guard จับได้
- [ ] Permission settings page แสดง row ใหม่ถูกต้องแม้ backend pre-Stage-2

---

## Validation Commands

### Static Analysis
```bash
cd backend && python -m py_compile app/core/permissions.py app/api/v1/endpoints/settings.py app/api/v1/endpoints/admin_requests.py
```
EXPECT: Zero errors

```bash
cd frontend && npx tsc --noEmit
```
EXPECT: Zero type errors

### Unit Tests
```bash
cd backend && python -m pytest tests/test_permissions.py -v
```
EXPECT: All tests pass

```bash
cd backend && python -m pytest tests/test_admin_requests_endpoints.py -v -k revert
```
EXPECT: Revert tests pass (รวม guard ใหม่)

### Full Test Suite
```bash
cd backend && python -m pytest
```
EXPECT: No regressions

```bash
cd frontend && npm run test
```
EXPECT: No regressions

### Database Validation
```bash
cd backend && python scripts/db_target.py alembic --target local upgrade head
```
EXPECT: Schema up to date, revert_approval row exists

### E2E Validation
```bash
cd frontend && npx playwright test e2e/permission-settings.spec.ts
```
EXPECT: Tests pass

### Manual Validation
- [ ] เปิด `/admin/settings/permissions` → เห็น 4 แถว รวม "ยกเลิกการอนุมัติ"
- [ ] เปิด `/admin/requests/[id]` ของ COMPLETED request → kebab แสดง revert items (ถ้ามีสิทธิ์)
- [ ] ลอง PATCH revert โดยตรงด้วย role ที่ไม่มีสิทธิ์ → ได้ 403

---

## Acceptance Criteria
- [ ] All tasks completed
- [ ] All validation commands pass
- [ ] Tests written and passing
- [ ] No type errors
- [ ] No lint errors
- [ ] Permission matrix UI แสดง 4 แถว
- [ ] Revert items ใช้ `can_revert_approval` ไม่ใช่ `can_assign`
- [ ] Backend guard ป้องกัน revert โดย role ที่ไม่มีสิทธิ์

## Completion Checklist
- [ ] Code follows discovered patterns
- [ ] Error handling matches codebase style
- [ ] Logging follows codebase conventions
- [ ] Tests follow test patterns
- [ ] No hardcoded values (ใช้ KEY_REVERT constant)
- [ ] Documentation updated (if needed)
- [ ] No unnecessary scope additions
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Frontend `canApprove` ถูกใช้ที่อื่นด้วย → แก้ผิด | Medium | Medium | Grep ทั้ง codebase ก่อนแก้ |
| get_permission_summary() key ใหม่ break frontend ที่ parse summary | Low | Medium | Frontend ใช้ rules array ไม่ใช่ legacy summary fields |
| Migration seed ชนกับ ensure_seed_rows | Low | Low | ใช้ ON CONFLICT DO NOTHING |
| DIRECTOR/HEAD เคย revert ได้อยู่ ตอนนี้ถูก lock ออก | Medium | Low | เป็น intentional behavior change — default ให้สิทธิ์เฉพาะ ADMIN+SUPER_ADMIN |

## Notes
- PRD B ใช้ hardcoded `canApprove` (= `can_assign`) สำหรับ revert ซึ่งให้สิทธิ์ DIRECTOR/HEAD ด้วย PRD C แยกเป็น `revert_approval` ซึ่ง default เฉพาะ ADMIN+SUPER_ADMIN ตาม decision เดิม
- ถ้าต้องการให้ DIRECTOR/HEAD revert ได้ แอดมินสามารถ tick checkbox ใน Settings UI ได้เลย
- Backend guard (Task 3) เป็น defense-in-depth — หาก frontend มี bug เปิด kebab ผิด role backend จะ reject
