# PRD: Shared LIFF wizard nav (piece 3 of 4)

## Problem
Three LIFF form pages each own a private nav row. Debt-mediation and service-request inline identical back, next, submit, and cancel buttons. Booking owns WizardNav used at four steps. Four copies of one control across three files.

## Goal
One LiffWizardNav in `frontend/components/liff/`. All three pages use it. Same buttons, same order, same look.

## Data shape
A nav row plus a cancel row. Required cancel action. Optional back, next, and submit slots, each a label plus handler plus optional disabled flag. Slot presence is explicit at each call site. No step enum inside. Follows the ConfirmDialog precedent for optional slot props.

## Scope
Replace booking WizardNav and its four call sites with explicit slots. Replace the debt and service inline rows, keeping their outer container and privacy note page-owned. Submit handlers stay page-side.

## Non-goals
Piece 4. Submit validation logic. Step state.

## Guards
All three page suites pass unmodified. Button names, order, and handlers identical.

## Verification
Page suites for the three pages plus a component test. Typecheck. Lint. CI green. Human phone check after merge.
