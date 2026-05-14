# Implementation Report: Request Management Feature & Decisions (PRD B)

## Summary

แก้หน้า `/admin/requests/[id]` ตาม PRD B 3 เรื่องหลักในรอบเดียว:

1. **Revert approval** — admin/super-admin ยกเลิกการอนุมัติ (COMPLETED → AWAITING_APPROVAL หรือ IN_PROGRESS) ผ่านเมนู kebab "การจัดการพิเศษ" พร้อม confirm dialog + audit log
2. **Hero merge** — รวม 3 cards แยก (hero + tab nav + tab content) เป็น 1 card ที่มี internal dividers (PRD B Issue 5)
3. **Action completeness** — เปิดเมนู kebab ให้เห็นบน COMPLETED state เพื่อไม่ให้ admin ติด dead-end (PRD B Issue 4 = 6b)

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | 9.5/10 (after 2 review patches) | 9.5/10 — implemented as planned |
| Files Changed | 5 | 5 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Backend: revert detection + audit log + completed_at reset | Complete | `admin_requests.py:update_request` extended |
| 2 | Backend: 3 unit tests for revert behavior | Complete | FakeDB extended with `flush()` + `_fake_request` injection |
| 3 | Frontend: expand kebab visibility + add revert menu items + state | Complete | `request.status !== 'REJECTED'` (was: also exclude COMPLETED) |
| 3.5 | Frontend: update STATUS_TRANSITIONS map | Complete | `COMPLETED: ['AWAITING_APPROVAL', 'IN_PROGRESS']` |
| 4 | Frontend: ConfirmDialog wired to revertConfirm state | Complete | Reuses canonical ConfirmDialog from PR #54 |
| 5 | Frontend: merge 3 cards into 1 (hero + tab nav + tab content) | Complete | Outer card owns chrome; inner sections use `border-t` dividers |
| 6 | Frontend: 3 E2E tests for revert flow | Complete | Filter-dropdown UI helper + PATCH mock for non-destructive test |
| 7 | Local validation pass | Complete | See Validation Results |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (tsc --noEmit) | Pass | Zero TypeScript errors after merge + new tests |
| Lint (ESLint) | Pass | Zero warnings on changed files |
| Unit Tests (vitest) | Pass | Backend 4/4 (3 new + 1 pre-existing), frontend hook tests intact |
| E2E Tests (Playwright) | Deferred | New revert tests added; full Playwright run is CI-only on this branch |
| Build | Deferred | tsc --noEmit covers type errors; full `next build` runs in CI |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `backend/app/api/v1/endpoints/admin_requests.py` | UPDATED | +33 / -0 |
| `backend/tests/test_admin_requests_endpoints.py` | UPDATED | +175 / -4 |
| `frontend/app/admin/requests/[id]/page.tsx` | UPDATED | +118 / -28 |
| `frontend/e2e/admin-requests-supervisor.spec.ts` | UPDATED | +143 / -0 |
| `frontend/lib/constants/request-status.ts` | UPDATED | +3 / -1 |

Total: 5 source files, +472 / -33 lines.

## Deviations from Plan

None. Both rounds of plan review (Round 1: added Task 3.5 + ConfirmDialog import note; Round 2: rewrote Task 2 to use sync TestClient + FakeDB pattern that already exists in the codebase, and rewrote Task 6 helper to use the filter dropdown UI instead of URL params) were applied BEFORE code was written, so the implementation tracked the patched plan exactly.

## Issues Encountered

- **`@rollup/rollup-win32-x64-msvc` missing on local Windows env** — pre-existing npm optional-dependency bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828)). Fixed with `npm install @rollup/rollup-win32-x64-msvc --no-save` (does not touch `package-lock.json`). CI is unaffected (Linux uses `@rollup/rollup-linux-x64-gnu`).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `backend/tests/test_admin_requests_endpoints.py` | 3 new (`test_revert_completed_to_awaiting_approval_logs_audit`, `test_revert_completed_to_in_progress_logs_audit`, `test_forward_transition_does_not_log_revert_audit`) | revert path + audit log shape + negative case for forward transitions |
| `frontend/e2e/admin-requests-supervisor.spec.ts` | 3 new (kebab visibility on COMPLETED, cancel keeps status, confirm PATCH payload) | full revert UX path with PATCH mocked to keep tests non-destructive |

## Backend audit-log schema

The revert path writes one `audit_logs` row per revert with:

```jsonc
{
  "admin_id":     <current admin id>,
  "action":       "revert_approval",
  "resource_type": "service_request",
  "resource_id":  "<request id as string>",
  "details": {
    "from_status": "COMPLETED",
    "to_status":   "AWAITING_APPROVAL" | "IN_PROGRESS"
  }
}
```

The row is written via `app.core.audit.create_audit_log` which uses `await db.flush()` to surface the row ID. The row is committed atomically with the status update in `update_request` (single `await db.commit()` at the end of the handler).

## Next Steps

- [ ] Code review via `/code-review`
- [ ] Create PR via `/prp-pr`
- [ ] PRD C (configurable permission matrix) can now build on top of B's hardcoded `canApprove` gate
