# Plan Review: 2026-10-13-liff-booking-unity (round 2, REV 1 plan)

**Plan**: `.claude/PRPs/plans/2026-10-13-liff-booking-unity.plan.md`
**Reviewed**: 2026-10-13
**Source PRD**: `.claude/PRPs/prds/2026-10-13-liff-booking-unity.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation (mechanical; see note below)

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | muse-spark-1.3 (parent model) | FAIL | 3 |
| B | context isolation only (no second provider key available) | FAIL | 1 |

Progress vs round 1: 19 of 24 checks now PASS (A 8/12, B 11/12). All 7 round-1 findings
are closed. One new substantive defect + three doc nits remain.

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | "Files to Change table + Context section"; `logger.error+setError+Alert` verified at booking/page.tsx:391 |
| A2 | Implementation Readiness | FAIL | PASS | A: "Task 5 has only Steps 1-3, no ACTION/IMPLEMENT/MIRROR/VALIDATE headers" |
| A3 | Pattern Faithfulness | PASS | PASS | 10+ SOURCE refs spot-checked live (debt :378/:434, picker :51/:243-244, lib/booking.ts:87-91, booking :79/:407) |
| A4 | Validation Coverage | PASS | PASS | tsc/eslint/vitest/build all map to installed tooling + existing configs |
| A5 | UX Clarity | PASS | PASS | Before/After table per surface + explicit N/A line |
| A6 | No Prior Knowledge Test | FAIL | PASS | A: picker `toISOString` emit format "stated nowhere in the plan" |
| B1 | Spec Coverage | PASS | PASS | AC1-AC7 all traced to tasks |
| B2 | Internal Consistency | FAIL | PASS | A: Task 4 raw handoff contradicts the YYYY-MM-DD state invariant |
| B3 | Technical Soundness | FAIL | FAIL | Picker emits full datetimes (:173/:292/:625) into date-only state — strip equality, slot loading, submit payload break |
| B4 | Scope Discipline | PASS | PASS | NOT Building section present; tasks stay in scope |
| B5 | Risk Coverage | PASS | PASS | R1-R5 with mitigations + per-task GOTCHA |
| B6 | Testability | PASS | PASS | P1-P6/B1-B5 input/expected + 16-item edge checklist |

## 🔴 Critical (must fix before implementing)

- Picker→booking date handoff is unsound (B3, BOTH reviewers independently).
  `CalendarPickerTH` emits full ISO datetimes via `toISOString()` at three points —
  `validateAndUpdate` :173, day-cell click :292, `วันนี้` button :625 (all verified by
  grep this session). Task 4 wires that output raw into `chooseDate`/`selectedDate`,
  which is `YYYY-MM-DD`. Implemented literally: strip equality
  `selectedDate === date` (booking/page.tsx:625) never matches, `parseISODate`
  (`split('-')`/Number) yields NaN on datetime strings breaking slot loading, and
  `booking_date: selectedDate` (:385) sends a datetime to a date field. No
  normalization step exists anywhere in the plan. Testing Strategy B2
  (picker→strip sync) cannot pass as written, and P3 misstates existing behavior
  ("ISO day 2024-01-15" — existing behavior emits full `toISOString()`, as the
  current picker test itself asserts via `new Date(iso)` parts).
- Fix direction (for the reviser, not the implementer): normalize at the Task 4
  boundary to a local YYYY-MM-DD day (e.g. via the documented `toISODate` path),
  disclose the picker's `toISOString` emit format with SOURCE refs (:173/:292/:625),
  rewrite P3 to assert the exact post-fix emission, and add a row asserting the
  `booking_date` payload stays YYYY-MM-DD after a picker selection.

## 🟡 Important (should fix)

- Task 5 lacks ACTION/IMPLEMENT/MIRROR/VALIDATE headers (A2, A only) — either add
  them or scope the four-section rule to implementation tasks.
- PRD says "one optional prop" but the plan specifies three
  (`isDateDisabled`/`minDate`/`maxDate`) — reconcile wording so it is not flagged as
  scope drift.
- STEPS type extension (`{key, label}` → plus `icon`) not spelled out — a newcomer
  must change the type, not just append a property.

## 🟢 Minor / Suggestions

- Badge variants SOURCE ref `Badge.tsx:44-54` is imprecise (points at compound
  variants); the variant definitions live above it. Harmless.

## Reviewer Disagreements

- A2, A6, B2: A FAIL vs B PASS. A holds Task 5 to the four-section format and holds
  the undisclosed emit format against readiness/consistency; B passed those axes.
  All three collapse into the Critical handoff defect + the Task 5 nit above — no
  independent substance beyond them.

## Score note (why 1/10 misleads)

Mechanical score: 10 − 2×(A2,A6) − 1×(B2,B3) − 1×(3 Important) = 1 (floored).
A single root cause (the handoff format) trips four criteria at once, so the
arithmetic multi-counts one defect. Substance: 19/24 checks pass, both reviewers
agree the ONLY technical defect is the normalization gap with a known fix. The
foundation (approach, scope, coverage, risks, tests) holds on both reviewers.

## Recommended Next Step

Revise and re-validate (targeted REV 2: normalize the Task 4 handoff + three doc
nits above), then re-run prp-validate-plan — NOT a full re-plan; the plan's
direction is sound and the fix is crisp.
