# Plan: Request Edit Audit Log — Phase 1 (Backend: capture diff + API)

## Summary
บันทึก audit entry (action `edit_request_details`) ทุกครั้งที่ PATCH `/admin/requests/{id}` แก้ detail/contact field สำเร็จ โดยเก็บ diff `{field: {old, new}}` เฉพาะ field ที่ค่าเปลี่ยนจริง และเพิ่ม `resource_id` filter ให้ `GET /admin/audit/logs` เพื่อให้ Phase 2 ดึงประวัติราย request ได้

## User Story
As a หัวหน้างาน/ผู้ตรวจสอบ, I want ทุกการแก้ไขข้อมูลคำร้องถูกบันทึกพร้อมค่าเดิม→ค่าใหม่, so that ตอบได้ว่า "ใครแก้อะไร เมื่อไร ข้อมูลเดิมคืออะไร"

## Problem → Solution
ปัจจุบันแก้ 12 field (details/contact tabs) ไม่ทิ้งหลักฐานใด ๆ (มีแค่ `updated_at`) → ทุก PATCH ที่เปลี่ยนค่า field สร้าง AuditLog 1 แถว พร้อม diff ครบ ดึงย้อนหลังราย request ได้ผ่าน API เดิม

## Metadata
- **Complexity**: Small-Medium
- **Source PRD**: `.claude/PRPs/prds/request-edit-audit-log.prd.md`
- **PRD Phase**: Phase 1 — Backend: capture diff + API
- **Estimated Files**: 4 (2 source UPDATE, 1 test UPDATE, 1 test CREATE)

---

## UX Design

N/A — internal change (backend only; UI มาใน Phase 2)

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `backend/app/api/v1/endpoints/admin_requests.py` | 343-518 | จุด implement: guard `is_editing_details` (L421-428), block "# Update fields" (L430-500), pattern `create_audit_log` (L446-455, L502-514), `db.commit()` (L516) |
| P0 | `backend/app/core/audit.py` | 97-136 | `create_audit_log()` signature — add + flush, **ไม่ commit** (caller commit เอง) |
| P1 | `backend/tests/test_admin_requests_endpoints.py` | 1-260 | `_FakeDB`, `_patch_admin_overrides`, builder + assertion pattern ของ audit test เดิม |
| P1 | `backend/app/api/v1/endpoints/admin_audit.py` | 15-87 | endpoint `GET /logs` ที่จะเพิ่ม filter (additive) |
| P2 | `backend/app/models/audit_log.py` | all | คอลัมน์: action String(50), resource_id String(100), details JSONB default {} |

## External Documentation

No external research needed — feature uses established internal patterns.

---

## Patterns to Mirror

### CONSTANT_FIELD_TUPLE
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:344-349
# Fields gated by the edit_request_details permission (details + contact tabs).
EDITABLE_DETAIL_CONTACT_FIELDS = (
    "topic_category", "topic_subcategory", "description",
    "prefix", "firstname", "lastname", "phone_number", "email",
    "sub_district", "district", "province", "agency",
)
```

### AUDIT_CALL_PATTERN
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:502-514 (revert_approval)
if is_revert_from_completed:
    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="revert_approval",
        resource_type="service_request",
        resource_id=str(request.id),
        details={
            "from_status": prior_status.value,
            "to_status": update_data.status.value,
            "notes": update_data.notes,
        },
    )
```

### CAPTURE_BEFORE_MUTATE
```python
# SOURCE: backend/app/api/v1/endpoints/admin_requests.py:394-409 (revert detection)
# Detect revert-from-COMPLETED BEFORE mutating so we can: ...
is_revert_from_completed = (...)
prior_status = request.status
```
(comment อธิบาย "ทำไมต้อง snapshot ก่อน mutate" — ใช้ style เดียวกันกับ snapshot ของเรา)

### QUERY_FILTER_PATTERN
```python
# SOURCE: backend/app/api/v1/endpoints/admin_audit.py:40-47
    if admin_id:
        query = query.where(AuditLog.admin_id == admin_id)

    if action:
        query = query.where(AuditLog.action == action)
```

