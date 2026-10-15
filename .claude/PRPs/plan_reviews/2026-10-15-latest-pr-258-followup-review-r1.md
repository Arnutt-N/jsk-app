# Plan review — 2026-10-15-latest-pr-258-followup (GATE LOOP 1)

Plan: `.claude/PRPs/plans/2026-10-15-latest-pr-258-followup.plan.md`
Spec: `.claude/PRPs/findings/2026-10-15-latest-pr-258-findings.md`
Method: dual adversarial review, 2 context-isolated reviewers (A + B), neither saw the other.
Rule applied: a criterion failing on one reviewer is still a finding.

## Reviewer A — VERDICT: READY, CONFIDENCE: 8/10
B1 PASS, B2 PASS, B3 PASS, B4 PASS, B5 PASS, B6 PASS, B7 PASS, B8 PASS, B9 PASS.
Top risks: (1) T2 additive flag needs response_model grep/extend else 422 — check included but
schema file not in Files list; (2) T1 fallback keeps CI green but masks isolation if
TEST_DATABASE_URL unset — require second-DB tail; (3) T3 rename needs grep for old name /
-k filters or breaks CI.

## Reviewer B — VERDICT: NOT READY, CONFIDENCE: 8/10
B1 PASS, B2 PASS, B3 PASS, **B4 FAIL** ("(or the helper directly if the mixin needs too much
fixture)" — escape hatch lets the implementer skip the integration proof),
B5 PASS, B6 PASS, **B7 FAIL** (finding→task mapping summarized but not explicit per task;
M7/M8→T5 mapping implicit), **B8 FAIL** ("if none exists, logging only" — metric conditional
may ship flag+log without metric, weakening H2's visibility proof), B9 PASS.
Top risks: same three as A (schema/metric/isolation/rename-grep).

## Gate decision (loop 1): NOT READY → revise (loops used: 1/3)
Revision orders for loop 2:
R1 (B4): delete the T2 mirror escape hatch — quarantine test MUST exercise
  `get_conversations` with an AsyncMock db; helper-direct test allowed only as an extra.
R2 (B7): add an explicit `Finding coverage:` line to every task (H1→T1, M3→T1, M5→T4, H2→T2,
  M1/M2→T3, L2→T4, M7/M8→T5) so orphans are machine-checkable.
R3 (B8): harden the metric clause — grep for the existing counter precedent
  (`app/core/pseudonym_gate.py` counter design) and reuse it; if no reusable counter exists,
  logger.warning + per-row flag IS the visibility proof and the metric becomes a named
  follow-up (stated in PR, not silently dropped).
R4 (top risks): T3 must grep CI/docs for the old test name before renaming; T2 Files list
  gains the route/schema discovery target; T1 second-DB tail is blocking (already stated —
  promote to Acceptance Criteria checkbox).
