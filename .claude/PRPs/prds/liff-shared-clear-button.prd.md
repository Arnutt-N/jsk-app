# PRD: Shared LIFF clear button (piece 2 of 4)

## Problem
Three LIFF form pages each own a private clear button. Debt-mediation and service-request inline identical ghost buttons with hard-coded gray colors. Booking owns SectionClearButton with toast feedback and semantic tokens. Three copies of one control.

## Goal
One LiffClearButton in `frontend/components/liff/`. All three pages use it. One look, one feedback, semantic tokens everywhere.

## Data shape
A pure control: an action plus an optional label. The button fires the action and nothing else. Feedback stays page-owned exactly as today: booking toasts in its four clear handlers, service-request toasts in its clearStep, debt-mediation stays silent. No page changes behavior.

## Deliberate changes
None. Every page keeps its exact current feedback. The shared unit carries no toast dependency, so no page gains a provider requirement it did not have.

## Scope
Replace booking SectionClearButton (four call sites), the debt inline button, the service inline button. Hard-coded gray classes on the two inline copies retire with them.

## Non-goals
Pieces 3 and 4. Clear-handler logic itself (what each page clears stays untouched).

## Guards
Debt and service-request suites pass unmodified. Booking suite passes unmodified. Typecheck and lint on touched files green.

## Verification
Page suites for the three pages. Typecheck. Lint. CI green. Human phone check after merge.
