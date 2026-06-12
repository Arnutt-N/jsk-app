# Implementation Report: Request Edit Audit Log — Phase 2 (Frontend: timeline merge)

## Summary
แท็บ "การดำเนินงาน/ความเห็น" แสดง audit entry การแก้ไขข้อมูลคำร้องแทรกเรียงเวลากับ comments แล้ว —
ดึงผ่าน `GET /admin/audit/logs?resource_id=...` (Phase 1), merge ด้วย pure function `mergeTimeline()`,
render ด้วย component แยก `AuditTimelineEntry` (tint ม่วง, ชื่อ field ไทย, old → new)

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | 9/10 | ตรง — implement รอบเดียว ไม่มี validation แตกจาก diff นี้ |
| Files Changed | 8 | 8 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | constants ชื่อ field ไทย | ✅ | `lib/constants/request-field-labels.ts` |
| 2 | test constants (4 tests) | ✅ | กัน drift กับ backend tuple |
| 3 | `mergeTimeline()` pure function | ✅ | `lib/timeline-merge.ts` + types |
| 4 | test merge (6 tests) | ✅ | ordering / tie-break / malformed / empty |
| 5 | component `AuditTimelineEntry` | ✅ | dot+bubble โครงเดียวกับ comment, tint violet |
| 6 | ต่อเข้า page.tsx | ✅ | state + fetch + merge useMemo + render + refresh หลัง save 2 จุด |
| 7 | ขยาย days bound (le=90→3650) | ✅ | default 7 คงเดิม |
| 8 | pytest days bound | ✅ | 3650→200, 3651→422 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | ✅ Pass | tsc 0 errors; eslint 0 errors (1 warning pre-existing: `setManageFormData` exhaustive-deps L413 — มีก่อน diff นี้) |
| Unit Tests | ✅ Pass | vitest **69 passed / 8 files** (59 เดิม + 10 ใหม่); pytest audit 3 passed |
| Build | ⏳ CI | `next build` ปล่อยให้ CI ตรวจ (tsc ผ่านแล้ว) |
| Integration | N/A | Phase 3 (E2E) |
| Edge Cases | ✅ Pass | audit ว่าง / fetch fail graceful / ค่า null แสดง '—' / malformed ถูกตัด |

## Files Changed

| File | Action |
|---|---|
| `frontend/lib/constants/request-field-labels.ts` | CREATED |
| `frontend/lib/constants/__tests__/request-field-labels.test.ts` | CREATED |
| `frontend/lib/timeline-merge.ts` | CREATED |
| `frontend/lib/__tests__/timeline-merge.test.ts` | CREATED |
| `frontend/components/admin/AuditTimelineEntry.tsx` | CREATED |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED (+~45 บรรทัด: imports/state/fetch/merge/render/refresh) |
| `backend/app/api/v1/endpoints/admin_audit.py` | UPDATED (days le=3650) |
| `backend/tests/test_admin_audit_endpoints.py` | UPDATED (+1 test) |

## Deviations from Plan
None — implemented exactly as planned

## Issues Encountered
None

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `request-field-labels.test.ts` | 4 | 12 fields ครบ, label ถูก, fallback |
| `timeline-merge.test.ts` | 6 | interleave, DESC input, tie-break, malformed, empty, comment-only |
| `test_admin_audit_endpoints.py` | +1 | days bound 3650/3651 |

## Notes
- ตอบ PRD open questions แล้ว: mapping ไทย = `lib/constants/request-field-labels.ts`, tie-break = audit ก่อน comment
- key เปลี่ยนจาก index → `c-{id}`/`a-{id}` (react key ข้ามชนิดไม่ชนกัน)

## Next Steps
- [ ] Phase 3: E2E + validation + completion report
- [ ] Code review รวม Phase 1+2 ก่อน commit
