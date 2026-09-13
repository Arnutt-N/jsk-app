# Plan Review: feature-line-audit-fix-map (Round 4, prp-validate-plan gate)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md` (2869 lines, commit `5903718`)
**Reviewed**: 2026-09-13
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Findings input (B7)**: `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review.md` (3 round-3 Criticals)
**Review Mode**: dual
**Verdict**: NOT READY
**Confidence Score**: 7/10 — single-pass implementation

Lineage: round-3 NOT READY (6/10, C1/C5/C8) → 3 criticals fixed (`32f7abe`) → this round-4 gate.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only | FAIL | 1 |
| B | context isolation only | FAIL | 1 |

Both reviewers PASS all 13 criteria except B6, and agree B7: all three round-3
criticals are genuinely fixed (C1 route+keys, C5 rid, C8 403/409 contract + race test).

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1–A6 | all | PASS | PASS | Anchors real, steps executable, commands exist, UX/waves documented |
| B1–B5 | all | PASS | PASS | 43 stories mapped, 1 def/task, single head `t1u2v3w4x5y6`, NOT Building + risks present |
| B6 | Testability | FAIL | FAIL | C1 asserts `first <= 5` (plan:792) but prescribed Step 3 issues ≥11 data statements |
| B7 | Finding Coverage | PASS | PASS | 3/3 round-3 criticals mapped with fixes verified in repo |

## 🔴 Critical (must fix before implementing)

1. **C1 query-budget assertion unreachable** (plan:792). Owner recount:
   `get_kpi_trends` 4 (`db.scalar` ×1 + `db.execute` ×3) + `get_session_volume` 2 +
   `get_peak_hours_heatmap` 1 + `get_conversation_funnel` 3 scalars + new percentile 1
   = 11 data statements minimum, plus auth lookups — so `first <= 5` can never pass.
   Fix direction: drop the absolute budget; lock cache effectiveness instead
   (r2 must add zero queries — already asserted by `count == first`), since absolute
   counts on the shared app engine include ambient queries and are inherently fragile.

## 🟡 Important

None (all suggestions Minor).

## 🟢 Minor / Suggestions

- C5 fixture yields from inside `async with Session()` (holds one session across the test) — move yield outside the block.
- `query_counter` on the shared engine counts ambient queries + needs Redis online — prefer fixture-local counting or reset after setup.
- C8 presence test hard-requires live Redis — document the infra prerequisite in the task.

## Reviewer Disagreements

None (both FAIL on B6 only, same root cause; statement counts differ 13 vs 9 but both > 5).

## Recommended Next Step

Revise (fix the C1 budget assertion per above) and re-run prp-validate-plan.

## Scoring

`10 − 2×(0) − 1×(B6) − 1×(0) = 9`, consensus FAIL caps at 7 → **7/10**.
Band 6–7 → NOT READY / REVISE.
