# Plan: edit_request_details Permission — Phase 1 (Backend key + guard)

## Summary
เพิ่ม permission key `edit_request_details` เข้าระบบ permission matrix ฝั่ง backend ทั้งสาย: constant + DEFAULT_POLICY + helper ใน `permissions.py`, expose ผ่าน `settings.py` (summary + `/me` + editable keys), และ guard ใน `update_request` ให้ตรวจสิทธิ์เฉพาะเมื่อ PATCH มี field ใดใน 12 field ของแท็บ details/contact — พร้อม pytest ครอบทุก role และ workflow-only payload

## User Story
As a Super Admin, I want role ที่ไม่ได้รับสิทธิ์ถูก backend ปฏิเสธ (403) เมื่อพยายามแก้ข้อมูลคำร้อง, so that ข้อมูลประชาชนถูกแก้ได้เฉพาะผู้มีอำนาจ และนโยบายปรับได้ผ่าน matrix โดยไม่ต้อง deploy

## Problem → Solution
`update_request` (admin_requests.py:441-477) apply 12 field ใหม่โดยไม่มี permission check → เพิ่ม `can_edit_request_details()` guard ตาม pattern เดียวกับ `can_revert_approval` ที่อยู่ห่างกันไม่กี่บรรทัด (L400-405)

## Metadata
- **Complexity**: Small (4 ไฟล์, ~100 บรรทัดรวม tests)
- **Source PRD**: `.claude/PRPs/prds/edit-request-details-permission.prd.md`
- **PRD Phase**: Phase 1 — Backend permission key + guard
- **Estimated Files**: 4 (2 source, 2 test)

---

## UX Design

N/A — internal change (backend guard เท่านั้น; frontend คือ Phase 2)

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| `PATCH /admin/requests/{id}` ด้วย detail/contact field | ทุก admin role สำเร็จ | role นอก policy ได้ 403 + ข้อความไทย | workflow fields (status/priority/assignment/notes) ไม่กระทบ |
| `GET /admin/settings/permissions` | 4 keys | 5 keys (แถวใหม่โผล่ใน matrix UI อัตโนมัติ) | seed ผ่าน `ensure_seed_rows()` ตอน startup |
| `GET /admin/settings/permissions/me` | 4 booleans | +`can_edit_request_details` | Phase 2 จะใช้ค่านี้ |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/core/permissions.py` | ทั้งไฟล์ (250 บรรทัด) | ไฟล์หลักที่แก้ — ทุก pattern อยู่ที่นี่ |
| P0 | `backend/app/api/v1/endpoints/admin_requests.py` | 317-496 | RequestUpdate schema + update_request handler ที่จะเพิ่ม guard |
| P1 | `backend/app/api/v1/endpoints/settings.py` | 1-201 | PermissionSummary, MyPermissions, ALLOWED_PERMISSION_KEYS, /me |
| P1 | `backend/tests/test_permissions.py` | ทั้งไฟล์ (52 บรรทัด) | test pattern สำหรับ helper ใหม่ |
| P2 | `backend/tests/test_admin_requests_endpoints.py` | 289-360 | 403 test pattern (dependency overrides) + `_build_editable_request()` helper |

## External Documentation

ไม่ต้อง — feature ใช้ internal pattern ที่ proven แล้วล้วนๆ ("No external research needed")

---

## Patterns to Mirror

### KEY_CONSTANT + DEFAULT_POLICY
```python
# SOURCE: backend/app/core/permissions.py:40-43, 64-67
KEY_REVERT = "revert_approval"

DEFAULT_POLICY: dict[str, frozenset[UserRole]] = {
    ...
    KEY_REVERT: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
    }),
}
```

### SEED_DESCRIPTION (Thai label สำหรับ self-heal seed)
```python
# SOURCE: backend/app/core/permissions.py:131-136
_SEED_DESCRIPTIONS: dict[str, str] = {
    ...
    KEY_REVERT: "ยกเลิกการอนุมัติ",
}
```

### PERMISSION_HELPER
```python
# SOURCE: backend/app/core/permissions.py:232-234
def can_revert_approval(role: UserRole | str | None) -> bool:
    """Whether `role` can revert a COMPLETED request to AWAITING_APPROVAL or IN_PROGRESS."""
    return _check(role, KEY_REVERT)
