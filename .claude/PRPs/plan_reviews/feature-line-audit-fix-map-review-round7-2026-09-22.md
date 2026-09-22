# Plan Review: feature-line-audit-fix-map (Round 7, 2026-09-22)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`
**Reviewed**: 2026-09-22
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Review Mode**: dual, independent contexts; same inherited model (no model override)
**Verdict**: READY
**Confidence Score**: 9/10 — single-pass implementation

This dated report preserves round-6 and earlier reports. `--findings` WAS supplied (round-6 report), so B7 is judged. Review-only gate: the plan, PRD, code, and git state were not changed by this review; only this report file is written.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---:|
| A | isolated context | PASS | 0 |
| B | isolated context | PASS | 0 |

Both reviewers independently verified round-6 Criticals 1-2 fixed, the Important ordering note added, and no new criticals. Consensus READY.

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | PASS | Files/Interfaces per task verified (C1 plan:955-963, C2 plan:1378-1392, D7 plan:3456-3470); B2 to D7 forward key ref clarified plan:786,838-839,921-922; C2 UI files plan:1386-1388. |
| A2 | Implementation Readiness | PASS | PASS | Every task has ACTION/IMPLEMENT/MIRROR/VALIDATE/GOTCHA; TDD Steps 1-6; branch/file-ownership plan:35; C2 git-add + migration check plan:1675,1679-1683. |
| A3 | Pattern Faithfulness | PASS | PASS | Global constraints plan:27-36 (async, select only, Pydantic suffix, HTTPException, model_validate); B2 dict shapes match credential_service.py:74-82,219,230. |
| A4 | Validation Coverage | PASS | PASS | Global gates plan:38-48; per-task Step 4/6 (C1 plan:996-1058; C2 plan:1667-1683; D7 plan:3782-3785); upgrade/downgrade cycles B2 + C2. |
| A5 | UX Clarity | PASS | PASS | Thai-only plan:31; C2 preview/failed UI plan:1392,1650-1665; D7 Thai errors + audit codes plan:3760-3777. |
| A6 | No Prior Knowledge | PASS | PASS | C1 budget <=2 FAIL-if-exceeded plan:950,1008-1011; imports explicit (json/aliased/asyncio/hashlib); FCR 100/0 placeholder removed, exact formulas plan:1179-1228,1295-1309. |
| B1 | Spec Coverage | PASS | PASS | Story15 to C1 single-query; stories26-27 to C2 dry-run + backoff + UI; stories42-43 cross-cutting Thai+audit; shape preserved session_volume/peak_hours/funnel/percentiles. |
| B2 | Internal Consistency | PASS | PASS | 8-key = 6-key _DENY + 2 root _ROOT_KEYS plan:740-745,780-782,809-812; downgrade marker-scoped plan:904-917; FCR windows consistent. |
| B3 | Technical Soundness | PASS | PASS | Backup encrypted-only + no-DROP plan:783-789; roots never self-encrypted; C2 table supports retry; FCR/abandon same semantics as service. |
| B4 | Scope Discipline | PASS | PASS | NOT Building matches PRD Out-of-Scope; helpers retained plan:1089-1091; no non-admin route change plan:953. |
| B5 | Risk Coverage | PASS | PASS | Redis-down fail-open; empty percentile 0; explicit purge + no-DROP; marker rollback + pre-existing seed. |
| B6 | Testability | PASS | PASS | C1 cache/empty/Redis-down plan:996-1058; C2 dry-run + retry-exhaustion + timezone plan:1427-1448,1665; B2 cycle counts plan:939-942. |
| B7 | Finding Coverage | PASS | PASS | Round-6 Critical1 to C2 model+migration+git+validation; Critical2 to C1 exact FCR/abandon; Important ordering to B2 3 points. No orphan. |

## B7 Finding Closure (round-6 to round-7)

1. **C2 migration missing -> FIXED.** Files plan:1383-1384 list model + b8c9d0e1f2a3 migration; model plan:1565-1585; upgrade/downgrade plan:1589-1615; git add plan:1675; validation plan:1679-1683 with to_regclass. Regression: down_revision=None + rebase note plan:1592 explicit.
2. **C1 FCR/abandon placeholder -> FIXED.** Exact scalar-subqueries plan:1179-1228 (FCR ~exists reopen-in-24h via aliased + child_column; abandon SYSTEM_TIMEOUT/(abandoned+claimed)); Python percent zero-division 0.0 plan:1295-1309; old closed_today removed plan:1177-1178.
3. **B2 to D7 key ordering -> FIXED.** plan:786,838-839,921-922 state key created D7 plan:3697-3711 Wave D after B; manual/DB-admin + audit until then; explicit DELETE purge; downgrade keeps backup.

## Critical

None open.

## Important (should fix at implement time, non-blocking)

- C2 migration down_revision=None rebase risk (plan:1592): confirm `alembic heads` has single head before running; rebase onto Wave-C lane head.
- C1 query_counter listens sync_engine.before_cursor_execute (plan:989): auth/ambient excluded by design; keep FAIL-if-exceeded rule.
- C2 dry-run calls broadcast_service._build_messages with SimpleNamespace preview (plan:1549): confirm method accepts that shape at implement time.

## Minor / Suggestions

- C1 FCR trend uses today/yesterday windows (matching get_kpi_trends) while calculate_fcr_rate default is 7-day; intentional, keep comment to avoid confusion.
- B2 in-test marker assert deferred to Step-6 counts; optional in-test assert after cycle.
- C1 budget 2 statements (1 + planner fallback) vs PRD single; justified with FAIL-if-exceeded; keep.

## Reviewer Disagreements

None. A and B agree PASS on all criteria.

## Scoring

Zero failed criteria in either group. Score max(1, 10 - 0) = 10, capped to 9 because model diversity is same-inherited-model (no override) and plan was edited concurrently during review window. Band >=8: READY.

## Recommended Next Step

Implement from the plan task-by-task per execution contract (Wave A to B to C to D, file ownership respected, TDD red to green to regression, tests after each phase). No further re-validation required before implementation unless the plan is edited again.