### TEST_STRUCTURE
```python
# SOURCE: backend/tests/test_admin_requests_endpoints.py:169-203
def test_revert_completed_to_awaiting_approval_logs_audit():
    fake_db = _FakeDB()
    fake_db._fake_request = _build_completed_request()
    teardown = _patch_admin_overrides(fake_db)

    client = TestClient(app)
    try:
        response = client.patch(
            "/api/v1/admin/requests/42",
            json={"status": "AWAITING_APPROVAL"},
        )
    finally:
        client.close()
        teardown()

    assert response.status_code == 200
    audit_rows = [obj for obj in fake_db.added if isinstance(obj, AuditLog)]
    assert len(audit_rows) == 1
    log = audit_rows[0]
    assert log.action == "revert_approval"
    assert log.details == {...}
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | snapshot ค่าเดิม + diff + `create_audit_log("edit_request_details")` |
| `backend/app/api/v1/endpoints/admin_audit.py` | UPDATE | เพิ่ม `resource_id` query param + where clause (additive) |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATE | เพิ่ม test diff ถูกต้อง / ค่าเท่าเดิม / workflow-only |
| `backend/tests/test_admin_audit_endpoints.py` | CREATE | test `resource_id` filter ถูกใส่ใน query เมื่อส่ง param |

## NOT Building
- Frontend timeline (Phase 2), E2E (Phase 3)
- Permission key ใหม่สำหรับดู log / retention / export / audit viewer รวม
- ไม่แตะ pattern unassign / revert_approval เดิม
- ไม่ส่ง ip_address / user_agent (entry เดิมในไฟล์นี้ก็ไม่ส่ง — คง convention)
- ไม่แก้ N+1 enrich admin_name ใน admin_audit.py (pre-existing, นอก scope)

---

## Step-by-Step Tasks

### Task 1: Snapshot ค่าเดิมก่อน mutation
- **ACTION**: ใน `update_request` (admin_requests.py) หลัง permission guard `is_editing_details` (หลัง L428) และ**ก่อน** comment `# Update fields` (L430) เพิ่ม snapshot
- **IMPLEMENT**:
  ```python
  # Snapshot current values BEFORE the "# Update fields" block mutates the
  # row, so the audit diff records true old -> new transitions. Only fields
  # present in the payload are candidates.
  prior_detail_values = {
      f: getattr(request, f, None)
      for f in EDITABLE_DETAIL_CONTACT_FIELDS
      if getattr(update_data, f) is not None
  }
  ```
- **MIRROR**: CAPTURE_BEFORE_MUTATE (comment style อธิบายเหตุผลเหมือน L394-400)
- **IMPORTS**: ไม่ต้องเพิ่ม (`create_audit_log`, `EDITABLE_DETAIL_CONTACT_FIELDS` มีในไฟล์แล้ว)
- **GOTCHA**: dict นี้ว่างเมื่อ payload เป็น workflow-only (`is_editing_details=False`) — ใช้เป็นเงื่อนไขเขียน log ได้เลย ไม่ต้องเช็ค `is_editing_details` ซ้ำ
- **VALIDATE**: pytest Task 4 เคส old ถูกต้อง

### Task 2: คำนวณ diff + เขียน audit entry
- **ACTION**: หลัง block recompute `requester_name` (L500) ติดกับ block `is_revert_from_completed` (ก่อน `db.commit()` L516) เพิ่ม diff + create_audit_log
- **IMPLEMENT**:
  ```python
  # Audit trail for detail/contact edits: one entry per PATCH covering all
  # fields whose value actually changed (PRD: request-edit-audit-log).
  changed_fields = {
      f: {"old": old, "new": getattr(request, f, None)}
      for f, old in prior_detail_values.items()
      if getattr(request, f, None) != old
  }
  if changed_fields:
      await create_audit_log(
          db=db,
          admin_id=current_admin.id,
          action="edit_request_details",
          resource_type="service_request",
          resource_id=str(request.id),
          details={"fields": changed_fields},
      )
  ```
- **MIRROR**: AUDIT_CALL_PATTERN (keyword args ครบ, `resource_id=str(request.id)`)
- **GOTCHA**: ทั้ง 12 field เป็น `str | None` — JSONB-safe ไม่ต้องแปลง; วาง block **ก่อน** `db.commit()` เพราะ `create_audit_log` แค่ flush; action ยาว 20 ตัวอักษร < String(50) ✓
- **VALIDATE**: pytest Task 4 ทุกเคส + test เดิม revert/unassign ยังผ่าน (1 entry เท่าเดิม — payload พวกนั้นไม่มี detail field)

### Task 3: เพิ่ม resource_id filter ให้ GET /admin/audit/logs
- **ACTION**: ใน `get_audit_logs` (admin_audit.py:15) เพิ่ม param + where
- **IMPLEMENT**: เพิ่ม param หลัง `resource_type`:
  ```python
  resource_id: Optional[str] = Query(None, description="Filter by resource ID"),
  ```
  และ where clause หลัง block `resource_type` (L46-47):
  ```python
  if resource_id:
      query = query.where(AuditLog.resource_id == resource_id)
  ```
