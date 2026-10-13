# Plan Review: flaky-frontend-timeouts (round 2)

**Plan**: `.claude/PRPs/plans/2026-10-05-flaky-frontend-timeouts.plan.md`
**Reviewed**: 2026-10-05
**Source PRD**: `.claude/PRPs/prds/2026-10-05-flaky-frontend-timeouts.prd.md`
**Verdict**: NOT READY
**Confidence Score**: 1/10 — single-pass implementation (formula floor; see note)

Score note: union semantics (a FAIL from either reviewer fails the
criterion, per "splits are still findings"): Group A failed = 3 (A1, A4,
A6) → −6; Group B failed = 2 (B2, B5) → −2; 🟡 = 2 → −2; raw −0 → floor 1.
Progress vs round 1 (11 failed criteria → 5; reviewer A now passes 11/12)
is real but the floor destroys discrimination — read the failed-criteria
count, not just the score.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | general-purpose | FAIL | 3 (1 criterion: B5) |
| B | general-purpose ("context isolation only") | FAIL | 4 (5 criteria: A1, A4, A6, B2, B5) |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | FAIL | B: G1.2 "only two scrollTo suites (verified by grep)" omits 3 real files |
| A2 | Implementation Readiness | PASS | PASS | All tasks carry ACTION/IMPLEMENT/MIRROR/VALIDATE + exact edits |
| A3 | Pattern Faithfulness | PASS | PASS | 8 (A) + 6 (B) SOURCE refs spot-checked byte-exact, incl. Thai-string snippet |
| A4 | Validation Coverage | PASS | FAIL | B: S5 proof gate non-executable (placeholder paths, unnamed matcher) |
| A5 | UX Clarity | PASS | PASS | Literal "N/A — internal change" + quantified thresholds |
| A6 | No Prior Knowledge | PASS | FAIL | B: S5 not copy-paste runnable; false counts trip sanity checks |
| B1 | Spec Coverage | PASS | PASS | R1–R6 + G3 + non-goals all mapped |
| B2 | Internal Consistency | PASS | FAIL | B: "8 call sites" vs 9 real; S5 unanchored diff vs per-task commits |
| B3 | Technical Soundness | PASS | PASS | setConfig/isolate/delay:0 verified; fireEvent equivalence grounded |
| B4 | Scope Discipline | PASS | PASS | Explicit NOT Building (5 items); tasks in scope |
| B5 | Risk Coverage | FAIL | FAIL | RISK-3/G1.2 premise false (2 vs 5 files) → Task 1 omits 3 suites |
| B6 | Testability | PASS | PASS | 12-item edge checklist verified against real expects + ×3 gates |

Gate-verified repo facts (read-only):
- `scrollTo` test files = 5 (reviewers right): the 3 service-request suites
  all use overwrite-compatible `window.scrollTo = vi.fn();` (upload-retry:48,
  service-request validation:61, service-request-single validation:67).
- `fillStep2(` call sites = 9 (reviewers right): 107,153,182,206,253,277,320,
  345,389 (line 51 is the definition). Plan says 8.
- `vitest.setup.ts` = 10 lines (plan says "1–9", reviewers said "1–11" —
  BOTH wrong; truth is 10).

## 🔴 Critical (must fix before implementing)

- False blast-radius premise: "only two scrollTo suites (verified by grep)"
  in G1.2/RISK-3 — 5 exist; Task 1 VALIDATE must run all 5, not 2 (A1/B5;
    both reviewers; gate-verified).
- False count: "all 8 call sites" for `fillStep2` in G2.1 — 9 actual
  (B2; reviewer B; gate-verified).
- S5 assertion-untouched proof is non-executable (`<2 test files>`
  placeholder, unnamed matcher) AND vacuous post-commit (unanchored
  `git diff` after the plan's own 3 commits shows nothing — S5 cannot
  fail as specified) (A4/A6/B2; reviewer B; logically confirmed).

## 🟡 Important (should fix)

- Wrong file span: setup.ts "current lines 1–9" — truth is 10 lines
  (reviewers' "1–11" also wrong; use 1–10).
- Task 0 MIRROR cites ephemeral `%TEMP%\vitest-*.log` no other dev can
  access — cite the committed evidence doc
  (`project-log-md/muse_code/session-summary-20261004-2340.md`) instead.

## 🟢 Minor / Suggestions

- Reword RISK-3/G1.2 to "five scrollTo-adjacent suites, all
  overwrite-compatible" with the 5-file VALIDATE command.
- Replace S5 with an exact runnable gate, e.g.
  `git diff main...HEAD -U0 -- <two real paths> | Select-String '^[+-].*expect\('`
  expecting no output (anchored to the merge-base so per-task commits
  don't void it).

## Reviewer Disagreements

- A1/A4/A6/B2: A PASS vs B FAIL. B correct on all four — each traces to
  one of the three verified findings above (scrollTo omission, S5
  non-runnable/vacuous, 8-vs-9 count).
- Setup line span: plan "1–9" vs reviewers "1–11" — gate adjudicates both
  wrong; truth is 10 lines.

## Recommended Next Step

revise and re-validate — with an explicit note that this deviates from
the <6 band's "re-plan" label: the band rationale ("foundation is off")
is factually inapplicable (both reviewers unanimously pass approach
soundness B3, spec coverage B1, PRP format A2, pattern faithfulness A3,
and scope B4). All 5 failures are narrow factual/doc fixes on a
validated foundation; discarding the plan would waste verified work.
Fix the 3 🔴 + 2 🟡, then re-run prp-validate-plan (round 3).
