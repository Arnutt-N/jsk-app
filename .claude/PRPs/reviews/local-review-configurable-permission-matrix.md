# Code Review: Configurable Permission Matrix (PRD C)

**Reviewed**: 2026-05-23
**Branch**: feat/configurable-permission-matrix → main
**Decision**: APPROVE with 1 fix required

## Summary

Clean implementation following established patterns. Adds `revert_approval` permission key with proper backend guard, frontend gating, and lockout safeguard. One test case has a bug (expects `False` for invalid string but gets `ValueError`).

---

## Findings

### CRITICAL
*None*

### HIGH
*None*

### MEDIUM

#### 1. Test expects `False` for invalid role string but `_check()` raises `ValueError`
- **File**: `backend/tests/test_permissions.py:37`
- **Line**: 37
- **Issue**: `assert can_revert_approval("UNKNOWN_ROLE") is False` will throw `ValueError: 'UNKNOWN_ROLE' is not a valid UserRole` because `_check()` (permissions.py:204-208) does `UserRole(role)` without try/except for invalid strings.
- **Suggested fix**:
  ```python
  def test_can_revert_approval_string_input():
      assert can_revert_approval("ADMIN") is True
      assert can_revert_approval("DIRECTOR") is False
  
  def test_can_revert_approval_invalid_string_raises():
      with pytest.raises(ValueError):
          can_revert_approval("UNKNOWN_ROLE")
  ```
  Or simply remove the `"UNKNOWN_ROLE"` assertion since invalid string input is not a supported contract for `_check()`.

### LOW
*None*

---

## Validation Results

| Check | Result |
|---|---|
| Type check (frontend) | ✅ Pass — zero errors |
| Lint (frontend) | ✅ Pass — 0 errors (13 pre-existing warnings) |
| Unit tests (frontend) | ✅ Pass — 6/6 |
| Backend syntax (py_compile) | ✅ Pass — all 3 files |
| Backend tests | ⚠️ 1 test will fail (see MEDIUM finding above) |
| Build (frontend tsc) | ✅ Pass |

---

## Files Reviewed

| File | Action | Assessment |
|---|---|---|
| `backend/app/core/permissions.py` | Modified | Clean pattern extension. KEY_REVERT, DEFAULT_POLICY, _SEED_DESCRIPTIONS, can_revert_approval(), get_permission_summary() all follow existing conventions. |
| `backend/app/api/v1/endpoints/settings.py` | Modified | PermissionSummary schema correctly extended (prevents Pydantic ValidationError). Lockout safeguard mirrors edit_permission_settings pattern. MyPermissions schema synced. |
| `backend/app/api/v1/endpoints/admin_requests.py` | Modified | Guard placed BEFORE status mutation. Defense-in-depth with 403. Correct import. |
| `frontend/lib/permissions.ts` | Modified | Interfaces extended correctly. Type-safe. |
| `frontend/app/admin/requests/[id]/page.tsx` | Modified | Kebab outer gate `(canApprove \|\| canRevertApproval)` prevents hiding revert from users who have revert but not assign permission. Inner gate `canRevertApproval` on revert items. |
| `frontend/e2e/permission-settings.spec.ts` | Modified | Row count updated to 4. New test asserts Thai label presence — more robust than count-only. |
| `backend/tests/test_permissions.py` | Created | Good parametrized coverage. **1 test case buggy** (see MEDIUM finding). |

---

## Security Checklist

- [x] No hardcoded credentials
- [x] No SQL injection (no query changes)
- [x] Input validation (ALLOWED_PERMISSION_KEYS rejects unknown keys)
- [x] Lockout safeguard (SUPER_ADMIN cannot be removed from revert_approval)
- [x] Backend guard (403 on unauthorized revert)
- [x] Defense in depth (frontend gate + backend gate)

---

## Recommendation

**APPROVE** after fixing the MEDIUM test issue. The production code is correct and safe; only the test needs adjustment.

### Next Steps
1. Fix `backend/tests/test_permissions.py:37` (remove or wrap in pytest.raises)
2. Re-run backend tests in CI (Python 3.13 environment)
3. Create PR
