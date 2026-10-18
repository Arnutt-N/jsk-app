# PRD: Shared LIFF step card (piece 4 of 4)

## Problem
Booking owns a local Section card with semantic tokens. Debt-mediation and service-request inline the same card shape with hard-coded gray colors. Three copies of one container.

## Goal
One LiffStepCard in `frontend/components/liff/`. All three form cards use it. Semantic tokens everywhere.

## Data shape
A titled card: icon, title, children, optional className, optional header action. Booking Section verbatim as the canonical shape. No state inside.

## Deliberate visual normalization
Debt and service headers move from hard-coded gray to the shared tokens. Their step icons gain the shared tertiary wrapper. Layout and copy unchanged. Human screenshot compare after merge because tokens render per theme.

## Scope
Replace booking Section and its call sites, the debt form card, the service form card. Success screens and confirm modals stay untouched.

## Non-goals
Anything outside the three form cards. Token system changes.

## Guards
All three page suites pass unmodified.

## Verification
Page suites plus a component test. Typecheck. Lint. CI green. Human phone and screenshot check after merge.
