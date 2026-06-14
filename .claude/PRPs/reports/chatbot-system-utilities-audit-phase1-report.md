# Implementation Report: Phase 1 — Audit & Critical Fixes

## Summary
ปิด "dead policy" ที่ DIRECTOR/HEAD เข้าถึง request workflow ไม่ได้ (สร้าง gate `get_current_manager`, เปลี่ยน request endpoints แบบ selective), เติม DIRECTOR/HEAD ใน frontend role type + Service Requests nav, extract `isNavItemVisible` เป็น pure helper, และจัดทำ audit report เป็น single source of truth.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | 8/10 | 8/10 (ตรงตามคาด) |
| Files Changed | ~10 | 11 (8 code/test + 2 doc + 1 helper) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | get_current_manager + staff gate | ✅ Complete | |
| 2 | request endpoints → manager (selective) | ✅ Complete | DELETE คง admin (verified ด้วย grep) |
| 3 | frontend StaffRole type += DIRECTOR/HEAD | ✅ Complete | layout.tsx + UserMenu.tsx |
| 4 | Service Requests nav += DIRECTOR/HEAD | ✅ Complete | |
| 5 | test_deps_gates.py | ✅ Complete | 13 tests (parametrized) |
| 6 | request authz tests | ✅ Complete | + regression fix (ดู Deviations) |
| 7 | nav-visibility test + pure helper | ✅ Complete | extract isNavItemVisible |
| 8 | audit report | ✅ Complete | single source of truth |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (tsc) | ✅ Pass | zero type errors (WSL) |
| Lint (eslint) | ✅ Pass | exit 0 บนไฟล์ที่แก้ |
| Unit Tests (backend) | ✅ Pass | 55 passed (deps_gates + permissions + admin_requests) |
| Unit Tests (frontend) | ✅ Pass | 86 passed (10 files, รวม nav-access 7 ใหม่, 0 regression) |
| Build (next build) | ⚠️ Blocked (env) | `@tailwindcss/oxide-win32-x64-msvc` หาย (npm #4828) — pre-existing, ไม่เกี่ยวโค้ด; CI clean-install จะ verify |
| Edge Cases | ✅ Pass | role=None/USER → 403; revert/delete blocked for DIRECTOR/HEAD |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `backend/app/api/deps.py` | UPDATE | +get_current_manager, staff gate +DIRECTOR/HEAD |
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATE | import + 10 gate→manager (DELETE คง admin) |
| `frontend/app/admin/layout.tsx` | UPDATE | type, nav, isNavItemVisible helper, ลบ unused StaffRole |
| `frontend/components/admin/UserMenu.tsx` | UPDATE | StaffRole +DIRECTOR/HEAD |
| `frontend/lib/nav-access.ts` | CREATE | pure isNavItemVisible |
| `backend/tests/test_deps_gates.py` | CREATE | gate role tests |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATE | manager override regression fix + DIRECTOR/HEAD tests |
| `frontend/lib/__tests__/nav-access.test.ts` | CREATE | nav visibility tests |
| `.claude/PRPs/reports/chatbot-system-utilities-audit-report.md` | CREATE | audit single source of truth |
| `.claude/PRPs/prds/...prd.md` + `plans/...phase1.plan.md` | CREATE | PRD + plan |

## Deviations from Plan

1. **Test regression fix (เพิ่มจาก plan)**: เปลี่ยน gate เป็น `manager` ทำให้ tests เดิมที่ override `deps.get_current_admin` หลุด (FastAPI เรียก `get_current_manager` ที่ไม่ถูก override). **WHY**: dependency_overrides ผูกกับฟังก์ชัน gate เฉพาะตัว. **FIX**: เพิ่ม override `get_current_manager` ทุกจุดที่ override `get_current_admin` (replace_all, ปลอดภัยเพราะทุก teardown ใช้ `.clear()`). Plan task 6 ประเมินส่วนนี้ต่ำไป — เป็น insight ที่ควรใส่ใน plan ครั้งหน้าเมื่อเปลี่ยน shared gate.

2. **create_request คง `get_current_admin` (จาก code review)**: plan ระบุเปลี่ยน POST create → manager แต่ reviewer 2 ตัวชี้ตรงกันว่า create **ไม่มี `can_*` guard ชั้นใน** + DEFAULT_POLICY ไม่มี key สำหรับ create → การเปิดให้ DIRECTOR/HEAD = ขยายสิทธิ์ใหม่โดยไม่มี policy คุม (ขัด least-privilege). **FIX**: revert create → `get_current_admin`; เพิ่ม `test_get_current_admin_stays_strict` ยืนยัน admin gate ยัง reject DIRECTOR/HEAD (กัน regression DELETE/create/sensitive).

## Code Review
- 2 reviewers (security + general): **0 CRITICAL / 0 HIGH → APPROVE**
- 2 MEDIUM แก้แล้ว (create_request → admin; +admin gate test) · 2 LOW รับทราบ-คงไว้ (pure-helper type, role list ใน test → Phase 3 central constants)
- Backend re-validate: **61 passed**

## Issues Encountered

1. **Frontend tooling platform mismatch**: vitest fail ใน WSL (`@rollup/rollup-linux-x64-gnu` หาย) แต่ผ่านบน Windows; build fail บน Windows (`@tailwindcss/oxide-win32` หาย). → node_modules มี optional native deps ไม่ครบทั้ง 2 platform (npm #4828). **ต้อง confirm กับผู้ใช้** ว่า frontend ควรรัน WSL หรือ Windows + reinstall ให้ครบ. ไม่กระทบความถูกต้องของโค้ด.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `test_deps_gates.py` | 13 | get_current_manager/staff role gate ทุก role |
| `test_admin_requests_endpoints.py` | +2 | DIRECTOR assign / HEAD revert-blocked |
| `nav-access.test.ts` | 7 | nav visibility ทุก role × group |

## Next Steps
- [ ] Code review (`/ecc:code-review`)
- [ ] Fix review findings
- [ ] Commit → push → PR → CI (build verify บน clean env)
- [ ] Confirm frontend dev platform กับผู้ใช้ (WSL vs Windows)
