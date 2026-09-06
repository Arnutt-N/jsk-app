# Logout Confirmation Implementation Plan

**PRD:** `.claude/PRPs/prds/2026-09-06-logout-confirm.prd.md`

### Task 1: Shared dialog component
- [ ] Create `frontend/components/admin/LogoutConfirmDialog.tsx` (ConfirmDialog wrapper: title "ต้องการออกจากระบบหรือไม่?", description "คุณจะต้องเข้าสู่ระบบอีกครั้งเพื่อกลับเข้าใช้งานหลังบ้าน", variant="warning", default ยืนยัน/ยกเลิก).
- [ ] Commit: `feat(admin): shared logout confirmation dialog`

### Task 2: Wire the three surfaces
- [ ] `UserMenu.tsx` — `confirmingLogout` state; trigger opens dialog (menu closes); dialog rendered at component root (outside `{open && ...}`).
- [ ] `CommandPalette.tsx:205` — action opens dialog instead of `logout()`.
- [ ] `ProfileDropdown.tsx:137` — same as UserMenu.
- [ ] Commit: `feat(admin): confirm before user-initiated logout (menu, palette, live-chat)`

### Task 3: Tests
- [ ] `components/admin/__tests__/UserMenu.test.tsx` (new): menu → ออกจากระบบ → dialog, logout NOT called; ยกเลิก → closed, no logout; ยืนยัน → logout once. Mock `@/contexts/AuthContext` + `@/components/providers`.
- [ ] `cookie-auth.spec.ts` logout test: after the menu item, click `ยืนยัน` in the dialog; keep redirect+cookie assertions.
- [ ] Run: vitest (touched files), lint, build.
- [ ] Commit: `test(admin): logout confirmation coverage (unit + e2e)`

### Task 4: Validation + PR
- [ ] Full unit suite + lint + build; local E2E cookie-auth against prod build (logout flow directly touched).
- [ ] PR → CI 4/4 → squash-merge → CD watch (frontend scope) → handoff.
