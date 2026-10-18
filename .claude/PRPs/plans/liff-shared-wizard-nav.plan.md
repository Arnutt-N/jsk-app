# Plan: Shared LIFF wizard nav (piece 3 of 4)

Branch: `feat/liff-shared-wizard-nav` from main. One PR. Behavior-preserving.

## Phase 1. Shared nav plus direct test
- Create `frontend/components/liff/LiffWizardNav.tsx`. Props object: onCancel, optional cancelLabel, optional back, next, submit slots. Renders the row plus the red ghost cancel row in booking styling.
- Add `frontend/components/liff/__tests__/LiffWizardNav.test.tsx`. Cases: back absent when omitted, next and submit render with handlers, cancel always renders and fires.
- Evidence: new files plus green run.

## Phase 2. Migrate three pages
- Booking: delete WizardNav, rewrite four call sites with explicit slots.
- Debt-mediation and service-request: swap inner rows, keep outer container and note.
- Run all three page suites unmodified.
- Evidence: deleted lines plus green unmodified suites.

## Phase 3. Ship
- Run deslop before commit, no-comments before review.
- Typecheck, lint on touched files. Open the PR. Babysit to green.
- Evidence: PR link plus CI status.
