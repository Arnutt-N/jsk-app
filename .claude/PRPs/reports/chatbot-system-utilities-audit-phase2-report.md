# Implementation Report: Phase 2 — Rename & Restructure

## Summary
Centralized all admin role display into a single source of truth (`frontend/lib/constants/roles.ts`), renamed `AGENT`'s display label from the ambiguous **"Staff"** to **"Operator"** (backend enum/DB untouched), renamed the sidebar group **"System Management" → "System and Utilities"**, added an **Image Resize** nav item + placeholder route, and de-magicked the `?role=AGENT` query string. Also closed a Phase-1 carryover: user-management role maps lacked `DIRECTOR`/`HEAD`, so those users rendered a blank badge.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Confidence | 9/10 | 9/10 — single-pass, no surprises |
| Files Changed | 10 (3 create, 7 update) | 9 (3 create, 6 update) — Task 7 intentionally skipped |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Create `lib/constants/roles.ts` | ✅ Complete | const-map + resolvers, mirrors `request-status.ts` |
| 2 | Unit-test the role map | ✅ Complete | 16 tests incl. "no role labeled Staff" regression guard |
| 3 | Refactor `users/page.tsx` role maps | ✅ Complete | +DIRECTOR/HEAD display/filter; create set unchanged |
| 4 | Refactor `users/[id]/page.tsx` role maps | ✅ Complete | edit-role select now represents all 6 roles |
| 5 | Centralize role render (UserMenu + ProfileDropdown) | ✅ Complete | `getRoleLabel` replaces raw `.toLowerCase().replace()` |
| 6 | De-magic `AssignModal` role query | ✅ Complete | `ROLE.AGENT`; wire value byte-identical (`?role=AGENT`) |
| 7 | Source permissions matrix labels from `roles.ts` | ⏭️ Skipped (deviation) | See Deviations |
| 8 | Rename sidebar group + add Image Resize item | ✅ Complete | `layout.tsx`; `Scaling` icon |
| 9 | Image Resize placeholder route | ✅ Complete | server component, no 404, full feature → Phase 5 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (`tsc --noEmit`) | ✅ Pass | Zero type errors (incl. `Object.fromEntries` tuple typing) |
| Lint (`eslint`, changed files) | ✅ Pass | 0 errors |
| Unit Tests (`vitest run`) | ✅ Pass | 102/102 (11 files); new `roles.test.ts` = 16 tests |
| Build | ⏭️ Deferred to CI | "Frontend Lint & Build" runs `tsc` + `next build` on push |
| Code Review (`ecc:code-reviewer`) | ✅ APPROVE | 0 CRITICAL/HIGH; 1 MEDIUM (Phase 3), 1 LOW (pre-existing) |

> Validation environment: frontend `npm ci` + `tsc`/`vitest`/`eslint` run in **WSL** (project convention). `node_modules` was absent (removed during a prior cross-platform reinstall) and was reinstalled cleanly.

## Files Changed

| File | Action |
|---|---|
| `frontend/lib/constants/roles.ts` | CREATED |
| `frontend/lib/constants/__tests__/roles.test.ts` | CREATED |
| `frontend/app/admin/image-resize/page.tsx` | CREATED |
| `frontend/app/admin/layout.tsx` | UPDATED (group title, Image Resize item, `Scaling` import) |
| `frontend/app/admin/users/page.tsx` | UPDATED (role maps from `roles.ts`) |
| `frontend/app/admin/users/[id]/page.tsx` | UPDATED (role maps from `roles.ts`) |
| `frontend/components/admin/UserMenu.tsx` | UPDATED (`getRoleLabel`) |
| `frontend/app/admin/live-chat/_components/ProfileDropdown.tsx` | UPDATED (`getRoleLabel`) |
| `frontend/components/admin/AssignModal.tsx` | UPDATED (`ROLE.AGENT`) |

## Deviations from Plan
- **Task 7 (permissions matrix labels) skipped — intentional.** `settings/permissions/page.tsx` already has all 6 roles with correct Thai labels and no "Staff" mislabel. Switching it to `getRoleLabelTh` would have changed the `SUPER_ADMIN`/`ADMIN` column headers from English ("Super Admin"/"Admin") to Thai ("ผู้ดูแลระบบสูงสุด"/"แอดมิน") — an unwanted visual change. Leaving it as-is is lower risk and still satisfies the phase goals. Net: 9 files instead of 10.

## Issues Encountered
- **`node_modules` absent** (frontend) — leftover from the earlier Windows↔WSL reinstall saga. Reinstalled via `npm ci` in WSL so native bindings (rollup/esbuild) match the Linux runtime used for `vitest`. Validation then ran clean.
- **`vitest` is not part of CI** (CI = Lint & Build, Pytest, Playwright, Encoding scan, Vercel). The new unit tests were therefore verified **locally** rather than relying on CI.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `frontend/lib/constants/__tests__/roles.test.ts` | 16 | `getRoleLabel` (rename, case-insensitive, unknown, nullish), `getRoleLabelTh`, `getRoleOptionLabel`, `getRoleBadgeVariant`, `isStaffRole`, regression guards (no "Staff" label, all 6 roles, `STAFF_ROLES` excludes USER) |

## Open Follow-ups (not blocking)
- **[MEDIUM]** `ROLE_OPTIONS` is constructed slightly differently in `users/page.tsx` (from `STAFF_ROLES`) vs `users/[id]/page.tsx` (hardcoded 6) — same result today; consolidate behind a shared helper when Phase 3 reworks the permissions/users UI.
- **[LOW]** Pre-existing: the left button in the Reset Password modal (`users/[id]/page.tsx`) is labeled "เปลี่ยนรหัสผ่าน" but acts as Cancel — not introduced by Phase 2.

## Next Steps
- [ ] Commit + push branch `feat/chatbot-sys-audit-phase2`
- [ ] Open PR; let CI (Lint & Build, Pytest, Playwright, Encoding, Vercel) go green
- [ ] Merge → proceed to **Phase 3 (Permissions v2, module-based)** per the PRD pipeline
