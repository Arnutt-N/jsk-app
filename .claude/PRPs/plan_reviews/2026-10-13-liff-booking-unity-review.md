# Plan Review: 2026-10-13-liff-booking-unity

**Plan**: `.claude/PRPs/plans/2026-10-13-liff-booking-unity.plan.md`
**Reviewed**: 2026-10-13
**Source PRD**: `.claude/PRPs/prds/2026-10-13-liff-booking-unity.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | muse-spark-1.3 (parent model) | FAIL | 5 |
| B | context isolation only (sonnet dispatch failed: no provider key; retried on parent model) | FAIL | 6 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | "no naming/error-handling/logging/test-pattern examples; grep plan for import = 0" |
| A2 | Implementation Readiness | FAIL | FAIL | "not a PRP-format plan — no ACTION/IMPLEMENT/MIRROR/VALIDATE blocks and no import paths" |
| A3 | Pattern Faithfulness | PASS | PASS | Verified repo refs: booking `StepRail` page.tsx:60-88, `Section` ~98-115, header ~460-464; debt sticky bar :378, stepper :406-429; `CalendarPickerTH` props L14-23 |
| A4 | Validation Coverage | PASS | PASS | `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npm run build` all exist via frontend/package.json scripts + installed devDeps |
| A5 | UX Clarity | FAIL | PASS | A: "grep plan for Before\|After\|N/A = 0"; B accepted E1 + task test-descriptions as before/after |
| A6 | No Prior Knowledge Test | FAIL | FAIL | "re-skin Section onto Card/… with zero import paths in the whole plan" |
| B1 | Spec Coverage | PASS | PASS | "AC1→Task 1, AC2→Task 1, AC3→Task 2, AC4→Task 4, AC5→Tasks 3+4, AC6→every task step 3, AC7→Task 5" |
| B2 | Internal Consistency | PASS | PASS | `isDateDisabled?: (isoDate: string) => boolean` identical in PRD scope + Task 3 + Task 4 |
| B3 | Technical Soundness | PASS | PASS | Verified `Card` exports at components/ui/Card.tsx:201; tokens exist; no invented APIs |
| B4 | Scope Discipline | FAIL | FAIL | "only Global constraints bullets, no explicit NOT Building / Out-of-scope section" |
| B5 | Risk Coverage | FAIL | FAIL | "grep plan for risk\|mitigat\|GOTCHA = 0; PRD risks not carried into any Risks section or task GOTCHA" |
| B6 | Testability | FAIL | FAIL | "no Testing Strategy section and no consolidated edge-case checklist" |

## 🔴 Critical (must fix before implementing)

- Not a PRP-format plan: no ACTION/IMPLEMENT/MIRROR/VALIDATE per task, zero import paths (A2/A6). Evidence: Task 2 "re-skin Section onto Card/CardHeader/CardTitle/CardContent" with no import path; `Card` lives at `frontend/components/ui/Card.tsx:201` (verified).
- False state-ownership claim: plan says `chooseDate` "stays the only writer" of the selected date, but `setSelectedDate` is also called directly at `liff/booking/page.tsx:370` (`chooseService`) and `:407` (`resetFlow`), state defined at `:203`, `chooseDate` defined at `:344` — not `:367-375` as E5 claims (stale span). Evidence: `grep -n "chooseDate\|setSelectedDate" frontend/app/liff/booking/page.tsx`.
- Month-navigation clamp ownership ambiguous: PRD requires the picker to clamp when the prop is provided; Task 3 Implement omits clamping while Task 4 says "window = full dateOptions span" without saying where/how the picker enforces it.
- No Risks section and no GOTCHA fields despite known pitfalls: fully-unbookable visible month trap, async `rangeInfo` fail-open, DESIGN.md brand-500-as-text rule, typed-input bypass (B5).
- No explicit NOT Building / Out-of-scope section (B4); no Before/After or explicit N/A UX states (A5, disputed).
- No Testing Strategy with input/expected pairs + edge-case checklist: blackout/closed/full/out-of-window/unknown-range, strip↔picker both directions, keyboard, typed entry, dark mode (B6).
- Missing context completeness: no naming, error-handling (`logger.error`/`Alert`), logging, or test-file (`__tests__` colocated) patterns with real codebase examples; no dependency list (A1).

## 🟡 Important (should fix)

- None separately classified — all merged findings block single-pass implementation and are listed as Critical above.

## 🟢 Minor / Suggestions

- Add exact import paths (`@/components/ui/Card`, `@/components/ui/CalendarPickerTH`, `@/lib/booking`) plus file:line spans for option buttons and `ContactFieldsForm`.
- Correct the only-writer claim to a single-state/multiple-resetters model: picker calls `chooseDate`; null-resets stay in `chooseService`/`resetFlow`.
- Assign month-clamp implementation explicitly (picker-internal `viewMonth` clamp vs caller-passed min/max props) with the full-`dateOptions`-span trap-avoidance rule.

## Reviewer Disagreements

- A5 (UX Clarity): A FAIL ("no before/after states, no N/A marker") vs B PASS (E1 evidence rows + Task 1 expected-test descriptions count as before/target states). Kept as a finding per protocol — the plan should add an explicit Before/After (or N/A) block to remove the ambiguity.

## Recommended Next Step

Re-plan: rewrite the plan into PRP format (ACTION/IMPLEMENT/MIRROR/VALIDATE per task, import paths, Risks+GOTCHA, explicit Out-of-scope, Testing Strategy with input/expected + edge cases) correcting the two factual errors above, then re-run prp-validate-plan. Technical substance (approach, scope, spec coverage) passed both reviewers, so this is a document-level rewrite of the same plan, not a change of direction.
