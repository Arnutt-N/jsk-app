# Plan Review: feature-line-audit-fix-map (Round 5, prp-validate-plan gate)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md` (~2870 lines, commit `bca509d`)
**Reviewed**: 2026-09-13
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Findings input (B7)**: `.claude/PRPs/plan_reviews/feature-line-audit-fix-map-review-round4.md` (1 Critical)
**Review Mode**: dual
**Verdict**: NOT READY
**Confidence Score**: 7/10 — single-pass implementation

Lineage: round-4 NOT READY (7/10, C1 budget) → budget fixed (`3691fc5`) + late D7
mirror fix (`bca509d`) → this round-5 gate.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---|
| A | context isolation only | FAIL | 3 (C1 counter, D7 vitest, D7 bh-test) |
| B | context isolation only | FAIL | 2 (C2 dry-run, D7 vitest) |

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1–A5 | all | PASS | PASS | Anchors real, steps executable, commands exist, UX/waves documented |
| A6 | No Prior Knowledge | FAIL | PASS | C1 `query_counter` uses `AsyncSessionLocal.bind` (plan:773) — sessionmaker keeps bind in `.kw`, no `.bind` attr → AttributeError at setup; D7 never names the hardcoded test spots its keys break |
| B1–B5 | all | PASS | PASS | 43 stories mapped, 1 def/task, single head, scope + risks present |
| B6 | Testability | FAIL | FAIL | C2 dry-run return fails response validation (500, never the asserted 200); D7 vitest `toHaveLength(20)` breaks on 2 new keys; D7 bh-test passes pre-fix (AGENT already 403) |
| B7 | Finding Coverage | PASS | PASS | Round-4 budget fix verified in plan text and repo |

## 🔴 Critical (must fix before implementing)

1. **C1 `query_counter` crashes at setup** (plan:766-776). `AsyncSessionLocal.bind`
   does not exist (owner-verified against sessionmaker semantics + zero in-repo
   precedent; B's "exists" cited only the constructor arg, not the attribute).
   Fix: count via a fixture-local engine (same `_fresh_engine()` recipe the plan
   already uses) instead of the shared app sessionmaker.
2. **C2 dry-run contract unreachable** (plan:992-1015). `create_broadcast` keeps
   `response_model=BroadcastResponse, status_code=201` (admin_broadcast.py:112) while
   Step 3 returns `BroadcastDryRunResponse` → response validation fails (500), never
   the asserted 200 + `dry_run==True`. Fix: return the dry-run payload as
   `JSONResponse(status_code=200, ...)` (bypasses response_model, normal path untouched).
3. **D7 breaks the vitest integrity test it prescribes** (`permission-modules.test.ts:43`
   `toHaveLength(20)` + BACKEND_KEYS drift guard). Adding 2 registry entries without
   editing the test makes `npm run test:unit -- permission-modules` fail as written.
   Fix: plan must update the test (20→22, BACKEND_KEYS +2, system 11→13, order list)
   and commit the test file in Step 5.
4. **D7 bh-test cannot go red** (plan:2747-2765). AGENT PUT is already 403 pre-fix via
   `get_current_admin`, so the assertion passes before and after. Fix: discriminate
   with ADMIN (pre-fix 200 via admin gate, post-fix 403 without the new key) and keep
   AGENT-403 as regression lock (optionally + SUPER_ADMIN 200 positive case).

## 🟡 Important

None (all suggestions Minor).

## 🟢 Minor / Suggestions

- Fixtures yielding inside `async with Session()` (A2/B1/C5/C8/D1) — move yield outside.
- C1 cache test + C8 presence test need live Redis — document infra prerequisite in-task.
- Global Constraints precedent pointer: `test_admin_requests_endpoints.py:89-112`
  overrides `get_current_admin`/`get_current_manager`, not `get_current_user` — fix the citation.

## Reviewer Disagreements (owner-settled)

- `AsyncSessionLocal.bind`: A FAIL / B PASS → owner sides with **A** (no `.bind` on
  sessionmaker; B proved only the constructor arg). Failed in aggregate.
- C2 dry-run: A silent / B FAIL → owner independently confirmed B (500, not 200).
  Failed in aggregate.
- D7 bh-test red-ness: A FAIL / B silent → owner confirmed pre-fix 403. Failed.

## Recommended Next Step

Revise (fix Criticals 1–4) and re-run prp-validate-plan.

## Scoring

`10 − 2×(A6) − 1×(B6) − 1×(0) = 7`; consensus FAIL caps at 7 → **7/10**.
Band 6–7 → NOT READY / REVISE.
