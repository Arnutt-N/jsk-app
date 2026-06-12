# Implementation Report: Request Edit Audit Log — Phase 1 (Backend: capture diff + API)

## Summary
ทุก PATCH `/admin/requests/{id}` ที่เปลี่ยนค่า detail/contact field (12 fields) จะสร้าง AuditLog 1 แถว
action `edit_request_details` พร้อม diff `{"fields": {field: {"old", "new"}}}` เฉพาะ field ที่ค่าเปลี่ยนจริง
และ `GET /admin/audit/logs` รองรับ filter `resource_id` แล้ว (additive) สำหรับ Phase 2 ดึงประวัติราย request

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small-Medium | Small-Medium |
| Confidence | 9/10 | ตรง — implement รอบเดียว, สะดุดเฉพาะจุด test override |
| Files Changed | 4 | 4 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Snapshot ค่าเดิมก่อน mutation | ✅ Complete | วางหลัง permission guard ก่อน block "# Update fields" ตามแผน |
| 2 | คำนวณ diff + เขียน audit entry | ✅ Complete | วางก่อน `db.commit()` ติดกับ block revert_approval |
| 3 | เพิ่ม resource_id filter | ✅ Complete | additive — param/ลำดับเดิมไม่เปลี่ยน |
| 4 | pytest diff capture (4 tests) | ✅ Complete | Deviated — reuse `_build_editable_request` ที่มีอยู่แล้ว |
| 5 | pytest resource_id filter (2 tests) | ✅ Complete | Deviated — override `deps.get_db` + assert `"resource_id ="` (ดู Deviations) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | โปรเจกต์ไม่มี mypy/ruff config ฝั่ง backend; CI ใช้ pytest |
| Unit Tests | ✅ Pass | 6 tests ใหม่ (4 diff + 2 filter) |
| Build | N/A | backend ไม่มี build step |
| Integration | ✅ Pass | full suite ผ่าน DB จริง (docker db+redis) |
| Edge Cases | ✅ Pass | ค่าเท่าเดิม / ทุกค่าเดิม / workflow-only / filter on-off |

Full suite: **344 passed** (338 เดิม + 6 ใหม่) — ไม่มี regression

## Files Changed

| File | Action | Lines |
|---|---|---|
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATED | +27 (snapshot + diff + audit call) |
| `backend/app/api/v1/endpoints/admin_audit.py` | UPDATED | +4 (param + where) |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATED | +118 (4 tests) |
| `backend/tests/test_admin_audit_endpoints.py` | CREATED | +109 (2 tests + fake session) |

## Deviations from Plan

1. **Task 4 — ไม่สร้าง builder ใหม่**: `_build_editable_request()` มีครบ 12 field อยู่แล้วจาก PR #82 tests — reuse แทน (DRY)
2. **Task 5 — override `deps.get_db` ไม่ใช่ `session.get_db`**: codebase มี `get_db` 2 ตัว
   (`app/db/session.py:20` ที่ admin_requests ใช้ vs `app/api/deps.py:14` ที่ admin_audit ใช้) —
   FastAPI override เทียบ function identity ทำให้ override ผิดตัวแล้ว endpoint ต่อ DB จริง
3. **Task 5 — assertion pattern เป็น `"audit_logs.resource_id ="`**: compiled SELECT มีชื่อ column ใน
   projection เสมอ ต้องเติม `=` เพื่อ match เฉพาะ WHERE clause

## Issues Encountered

- Full suite รอบแรกมี 27 errors ใน `test_websocket.py` — สาเหตุคือ Docker (db/redis) ไม่ได้เปิด
  (environment ล้วน ไม่เกี่ยว diff) → `docker compose up -d db redis` แล้วรันใหม่เขียวหมด

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `test_admin_requests_endpoints.py` | 4 | diff ถูกต้อง (old/new/admin/resource), ค่าเท่าเดิม excluded, ทุกค่าเดิม = ไม่มี entry, workflow-only = ไม่มี entry |
| `test_admin_audit_endpoints.py` | 2 | resource_id filter on/off ผ่าน compiled SQL inspection |

## Observations (สำหรับ review/อนาคต — นอก scope)

- `get_db` ซ้ำ 2 ที่ (`db/session.py` vs `api/deps.py`) — duplication drift ที่ควรรวมเป็นตัวเดียวสักวัน
- N+1 enrich admin_name ใน `admin_audit.py` ยังอยู่ (pre-existing, แผนระบุนอก scope)

## Next Steps
- [ ] Phase 2: Frontend timeline merge (`/ecc:prp-plan` PRD เดิม)
- [ ] Code review ก่อน commit (`/code-review`)
- [ ] รวม 3 phases เป็น PR เดียวตามแผน PRD
