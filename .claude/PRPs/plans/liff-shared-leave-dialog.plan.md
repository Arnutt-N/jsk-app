# Plan: Shared LIFF leave flow (piece 1 of 4)

Branch: `feat/liff-shared-leave-dialog` from main. One PR. Behavior-preserving except the unified dialog wording named in the PRD.

## Phase 1. Hook plus dialog plus hook test
- Create `frontend/hooks/useLiffLeave.ts`. Object argument. Holds open state. Exposes request, cancel, confirm transitions. Confirm runs the leave action: close LIFF window in client, home route outside. Unknown LIFF globals stay unknown, narrowed once at the boundary.
- Create `frontend/components/liff/LeaveConfirmDialog.tsx`. Thin wrapper over ConfirmDialog. Props: open flag, client flag, close, confirm. Unified wording from the PRD. No new chrome.
- Add `frontend/hooks/__tests__/useLiffLeave.test.tsx`. Cases: confirm closes window in client, navigates home outside, cancel keeps state, closed start.
- Evidence: new files plus green test run.

## Phase 2. Migrate the identical copies
- Debt-mediation: replace private modal and local leave handlers with the hook plus dialog. Delete the copied JSX.
- Service-request: same replacement.
- Run both page suites unmodified. Any failure is a defect in the shared unit, not a test to edit.
- Evidence: deleted lines plus unmodified green suites.

## Phase 3. Migrate booking wording
- Booking: replace its ConfirmDialog props with LeaveConfirmDialog. Keep the post-cancel notice text.
- Update booking dialog-wording assertions intentionally (title, confirm, back labels). Nothing else in the test file changes.
- Evidence: green booking suite plus diff of test edits limited to wording lines.

## Phase 4. Ship
- Remove the stray tooling reminder line at the end of ConfirmDialog.tsx.
- Run deslop before commit, no-comments before review.
- Full frontend suite, typecheck, lint on touched files. Open the PR from the branch. Babysit to green.
- Evidence: PR link plus CI status.
