# Local Review: edit-request-details-permission (Phase 1 + 2, uncommitted)

**Reviewed**: 2026-06-11
**Branch**: feat/edit-request-details-permission
**Scope**: 7 modified files (backend permission key + PATCH guard, frontend gating)
**Decision**: APPROVE

## Summary

Permission key `edit_request_details` added end-to-end following the existing
`revert_approval` pattern exactly: DEFAULT_POLICY fallback + seed description
(backend), conditional 403 guard on PATCH `/admin/requests/{id}` that fires only
when the payload carries a details/contact field, `/permissions/me` +
`PermissionSummary` exposure, and fail-closed frontend gating
(`permissions?.can_edit_request_details ?? false`). No security issues found.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW
1. `backend/app/api/v1/endpoints/admin_requests.py` — `EDITABLE_DETAIL_CONTACT_FIELDS`
   duplicates field names from `RequestUpdate`. If a future editable detail field is
   added to the model but not to the tuple, the guard silently won't cover it.
   Mitigation idea (optional, future): a test asserting every tuple entry exists on
   `RequestUpdate.model_fields`.
2. `frontend/app/admin/requests/[id]/page.tsx` — file exceeds the 800-line guideline
   (pre-existing; this change adds only 2 small permission gates). No action in this PR.

## Security Checklist

- [x] No hardcoded secrets / keys / tokens in the diff
- [x] Authorization enforced server-side (403 guard), UI hiding is cosmetic only
- [x] Guard uses `is not None` — consistent with the field-application logic, so
      empty-string "clear" payloads are also gated
- [x] Workflow PATCHes (status/assignment/priority/notes) unaffected — regression test added
- [x] Error message does not leak sensitive data
- [x] Input validated via Pydantic models
- [x] Frontend fail-closed: loading/error/old-backend → button hidden

## Validation Results

| Check | Result |
|---|---|
| Backend pytest (WSL) | Pass — 338 passed in 23.55s |
| Frontend tsc --noEmit (WSL) | Pass — 0 errors |
| Frontend eslint | Pass (previous run, unchanged tree) |
| Frontend vitest (Windows) | Pass — 59/59 (previous run, unchanged tree) |

## Files Reviewed

- backend/app/core/permissions.py — Modified
- backend/app/api/v1/endpoints/settings.py — Modified
- backend/app/api/v1/endpoints/admin_requests.py — Modified
- backend/tests/test_permissions.py — Modified (4 new tests)
- backend/tests/test_admin_requests_endpoints.py — Modified (3 new tests)
- frontend/lib/permissions.ts — Modified
- frontend/app/admin/requests/[id]/page.tsx — Modified
