# PRD — Logout confirmation dialog

> **Status**: READY · **Date**: 2026-09-06 · **Branch**: `feat/logout-confirm-dialog`
> **Source**: user feedback — pressing ออกจากระบบ logs out immediately (spinner → /login) with
> no confirmation; accidental clicks are easy in a dropdown.

## Problem / Solution

User-initiated logout fires instantly from three surfaces (header profile menu, Ctrl+K command
palette, live-chat profile dropdown). Add a confirmation dialog (ยืนยัน / ยกเลิก) before logging
out, using the existing `ConfirmDialog` component with `variant="warning"`.

## User Stories

1. As an admin, I want a confirmation before logging out, so that a stray click in the menu does not end my session.
2. As an admin, I want ยกเลิก to close the dialog and keep me logged in, so that the dialog is safe to open.
3. As an operator using Ctrl+K or the live-chat console, I want the same confirmation, so that behaviour is consistent everywhere.
4. As a user whose session expires, I want the forced logout to stay automatic (no dialog), so that security is not weakened — the dialog is only for user-initiated logout.

## Implementation Decisions

1. New shared `frontend/components/admin/LogoutConfirmDialog.tsx` (wraps `ConfirmDialog` with fixed Thai copy: title "ต้องการออกจากระบบหรือไม่?", description, default ยืนยัน/ยกเลิก buttons, variant warning) — one copy of the wording across all three surfaces.
2. Each surface owns a `confirmingLogout` state; the trigger button opens the dialog instead of calling `logout()` directly; the dialog renders OUTSIDE the dropdown's `{open && ...}` block so closing the menu does not unmount it.
3. System-initiated logouts (`jsk:auth-expired`, session timeout, cross-tab broadcasts) keep their current immediate behaviour — no dialog.
4. Frontend-only; no API change; the `logout()` logic itself untouched.

## Testing Decisions

- New `UserMenu` unit tests (no tests exist for these components): opening the menu and pressing ออกจากระบบ shows the dialog WITHOUT calling logout; ยกเลิก closes it and still no logout; ยืนยัน calls logout exactly once.
- E2E `cookie-auth.spec.ts` logout test updated to press ยืนยัน in the dialog before asserting redirect + cookie clearing (it currently clicks the menu item and expects an immediate bounce).
- Prior art: ConfirmDialog usage in auto-replies/canned-responses/broadcast pages.

## Out of Scope

- Styling changes to ConfirmDialog; logout spinner behaviour; session-timeout flow.