```

### SUMMARY_ENTRY
```python
# SOURCE: backend/app/core/permissions.py:244-249
return {
    ...
    "revert_approval_allowed_roles": sorted(r.value for r in _allowed_for(KEY_REVERT)),
}
```

### GUARD_IN_UPDATE_REQUEST (403 + ข้อความไทย, ตรวจก่อน mutate)
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:400-405
if is_revert_from_completed and not can_revert_approval(current_admin.role):
    raise HTTPException(
        status_code=403,
        detail="คุณไม่มีสิทธิ์ยกเลิกการอนุมัติ",
    )
```

### SCHEMA_FIELDS (settings.py — จุดที่ต้องเพิ่ม field ใหม่ขนานกันทุกจุด)
```python
# SOURCE: backend/app/api/v1/endpoints/settings.py:42-67
class PermissionSummary(BaseModel):
    assign_allowed_roles: List[str]
    self_assign_allowed_roles: List[str]
    permission_settings_editor_roles: List[str]
    revert_approval_allowed_roles: List[str]
    rules: List[PermissionRule] = Field(default_factory=list)

class MyPermissions(BaseModel):
    role: str
    can_assign: bool
    can_self_assign: bool
    can_edit_permissions: bool
    can_revert_approval: bool

ALLOWED_PERMISSION_KEYS = {KEY_ASSIGN, KEY_SELF_ASSIGN, KEY_EDIT_SETTINGS, KEY_REVERT}
```

### TEST_HELPER (parametrized role test)
```python
# SOURCE: backend/tests/test_permissions.py:17-30
@pytest.mark.parametrize(
    "role,expected",
    [
        (UserRole.SUPER_ADMIN, True),
        (UserRole.ADMIN, True),
        (UserRole.DIRECTOR, False),  # default policy excludes
        (UserRole.HEAD, False),
        (UserRole.AGENT, False),
        (UserRole.USER, False),
        (None, False),
    ],
)
def test_can_revert_approval(role, expected):
    assert can_revert_approval(role) is expected
```

