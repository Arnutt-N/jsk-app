# Plan Review: feature-line-audit-fix-map (Round 3, prp-validate-plan gate)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md` (2820 lines, 20 tasks A1–A3/B1–B2/C1–C8/D1–D7, commit `45d8e7e`)
**Reviewed**: 2026-09-13
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Findings input (B7)**: `.agents/PRPs/plan_reviews/feature-line-audit-fix-map-review-round2.md` (F1–F8)
**Review Mode**: dual
**Verdict**: NOT READY
**Confidence Score**: 6/10 — single-pass implementation

Lineage: round-1 dual FAIL (confidence 1/10) → plan revised → round-2 dual NEEDS-REVISION
(structural duplication) → plan revised (`45d8e7e`: stale copy deleted, D1–D7 rewritten,
F1–F8 addressed) → this round-3 gate.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only (model selection unavailable) | FAIL | 3 |
| B | context isolation only (model selection unavailable) | PASS | 0 |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | Per-task file:line anchors + patterns; cross-checks match |
| A2 | Implementation Readiness | PASS | PASS | Uniform 6-step TDD structure, import paths in all 20 tasks |
| A3 | Pattern Faithfulness | FAIL | PASS | Plan tests `GET /api/v1/analytics/dashboard` — repo has only `/api/v1/admin/analytics/dashboard` (`api.py:54` + `admin_analytics.py:67`); asserted keys `heatmap`/`generated_at`/`cache_hit` not in `get_dashboard` return (`analytics_service.py:444-451`: `trends`/`session_volume`/`peak_hours`/`funnel`/`percentiles` only) |
| A4 | Validation Coverage | PASS | PASS | `pytest.ini`, `package.json` scripts, `db_target.py` all exist |
| A5 | UX Clarity | PASS | PASS | Before/After per Wave (plan:2795-2800), N/A-internal marked |
| A6 | No Prior Knowledge | PASS | PASS | Full recipes in-plan; defects are wrong expectations, not missing context |
| B1 | Spec Coverage | PASS | PASS | Self-Review maps all 43 PRD stories; 1 explicit scope-out |
| B2 | Internal Consistency | FAIL | PASS | C8 test expects 409 but specified impl keeps `_require_active_session_owner` first, which raises 403 (`sessions.py:148-152`; `send_message` calls it at `messaging.py:29` before the guard) |
| B3 | Technical Soundness | PASS | PASS | 8+ refs exact; single head `t1u2v3w4x5y6` (owner recomputed: 52 revs/1 head) |
| B4 | Scope Discipline | PASS | PASS | NOT Building mirrors PRD out-of-scope |
| B5 | Risk Coverage | PASS | PASS | 6 risks with mitigations + GOTCHAs |
| B6 | Testability | FAIL | PASS | C5 `owned_request` teardown uses undefined `row_id` (fixture yields `Session, row.id`; cleanup refs `row_id` at plan:1325/1328) → NameError; C1 route/keys; C8 unreachable status |
| B7 | Finding Coverage | PASS | PASS | All F1–F8 map to plan locations; zero orphans |

## 🔴 Critical (must fix before implementing)

1. **C1 dashboard test hits a nonexistent route with nonexistent keys** (plan:787-795). Fix the path to `/api/v1/admin/analytics/dashboard`, align Step 3 payload and assertions with the existing `get_dashboard` shape (`trends`/`session_volume`/`peak_hours`/`funnel`/`percentiles`) plus whatever cache fields the task actually adds — and keep the "lock existing shape" claim true.
2. **C5 fixture teardown NameError** (plan:1314-1328). Capture `rid = row.id` before `yield` and use `rid` in cleanup (also note the fixture yields a `(Session, row.id)` tuple — align consumers).
3. **C8 unreachable 409 expectation** (plan:1782-1784 vs 1831-1850). Decide the contract — 403 pre-check vs 409 guard (incl. `admin_live_chat` mapping) — and align Step 1 with Step 3 so the test can pass.

## 🟡 Important (should fix)

None beyond the failed criteria above (all reviewer suggestions were Minor).

## 🟢 Minor / Suggestions

- C1 `query_counter` relies on `AsyncSessionLocal.bind` (no precedent in `backend/tests`); verify or count via a fixture-local engine. Query budget ≤5 incl. auth may be flaky — confirm on a real run.
- B2 downgrade DELETEs credentials by name match — scope to migration-created rows if strictness matters.
- D6 Button task is verify-first/opt-in — record the verify-only outcome in the PR.
- PRD story 25 LIFF-GET rate-limit stays an explicit scope-out (no GET route exists).

## Reviewer Disagreements

A3, B2, B6: A FAIL / B PASS. Owner verified all three against the repo live
(route table, service return dict, fixture text, `send_message` call order) and
sides with A on each — recorded as failed in the aggregate per the gate rule.

## Recommended Next Step

Revise and re-validate: fix the 3 Criticals (C1 route+keys, C5 teardown, C8
contract), then re-run prp-validate-plan. No new review round on unchanged sections.

## Scoring

`10 − 2×(A3) − 1×(B2+B6) − 1×(0 additional Important) = 6`; consensus FAIL caps at 7.
Band 6–7 → NOT READY / REVISE.