- **MIRROR**: QUERY_FILTER_PATTERN (truthy check + chained `.where` แบบเดียวกับ filter เดิม)
- **GOTCHA**: additive เท่านั้น — ห้ามแก้ default/ลำดับ param เดิม (client เดิมไม่กระทบ); `resource_id` เป็น String ใน model — เทียบ string ไม่ใช่ int
- **VALIDATE**: pytest Task 5

### Task 4: pytest — diff capture ใน update_request
- **ACTION**: เพิ่ม tests ต่อท้าย `backend/tests/test_admin_requests_endpoints.py` พร้อม builder ใหม่
- **IMPLEMENT**:
  - Builder `_build_editable_request(request_id=50)` — SimpleNamespace แบบ `_build_in_progress_request` แต่เพิ่มครบ 12 detail field (เช่น `phone_number="0811111111"`, `firstname="สมชาย"`, `email=None`, ...) + `requester_name`
  - `test_edit_detail_field_logs_audit_with_diff`: PATCH `{"phone_number": "0899999999", "firstname": "สมหญิง"}` → 200, audit 1 แถว: `action == "edit_request_details"`, `resource_type == "service_request"`, `resource_id == "50"`, `admin_id == 7`, `details == {"fields": {"phone_number": {"old": "0811111111", "new": "0899999999"}, "firstname": {"old": "สมชาย", "new": "สมหญิง"}}}`
  - `test_edit_with_unchanged_value_excluded_from_diff`: PATCH `{"phone_number": "0811111111", "district": "เมือง-ใหม่"}` (เบอร์เดิมเท่าเดิม) → diff มีแค่ `district`
  - `test_edit_all_values_unchanged_logs_nothing`: PATCH ทุก field = ค่าเดิม → `audit_rows == []`
  - `test_workflow_only_patch_logs_no_edit_audit`: PATCH `{"priority": "HIGH"}` → ไม่มีแถว `edit_request_details`
- **MIRROR**: TEST_STRUCTURE (try/finally + teardown, filter `fake_db.added` ด้วย `isinstance(obj, AuditLog)`)
- **GOTCHA**: builder ต้องมี 12 field ครบ ไม่งั้น snapshot `getattr(request, f, None)` คืน None แล้ว diff เพี้ยน; เคสแก้ name field จะ trigger recompute `requester_name` — builder ต้องมี `prefix`/`firstname`/`lastname` และ `requester_name`
- **VALIDATE**: `python -m pytest tests/test_admin_requests_endpoints.py -v` เขียวทั้งไฟล์ (เดิม + ใหม่)

### Task 5: pytest — resource_id filter (ไฟล์ใหม่)
- **ACTION**: CREATE `backend/tests/test_admin_audit_endpoints.py`
- **IMPLEMENT**: FakeDB เฉพาะกิจที่บันทึก statement ทุกตัว:
  ```python
  """Endpoint tests for admin audit log filters."""
  from types import SimpleNamespace

  from fastapi.testclient import TestClient

  from app.api import deps
  from app.db.session import get_db as session_get_db
  from app.main import app
  from app.models.user import UserRole


  class _FakeResult:
      def scalars(self):
          return self
      def all(self):
          return []


  class _FakeAuditDB:
      """Records every statement so tests can assert on compiled SQL."""
      def __init__(self) -> None:
          self.statements = []

      async def execute(self, stmt):
          self.statements.append(str(stmt))
          return _FakeResult()

      async def scalar(self, stmt):
          self.statements.append(str(stmt))
          return 0
  ```
  helper override admin (SimpleNamespace role=UserRole.ADMIN) แบบ `_patch_admin_overrides`
  - `test_logs_with_resource_id_adds_filter`: GET `/api/v1/admin/audit/logs?resource_id=42` → 200 และ `any("audit_logs.resource_id" in s for s in fake_db.statements)`
  - `test_logs_without_resource_id_has_no_filter`: GET `/api/v1/admin/audit/logs` → 200 และไม่มี statement ไหน contain `audit_logs.resource_id`