### TEST_403_ENDPOINT (dependency override ด้วย role ที่ไม่มีสิทธิ์)
```python
# SOURCE: backend/tests/test_admin_requests_endpoints.py:289-327
def test_unassign_request_forbidden_for_agent_role():
    fake_db = _FakeDB()
    fake_request = SimpleNamespace(id=42, status=RequestStatus.IN_PROGRESS, ...)
    fake_db._fake_request = fake_request

    async def _override_get_db():
        yield fake_db

    async def _override_get_current_admin():
        return SimpleNamespace(id=3, username="agent-user", display_name="Agent User", role=UserRole.AGENT)

    app.dependency_overrides[session_get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    client = TestClient(app)
    try:
        response = client.patch("/api/v1/admin/requests/42", json={"unassign": True})
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert fake_request.assigned_agent_id == 5  # unchanged
```
หมายเหตุ: มี `_build_editable_request()` (L338) และ `_patch_admin_overrides(fake_db)` (override เป็น ADMIN) ให้ใช้ซ้ำสำหรับ happy path

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/core/permissions.py` | UPDATE | key + policy + description + helper + summary entry + docstring table |
| `backend/app/api/v1/endpoints/settings.py` | UPDATE | import, PermissionSummary, ALLOWED_PERMISSION_KEYS, MyPermissions, /me |
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | guard ใน update_request + docstring |
| `backend/tests/test_permissions.py` | UPDATE | helper tests (4 ตัวตาม pattern revert) |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATE | endpoint guard tests (3 scenario) |

## NOT Building
- Alembic migration seed — `revert_approval` พิสูจน์แล้วว่า `ensure_seed_rows()` เพียงพอ (ไม่มี migration ของตัวเอง; DEFAULT_POLICY + _SEED_DESCRIPTIONS คือ source ของ seed)
- Lockout safeguard ใน PATCH /permissions — ตัดสินใจแล้วว่า key นี้ไม่ต้องมี (ไม่ใช่ self-lockout key)
- Frontend ใดๆ (MyPermissions interface, ซ่อนปุ่ม) — Phase 2
- Audit log การแก้ field — Phase 4 ของ feature เดิม

---

## Step-by-Step Tasks

### Task 1: เพิ่ม key + policy + helper ใน permissions.py
- **ACTION**: แก้ `backend/app/core/permissions.py` 5 จุด
- **IMPLEMENT**:
  1. ใต้ `KEY_REVERT` (L43): `KEY_EDIT_REQUEST_DETAILS = "edit_request_details"`
  2. ใน `DEFAULT_POLICY` ต่อจาก entry KEY_REVERT: `KEY_EDIT_REQUEST_DETAILS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),`
  3. ใน `_SEED_DESCRIPTIONS`: `KEY_EDIT_REQUEST_DETAILS: "แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)",`
  4. ใต้ `can_revert_approval` (L234): helper ใหม่
     ```python
     def can_edit_request_details(role: UserRole | str | None) -> bool:
         """Whether `role` can edit a request's details/contact fields."""
         return _check(role, KEY_EDIT_REQUEST_DETAILS)
     ```
  5. ใน `get_permission_summary()` (L244-249): เพิ่ม `"edit_request_details_allowed_roles": sorted(r.value for r in _allowed_for(KEY_EDIT_REQUEST_DETAILS)),`
  6. อัปเดตตาราง key ใน module docstring (L19-24) เพิ่มแถว `edit_request_details  SUPER_ADMIN, ADMIN`
- **MIRROR**: KEY_CONSTANT + DEFAULT_POLICY, SEED_DESCRIPTION, PERMISSION_HELPER, SUMMARY_ENTRY
- **IMPORTS**: ไม่มีใหม่
- **GOTCHA**: `ensure_seed_rows()` iterate จาก `DEFAULT_POLICY` อัตโนมัติ — แค่เพิ่ม entry ก็ seed เองตอน startup ไม่ต้องแตะฟังก์ชัน
- **VALIDATE**: `python -m pytest tests/test_permissions.py -q` (test เดิมต้องไม่พัง)

### Task 2: Expose key ใหม่ใน settings.py
- **ACTION**: แก้ `backend/app/api/v1/endpoints/settings.py` 5 จุด
- **IMPLEMENT**:
  1. Import block (L6-18): เพิ่ม `can_edit_request_details,` และ `KEY_EDIT_REQUEST_DETAILS,`
  2. `PermissionSummary` (L42-50): เพิ่ม `edit_request_details_allowed_roles: List[str]` (ก่อน `rules`)
  3. `MyPermissions` (L58-63): เพิ่ม `can_edit_request_details: bool`
  4. `ALLOWED_PERMISSION_KEYS` (L67): เพิ่ม `KEY_EDIT_REQUEST_DETAILS`
  5. `get_my_permissions` (L194-200): เพิ่ม `can_edit_request_details=can_edit_request_details(current_admin.role),`
- **MIRROR**: SCHEMA_FIELDS
- **IMPORTS**: ตามข้อ 1
- **GOTCHA**: ชื่อ field ใน PermissionSummary ต้องตรงกับ key ที่ `get_permission_summary()` คืน (`edit_request_details_allowed_roles`) เพราะ endpoint ใช้ `PermissionSummary(**summary, rules=rules)` — ชื่อไม่ตรง = TypeError ตอน runtime
- **GOTCHA**: **ไม่เพิ่ม** lockout branch ใน update_permissions (L141-151) — ตัดสินใจแล้วว่า key นี้ถอด SUPER_ADMIN ได้
- **VALIDATE**: `python -m pytest tests/ -q -k permission` ผ่าน

### Task 3: Guard ใน update_request
- **ACTION**: แก้ `backend/app/api/v1/endpoints/admin_requests.py`
- **IMPLEMENT**: เพิ่ม module-level tuple ใกล้ `RequestUpdate` (หลัง L341) และ guard หลัง revert guard (หลัง L405, ก่อนคอมเมนต์ `# Update fields`):
  ```python
  # Fields gated by the edit_request_details permission (details + contact tabs).
  EDITABLE_DETAIL_CONTACT_FIELDS = (
      "topic_category", "topic_subcategory", "description",
      "prefix", "firstname", "lastname", "phone_number", "email",
      "sub_district", "district", "province", "agency",
  )
  ```
  ```python
  # Permission guard: editing details/contact fields requires explicit permission.
  # Checked only when the payload actually carries one of those fields so
  # workflow-only PATCHes (status / assignment / priority) are unaffected.
  is_editing_details = any(
      getattr(update_data, f) is not None for f in EDITABLE_DETAIL_CONTACT_FIELDS
  )
  if is_editing_details and not can_edit_request_details(current_admin.role):
      raise HTTPException(
          status_code=403,
          detail="คุณไม่มีสิทธิ์แก้ไขข้อมูลคำร้อง",
      )
  ```
  อัปเดต docstring ของ `update_request` (L350-358) เพิ่มบรรทัด: `- Details/contact field edits: requires can_edit_request_details(current_admin.role)`
