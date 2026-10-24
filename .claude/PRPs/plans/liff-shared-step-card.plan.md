# Plan: Shared LIFF step card (piece 4 of 4)

Branch: `feat/liff-shared-step-card` from main. One PR. Visual normalization named in the PRD, nothing else.

## Phase 1. Shared card plus direct test
- Create `frontend/components/liff/LiffStepCard.tsx`. Props object: icon, title, children, optional className, optional action. Booking Section markup verbatim.
- Add `frontend/components/liff/__tests__/LiffStepCard.test.tsx`. Cases: title and children render, action renders, custom className merges.
- Evidence: new files plus green run.

## Phase 2. Migrate three cards
- Booking: delete Section, swap its call sites.
- Debt-mediation and service-request: swap the form card, keeping title logic and clear action.
- Run all three page suites unmodified.
- Evidence: deleted lines plus green unmodified suites.

## Phase 3. Ship
- Run deslop before commit, no-comments before review.
- Typecheck, lint on touched files. Open the PR. Babysit to green.
- Evidence: PR link plus CI status.
