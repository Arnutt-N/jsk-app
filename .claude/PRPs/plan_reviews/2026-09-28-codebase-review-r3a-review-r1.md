# Plan Review: 2026-09-28-codebase-review-r3a (GATE LOOP 1)

**Plan**: `.claude/PRPs/plans/2026-09-28-codebase-review-r3a.plan.md`
**Reviewed**: 2026-09-28
**Source PRD**: `.claude/PRPs/prds/2026-09-28-codebase-review-r3a.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 2/10 — single-pass implementation (arithmetic; see note)

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only (same model) | FAIL | 3 |
| B | context isolation only (same model) | FAIL | 3 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | coverage map + 18 file entries + dep order |
| A2 | Implementation Readiness | FAIL | FAIL | T9 "read the full def at implement"; T5 mocks wrong/fields unnamed; strategy "(read first)" |
| A3 | Pattern Faithfulness | PASS | FAIL | B: "move VERBATIM from media.py:59-82" — def is L59-68, L70+ is limiter/schema |
| A4 | Validation Coverage | PASS | PASS | pytest/vitest/eslint/build commands exist |
| A5 | UX Clarity | PASS | PASS | before/after block present |
| A6 | No Prior Knowledge | FAIL | FAIL | stranger cannot write T5 (mocks/fields unpinned) |
| B1 | Spec Coverage | PASS | PASS | 18/18 Batch-A findings mapped |
| B2 | Internal Consistency | PASS | PASS | names/types/files match across tasks |
| B3 | Technical Soundness | FAIL | PASS | A: T18 "pinned tag kills supply chain" false — install.sh fetches latest binary |
| B4 | Scope Discipline | PASS | PASS | NOT Building respected |
| B5 | Risk Coverage | PASS | PASS | risks/mitigations present |
| B6 | Testability | PASS | PASS | input/expected pairs per task |
| B7 | Finding Coverage | PASS | FAIL | B: tasks lack stated root cause + regression risk lines |

## 🔴 Critical (must fix before implementing)
- T9 verbatim range wrong (`media.py:59-82` quoted, def is L59-68) — plan section T9; both the range and the "read at implement" note. (B; gate owner verified firsthand.)
- T1 test call missing db/user args + wrong arg order in prose — plan section T1; true signature `(db, booking, user)`. (A+B; verified firsthand.)
- T18 supply-chain claim false (pinned installer still fetches latest binary) — plan section T18. (A; verified by reasoning over installer behavior.)
- T5 mocks/fields unpinned (location-cascade shape, step field names, provinces source) — plan section T5. (A; verified firsthand.)
- B7: no per-task root-cause/regression-risk lines — all tasks. (B; rubric requirement.)

## 🟡 Important (should fix)
- T18 pin evidence uncited (reviewers cannot re-verify the tag off-plan). (B "pin unverified".)
- Testing Strategy "(read first)" forces discovery. (B.)

## 🟢 Minor / Suggestions
- Paste true L59-68 lines (done in revision). (B.)
- Add Cause/Risk one-liners per task (done in revision). (B.)
- Spell T5 mocks (done in revision). (A.)

## Reviewer Disagreements
- A3: A PASS / B FAIL — B correct (range verified wrong firsthand).
- B3: A FAIL / B PASS — A correct (installer behavior verified by reasoning).
- B7: A PASS / B FAIL — B correct (rubric explicitly requires per-task lines).

## Score Note
Arithmetic: 10 − 2×3 (A2,A3,A6) − 1×2 (B3,B7) = 2/10 → formula says RE-PLAN.
Gate-owner judgment: all 5 failures are localized pins (T1/T5/T9/T18/B7-lines),
not foundation flaws — 12 of 18 tasks untouched by any finding. Following the
parent skill's revise path (NOT READY → revise → re-run, loop 1/3) instead of
re-planning. All 6 fixes applied and firsthand-verified; see revision list below.

## Revision Applied (loop 1 → re-gate)
1. T1 VALIDATE: true `(db, booking, user)` signature, namespaced patch targets,
   5-attr booking namespace with date/time objects (formatters verified).
2. T5 VALIDATE: full rewrite — spelled mocks (THAI-keyed District/SubDistrict),
   provinces fetch stub, verified field names/combobox order, `options[1].value`
   picking, `ถัดไป` button (verified L895-904), step markers.
3. T9 step 1: true L59-68 def pasted verbatim; "read at implement" removed.
4. T18: rewritten to pinned tarball + checksums + layout-proof extract, with
   gh-api verification cited and re-verifiable.
5. All 18 tasks: Root cause + Regression risk one-liners (B7).
6. Testing Strategy: "(read first)" replaced with pinned-style pointer.

## Recommended Next Step
revise and re-validate (done — re-running gate now, loop 2/3 budget remaining: 2)
