# Plan: Shared LIFF clear button (piece 2 of 4)

Branch: `feat/liff-shared-clear-button` from main. One PR. Behavior-preserving except the debt toast named in the PRD.

## Phase 1. Shared button plus direct test
- Create `frontend/components/liff/LiffClearButton.tsx`. Props object: onClear plus optional label defaulting to the shared text. Renders the ghost small button with reset icon and semantic token classes. Fires onClear then toasts the shared cleared message.
- Add `frontend/components/liff/__tests__/LiffClearButton.test.tsx`. Cases: renders the label, fires the action on click, custom label renders.
- Evidence: new files plus green run.

## Phase 2. Migrate three pages
- Booking: delete SectionClearButton, swap its four call sites to LiffClearButton with the same onClear handlers.
- Debt-mediation: swap the inline header button. Service-request: same swap.
- Run all three page suites plus the service-request suites unmodified.
- Evidence: deleted lines plus green unmodified suites.

## Phase 3. Ship
- Run deslop before commit, no-comments before review.
- Typecheck, lint on touched files, full frontend suite spot on the three pages. Open the PR. Babysit to green.
- Evidence: PR link plus CI status.