- **MIRROR**: GUARD_IN_UPDATE_REQUEST
- **IMPORTS**: เพิ่ม `can_edit_request_details` ใน import จาก `app.core.permissions` ที่หัวไฟล์ (มี import `can_assign, can_self_assign, can_revert_approval` อยู่แล้ว — เพิ่มต่อท้าย)
- **GOTCHA**: ใช้ `is not None` ไม่ใช่ truthiness — empty string `""` คือ intentional clear (PATCH semantic ของ feature นี้) ต้องโดน guard ด้วย ซึ่ง `"" is not None` → True ถูกต้องแล้ว
- **GOTCHA**: guard ต้องอยู่**ก่อน** `# Update fields` (L407) — ถ้าวางหลัง จะ mutate request object ไปแล้วบางส่วนก่อน raise
- **GOTCHA**: `notes` เป็น workflow field (ใช้กับ revert audit) — ห้ามใส่ใน EDITABLE_DETAIL_CONTACT_FIELDS
- **VALIDATE**: `python -m pytest tests/test_admin_requests_endpoints.py -q` (test เดิมผ่านหมด — `_patch_admin_overrides` ใช้ ADMIN ซึ่งมีสิทธิ์ จึงไม่พัง)

### Task 4: Helper tests ใน test_permissions.py
- **ACTION**: เพิ่ม 4 tests ตาม pattern revert ทุกตัว
- **IMPLEMENT**:
  - import เพิ่ม: `can_edit_request_details, KEY_EDIT_REQUEST_DETAILS`
  - `test_can_edit_request_details(role, expected)` — parametrized 7 case (SUPER_ADMIN=True, ADMIN=True, DIRECTOR/HEAD/AGENT/USER=False, None=False)
  - `test_can_edit_request_details_string_input()` — `"ADMIN"` → True, `"AGENT"` → False, `"UNKNOWN_ROLE"` → raises ValueError
  - `test_get_permission_summary_includes_edit_request_details()` — มี key `edit_request_details_allowed_roles` == `["ADMIN", "SUPER_ADMIN"]`
  - `test_default_policy_has_edit_request_details_key()` — `DEFAULT_POLICY[KEY_EDIT_REQUEST_DETAILS] == frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN})`
- **MIRROR**: TEST_HELPER (test_permissions.py:17-51 ทั้ง 4 รูปแบบ)
- **GOTCHA**: ไฟล์นี้พึ่ง DEFAULT_POLICY fallback (`_policy_cache` เป็น None ใน fresh process) — ห้าม mock DB
- **VALIDATE**: `python -m pytest tests/test_permissions.py -q` — 4 tests ใหม่ผ่าน

### Task 5: Endpoint guard tests ใน test_admin_requests_endpoints.py
- **ACTION**: เพิ่ม 3 tests ท้ายไฟล์ (ใช้ `_build_editable_request()` + patterns เดิม)
- **IMPLEMENT**:
  - `test_edit_details_forbidden_for_agent_role()` — override admin เป็น `role=UserRole.AGENT`, PATCH `{"description": "แก้โดยไม่มีสิทธิ์"}` → assert 403 + `fake_request.description == "รายละเอียดเดิม"` (unchanged) — mirror โครงสร้าง test_unassign_request_forbidden_for_agent_role (L289-327) ทุกบรรทัด
  - `test_edit_contact_forbidden_for_agent_role()` — AGENT PATCH `{"phone_number": "0999999999"}` → 403 + ค่าเดิมไม่เปลี่ยน (ครอบ field ฝั่ง contact ว่าใช้ guard ตัวเดียวกัน)
  - `test_workflow_patch_not_blocked_by_details_guard_for_agent()` — AGENT PATCH `{"status": "IN_PROGRESS"}` บน PENDING request → assert **ไม่ใช่ 403** (status transition เป็นสิทธิ์ทุก admin role ตาม docstring เดิม) — กัน regression สำคัญที่สุดของ guard นี้
  - happy path ADMIN แก้ field ได้ → **มีอยู่แล้ว** (tests จาก Phase 1 ของ feature เดิมที่ใช้ `_patch_admin_overrides` ซึ่ง override เป็น ADMIN) — ไม่ต้องเขียนซ้ำ
