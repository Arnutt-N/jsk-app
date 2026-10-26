# Plan Review: PRP-admin-p1-fixes

**Skill**: `prp-validate-plan` v2.0.0 (2026-10-25)
**Plan**: docs/PRP-admin-p1-fixes.md
**Reviewed**: 2026-10-25
**Source PRD**: docs/PRD-admin-p1-fixes.md
**Findings Input**: "none"
**Review Mode**: dual
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues | Important issues |
|---|---|---|---|---|
| A | general-purpose, context isolation only | FAIL | 5 | 4 |
| B | general-purpose, context isolation only | FAIL | 4 | 4 |

Diversity achieved: context isolation only (same agent type; reviewers ran without shared context).

## Rubric Results

| # | Criterion | A | B | Aggregate | Evidence |
|---|---|---|---|---|---|
| A1 | Context Completeness | FAIL | FAIL | FAIL | No error-handling/logging/test-pattern sections with real examples; Tasks 3/5/7 name no concrete spec |
| A2 | Implementation Readiness | FAIL | FAIL | FAIL | Zero import paths; Task 4 prop left open as "(เช่น dismissDisabled)"; Task 7 Run cites unnamed "e2e session spec" |
| A3 | Pattern Faithfulness | PASS | PASS | PASS | 6–7 file:line refs spot-checked against repo, all resolve (layout 404-429, 224, 153-157; ConfirmDialog 65; Modal Escape; requests 116-171/211-226; SessionTimeoutWarning 20-28; layout 275) |
| A4 | Validation Coverage | FAIL | FAIL | FAIL | `npm run build` exists in frontend/package.json but no task specifies it |
| A5 | UX Clarity | PASS | PASS | PASS | Each task pairs Step 1 Failing check (before) with Step 3 Verify (after) |
| A6 | No Prior Knowledge Test | FAIL | FAIL | FAIL | Task 7 onClose→extendSession mapping missing; Task 8 abort-error suppression missing; import/prop signatures undisclosed |
| B1 | Spec Coverage | PASS | PASS | PASS | PRD 8 items (R1–R8) + D1/D2 map 1:1 to Tasks 1–8 |
| B2 | Internal Consistency | PASS | FAIL | FAIL | Task 7 Files omits required layout.tsx:275 edit; pending-dismiss name undecided yet claimed consistent in Self-Review |
| B3 | Technical Soundness | PASS | PASS | PASS | Event, dialogs, AbortController+sequence-guard, inert all verified real; no invented APIs |
| B4 | Scope Discipline | PASS | FAIL | FAIL | No explicit NOT Building section; PRD §8 P2 items not restated as plan boundaries |
| B5 | Risk Coverage | FAIL | FAIL | FAIL | No Risks section; abort-error flash, onClose mapping, focus-trap, AGENT guard pitfalls unmitigated |
| B6 | Testability | FAIL | FAIL | FAIL | No Testing Strategy with input/expected pairs; Tasks 3/5/7 allow manual-only fallbacks |
| B7 | Finding Coverage | SKIPPED | SKIPPED | SKIPPED | No findings input supplied |

## 🔴 Critical (must fix before implementing)

- Pending-dismiss contract undecided (`(เช่น dismissDisabled)`) while Self-Review claims consistency — Tasks 4/5/7 depend on it; evidence: PRP Task 4 Step 2 vs Self-Review type-consistency line
- Task 7 Files omits the required `layout.tsx:275` live-chat early-return edit, so the D2 half can be missed or break the bare-children branch
- Missing import paths and undisclosed signatures (`LogoutConfirmDialog` isOpen/onClose/onConfirm; `useSessionTimeout` showWarning/remainingTime/extendSession; `Modal` props) force codebase searching — plan not self-sufficient
- No build gate: plan never runs the existing `next build`, so a Modal prop rename or `inert` typing break passes the plan yet breaks production
- Task 8 abort handling: `apiFetch` catch path resolves `ok:false` on abort, so cancelled keystroke fetches will flash fetch-error UI unless explicitly filtered
- Task 7 never specifies Modal `onClose` must trigger `extendSession`; as written, Escape silently dismisses the session warning without extending the session
- No Testing Strategy with input/expected pairs or edge-case checklist; three tasks accept manual checklists, so regressions are unverifiable

## 🟡 Important (should fix)

- No error-handling/logging/test-pattern conventions with real examples (apiFetch discriminated-union + toast + logger pattern undocumented)
- No explicit out-of-scope / NOT Building section restating PRD §8 P2 items and measurement exclusions
- No risks/mitigations section for focus-trap, abort/debounce/pagination, AGENT guard, error-path reset pitfalls
- Title says "7 ข้อ" but body enumerates 8 issues and 8 tasks — relabel to 8
- Vague test targets ("e2e logout (ถ้ามี)", "e2e/lint", unnamed session spec) — name the spec files explicitly

## 🟢 Minor / Suggestions

- Name exact commands per task (`npm run test:unit -- pending-dismiss`, `npm run test:e2e -- net-race`) and add `npm run build` to Task 4 and Task 7
- Freeze one Modal prop name in a single Interfaces block consumed by Tasks 4/5/7
- Add a short risks/mitigations + input-expected/edge-case test table

## Reviewer Disagreements

- B2: A PASS vs B FAIL — A treated the "7 vs 8" slip and Task 7 file omission as cosmetic; B treated the Task 7 Files-vs-steps mismatch and undecided-yet-claimed-consistent contract as a genuine inconsistency. Aggregate: FAIL (a split criterion still fails).
- B4: A PASS vs B FAIL — A accepted Global Constraints as scope guards; B required an explicit NOT Building section in the plan itself. Aggregate: FAIL.

## Recommended Next Step

revise and re-run prp-validate-plan — add the missing contracts, signatures, build gate, risks, and test-strategy sections, then re-validate before implementing.