- **MIRROR**: TEST_STRUCTURE (override + try/finally); docstring header แบบไฟล์ test อื่น
- **IMPORTS**: ตามโค้ดด้านบน — ไม่ import AuditLog (ไม่ assert object)
- **GOTCHA**: endpoint ดึง logs ว่าง → ไม่เข้า loop enrich admin_name → FakeDB ไม่ต้องรองรับ select(User); `str(stmt)` ของ SQLAlchemy ใส่ชื่อ column เต็ม `audit_logs.resource_id` เสมอ; route จริงคือ `/api/v1/admin/audit/logs` (ตรวจ prefix ใน `api.py` ถ้า 404)
- **VALIDATE**: `python -m pytest tests/test_admin_audit_endpoints.py -v`

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| edit 2 fields | PATCH phone+firstname เปลี่ยนค่า | 1 entry, diff 2 field ครบ old/new | - |
| unchanged value | PATCH ค่าเท่าเดิม 1 + เปลี่ยน 1 | diff มีเฉพาะ field ที่เปลี่ยน | ✓ |
| all unchanged | PATCH ทุกค่าเท่าเดิม | ไม่มี entry | ✓ |
| workflow-only | PATCH priority อย่างเดียว | ไม่มี entry edit_request_details | ✓ |
| filter on | ?resource_id=42 | query มี where resource_id | - |
| filter off | ไม่ส่ง param | query ไม่มี where resource_id | ✓ |

### Edge Cases Checklist
- [x] ค่าเท่าเดิม (ไม่บันทึก noise)
- [x] payload ไม่มี detail field เลย
- [x] ค่า None → string (field ที่เดิมว่าง เช่น email=None → "a@b.com" ต้องได้ old=None)
- [ ] Concurrent access — N/A (per-request transaction)
- [x] test เดิม (revert/unassign/comment/403) ต้องไม่แตก

---

## Validation Commands

> รันใน WSL (backend venv อยู่ใน WSL)

### Unit Tests (affected)
```bash
wsl -e bash -lc "cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest tests/test_admin_requests_endpoints.py tests/test_admin_audit_endpoints.py -v"
```
EXPECT: ทุก test ผ่าน (เดิม + ใหม่ ~10+)

### Full Test Suite
```bash
wsl -e bash -lc "cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest"
```
EXPECT: เขียวทั้งหมด ไม่มี regression (เดิม 338 ตัว + ใหม่)

### Manual Validation
- [ ] (เลื่อนไป Phase 3 UAT — Phase 1 ไม่มี UI)

---

## Acceptance Criteria
- [ ] PATCH ที่เปลี่ยน detail/contact field สร้าง AuditLog 1 แถว action `edit_request_details` พร้อม diff old→new ถูกต้อง
- [ ] field ค่าเท่าเดิมไม่อยู่ใน diff; ทุกค่าเท่าเดิม = ไม่มี entry; workflow-only = ไม่มี entry
- [ ] `GET /admin/audit/logs?resource_id=...` filter ได้ และไม่ส่ง param = พฤติกรรมเดิม
- [ ] pytest เขียวทั้ง suite

## Completion Checklist
- [ ] Snapshot อยู่ก่อน block "# Update fields" เสมอ
- [ ] create_audit_log ถูกเรียกก่อน db.commit()
- [ ] ไม่แตะ entry unassign / revert_approval เดิม
- [ ] additive change ใน admin_audit.py (param เดิมครบ ลำดับเดิม)
- [ ] test ใช้ _FakeDB pattern เดิม ไม่ต้องใช้ DB จริง

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Snapshot วางผิดตำแหน่ง (หลัง mutation) → old==new | M | H | Task 1 ระบุตำแหน่งชัด (หลัง L428 ก่อน L430) + test ยืนยันค่า old |
| Tuple `EDITABLE_DETAIL_CONTACT_FIELDS` drift จาก schema ในอนาคต | L | M | pre-existing risk (review PR #85 บันทึกไว้แล้ว) — นอก scope |
| `str(stmt)` assertion เปราะถ้า SQLAlchemy เปลี่ยน compile format | L | L | assert แค่ substring ชื่อ column ไม่ใช่ SQL เต็ม |

## Notes
- Action name `edit_request_details` ตรงกับชื่อ permission key เดิม (PR #85) — ตั้งใจให้สอดคล้องกัน
- โครง details `{"fields": {...}}` มี wrapper key เผื่ออนาคตเพิ่ม metadata (เช่น source) ได้โดยไม่ชน field diff
- Phase 2 จะ consume API นี้ด้วย `?resource_type=service_request&resource_id={id}&action=edit_request_details` (หรือไม่กรอง action เพื่อโชว์ unassign/revert ด้วย — Could ใน PRD)