- **MIRROR**: TEST_403_ENDPOINT
- **IMPORTS**: ใช้ของเดิมในไฟล์ (`SimpleNamespace`, `TestClient`, `app`, `deps`, `session_get_db`, `UserRole`, `RequestStatus`)
- **GOTCHA**: ต้อง `app.dependency_overrides.clear()` ใน finally เสมอ — มิฉะนั้น test ถัดไปรั่ว override
- **VALIDATE**: `python -m pytest tests/test_admin_requests_endpoints.py -q` — ทั้งไฟล์เขียว

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| can_edit_request_details per role | 6 roles + None | SUPER_ADMIN/ADMIN=True อื่นๆ=False | None role |
| string role input | "ADMIN"/"AGENT"/"UNKNOWN_ROLE" | True/False/ValueError | unknown role |
| summary includes new key | — | `["ADMIN", "SUPER_ADMIN"]` (sorted) | — |
| AGENT PATCH description | `{"description": "..."}` | 403, ค่าเดิมคงอยู่ | — |
| AGENT PATCH phone_number | `{"phone_number": "..."}` | 403, ค่าเดิมคงอยู่ | contact-side field |
| AGENT PATCH status only | `{"status": "IN_PROGRESS"}` | ไม่ใช่ 403 | guard ต้องไม่บล็อก workflow |

### Edge Cases Checklist
- [x] Empty string field (intentional clear) → ยังโดน guard (`"" is not None`)
- [x] Payload ผสม workflow + detail field โดย AGENT → 403 (มี detail field = ต้องมีสิทธิ์)
- [x] None role → False
- [x] Unknown role string → ValueError (พฤติกรรมเดิมของ `_check`)
- [ ] Concurrent access — N/A (stateless check)

---

## Validation Commands

> รันใน WSL ทั้งหมด (dev environment ของโปรเจกต์นี้)

### Unit Tests (affected)
```bash
wsl -e bash -c "cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest tests/test_permissions.py tests/test_admin_requests_endpoints.py -q"
```
EXPECT: ทุก test ผ่าน (เดิม + ใหม่ 7 ตัว)

### Full Test Suite
```bash
wsl -e bash -c "cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest -q"
```
EXPECT: ไม่มี regression

### Manual Validation (optional — ต้องมี backend + DB รัน)
- [ ] Startup log แสดง `Seeded 1 missing permission_settings row(s).` (ครั้งแรกหลัง deploy)
- [ ] `GET /api/v1/admin/settings/permissions` มี rule key `edit_request_details`
- [ ] `GET /api/v1/admin/settings/permissions/me` (ADMIN) มี `can_edit_request_details: true`

---

## Acceptance Criteria
- [ ] Tasks 1-5 เสร็จครบ
- [ ] Validation commands ผ่านทั้งหมด
- [ ] AGENT ถูกปฏิเสธ 403 เมื่อแก้ detail/contact field; workflow PATCH ไม่กระทบ
- [ ] ไม่มี lockout branch สำหรับ key ใหม่ (ตาม decision)

## Completion Checklist
- [ ] โค้ดใหม่แยกไม่ออกจากโค้ดเดิม (mirror pattern ทุกจุด)
- [ ] ข้อความ error ภาษาไทยสอดคล้องของเดิม
- [ ] ไม่มี hardcoded role list นอก DEFAULT_POLICY
- [ ] Docstrings อัปเดต (module key table + update_request)
- [ ] ไม่มี scope เพิ่ม (ไม่แตะ frontend, ไม่แตะ migration)

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Guard บล็อก workflow PATCH โดยไม่ตั้งใจ | M | H | ตรวจเฉพาะ field ใน tuple + test_workflow_patch_not_blocked ครอบ |
| ชื่อ field summary ไม่ตรง schema → TypeError | L | H | GOTCHA ใน Task 2 + test summary key |
| Test เดิมพังเพราะ override role | L | M | `_patch_admin_overrides` ใช้ ADMIN (มีสิทธิ์ใน default policy) — ผ่านต่อ |

## Notes
- ตอบ Open Question จาก PRD: seed ใช้ `ensure_seed_rows()` อย่างเดียวพอ — ยืนยันจากการที่ `revert_approval` ไม่มี alembic migration ของตัวเอง (grep ใน `backend/alembic/versions` ไม่พบ) และ `ensure_seed_rows` iterate จาก DEFAULT_POLICY อัตโนมัติ
- Matrix UI ฝั่ง frontend จะแสดงแถวใหม่เองทันทีที่ backend deploy (render จาก `rules` ของ API) — ไม่ใช่งาน Phase 1 แต่เป็นผลพลอยได้ที่มองเห็นได้
