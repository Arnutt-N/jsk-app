# Plan Review: feature-line-audit-fix-map (Round 6, 2026-09-22)

**Plan**: `docs/superpowers/plans/2026-09-12-feature-line-audit-fix-map.md`
**Reviewed**: 2026-09-22
**Source PRD**: `docs/superpowers/specs/2026-09-12-feature-line-audit-fix-map.md`
**Review Mode**: dual, independent contexts; same inherited model (no model override)
**Verdict**: NOT READY
**Confidence Score**: 6/10 — single-pass implementation

This dated report preserves round-5 and earlier reports. `--findings` WAS supplied (round-5 report), so B7 is judged. Review-only gate: the plan, PRD, code, and git state were not changed by this review; only this report file is written.

## Reviewer Verdicts

| Reviewer | Diversity | Verdict | Critical issues |
|---|---|---|---:|
| A | isolated context | PASS | 0 |
| B | isolated context | FAIL | 3 |

Adjudication: B's 3 criticals were re-checked against the live tree and are overturned/downgraded (2 were tooling/misreading artifacts, 1 becomes an Important ordering note). But adjudication found 2 NEW genuine criticals the pair missed. Net: NOT READY, but 2 small fixes away.

## Rubric Results

| # | Criterion | A | B | Evidence |
|---|---|---|---|---|
| A1 | Context Completeness | PASS | FAIL | B cites missing KEY_MANAGE_CREDENTIALS in permissions.py. Adjudicated: key is created by D7 plan:3697-3711 (constants+policy+descriptions+registry). B2 refs plan:786,838,920 are forward refs, not omissions. C2 UI files plan:1322-1324; C1 plan:960; D7 plan:3375. Adjudicated PASS with ordering note. |
| A2 | Implementation Readiness | PASS | FAIL | B cites churn + [outdated] reads. Adjudicated: churn is round-5 to 6 revision diff; [outdated] is read-tool artifact. Verified stable via diff-check clean + live grep hits (C1 plan:1009, D7 plan:3773, C2 plan:1559). PASS-conditional on 2 new criticals. |
| A3 | Pattern Faithfulness | PASS | FAIL | B2 bare-string gone; _payload_for dict shapes plan:816-825,862-889 faithful to credential_service.py:74-82 (dict to JSON to Fernet; key names match :219/:230). Adjudicated PASS. |
| A4 | Validation Coverage | PASS | PASS | Backend + frontend gates plan:38-48; per-task Step 4/6 pytest + tsc/lint/build. |
| A5 | UX Clarity | PASS | PASS | Before/after + internal-change labels; C2 button/preview labels plan:1311-1328,1557+; Thai-only plan:31. |
| A6 | No Prior Knowledge | PASS | FAIL | C1 budget plan:950, C2 contract plan:1328,1529-1555, D7 skip rule plan:3542-3549 explicit. BUT C1 FCR/abandon 100/0 placeholder defers decision. Adjudicated FAIL narrowly. |
| B1 | Spec Coverage | PASS | FAIL | Story15 to C1 single-query plan:947-961; stories26-27 to C2 plan:1327-1328,1404+; stories42-43 cross-cutting plan:4003 + plan:31. Adjudicated PASS. |
| B2 | Internal Consistency | PASS | FAIL | 8-key list plan:739-744 vs 6-key _DENY_MIGRATE plan:804-808 reconciled by _ROOT_KEYS plan:780-782,809-812; downgrade marker-scoped plan:904-917. Adjudicated PASS. |
| B3 | Technical Soundness | PASS | FAIL | Backup encrypted-only plan:783-789,842-877; marker downgrade + seed plan:663-686,904-917; roots never encrypted. BUT C2 model lacks migration. Adjudicated FAIL narrowly. |
| B4 | Scope Discipline | PASS | PASS | NOT Building matches PRD Out-of-Scope. |
| B5 | Risk Coverage | PASS | FAIL | Plaintext risk closed (encrypted + explicit purge + no-DROP plan:783-789,918-919); rollback risk closed (marker + cycle evidence plan:939-940). Adjudicated PASS. |
| B6 | Testability | PASS | FAIL | B2 dict-shape plan:643-659 + cycle plan:939-940; C1 cache/empty/Redis-down plan:1004-1054; C2 dry-run + retry plan:1394-1491 + UI test plan:1582. Adjudicated PASS. |
| B7 | Finding Coverage | PASS | FAIL | A mapped all 5 Critical + 3 Important. B claimed orphans from [outdated] reads. Verified live: C1 plan:1009, C2 plan:1322-1324,1559,1582, D7 plan:3773-3775,3542-3549, B2 plan:939-940. Adjudicated PASS. |

## Critical (must fix before implementing)

1. **C2 new model has no Alembic migration in Files/Steps.** BroadcastFailedRecipient model plan:1461-1482 is imported by retry path, but C2 Files plan:1317-1324 lists no migration revision and no Step creates one. Implementer will create model without table, send_broadcast fails on first failed chunk. Fix: add backend/alembic/versions/<rev>_broadcast_failed_recipients.py to Files + Step (create-table with uq_broadcast_failed_recipient, upgrade/downgrade), include in Step-5 git add + Step-6 migration check.
2. **C1 FCR/abandon simplified to 100/0 placeholder.** _get_dashboard_row computes fcr as 100.0 if closed_today else 0.0 and abandon 0.0, with note to restore exact value at implement time. That defers correctness decision into implementation and ships wrong values vs _fcr_rate/_abandonment_rate semantics. Fix: restore exact single-query FCR/abandon scalar-subqueries now, or record explicit PRD decision that they are simplified with named follow-up.

## Important (should fix)

1. **B2 to D7 forward key reference ordering.** B2 backup-access cites KEY_MANAGE_CREDENTIALS plan:786,838,920, but key is created in D7 plan:3697-3711 Wave D after Wave B. Clarify B2 access enforced only after D7 lands (manual/DB-admin until then), or move key creation earlier.
2. **D7 + C2 residual verifications already in plan, confirm at implement time:** D7 static-before-dynamic plan:3773-3775 vs media.py:348; D7 red-phase try/except plan:3542-3549; C2 asyncio/hashlib/SimpleNamespace/JSONResponse imports; C1 import json note. No change needed, do not regress.

## Minor / Suggestions

- B2 test_downgrade_preserves_preexisting_credential plan:663-686 seeds + cleans but defers real assert to Step-6 counts plan:939-940; consider asserting marker scope in-test after cycle.
- C1 budget allows 2 data statements (1 + planner fallback) vs PRD single plan:950; explicitly justified with FAIL-if-exceeded. Keep rule.
- Reviewer B search timeouts on DashboardResponse/BroadcastFailedRecipient/resize-ticket are tooling limits, not plan defects.

## Reviewer Disagreements

- A1/A2/A6, B1/B2/B3/B5/B6/B7: A PASS vs B FAIL. Adjudication sides with A on all (KEY_MANAGE_CREDENTIALS creation plan:3697-3711; diff-check clean; live grep hits), EXCEPT 2 new criticals neither caught (missing C2 migration; FCR placeholder) which flip A6/B3 to adjudicated FAIL narrowly.
- B plan unstable claim is concurrent-edit read artifact, not plan defect. Next re-validation should run on quiesced tree.

## Scoring

Adjudicated fails: A6 (1 Group-A), B3 (1 Group-B). B7 PASS. Score max(1, 10 - 2x1 - 1x1) = 7, but 2 open criticals means NOT READY conditional, confidence 6/10. High maturity; remaining fixes small and well-scoped.

## Recommended Next Step

Revise and re-validate: fix 2 Criticals (add C2 Alembic migration to Files/Steps; restore-or-explicitly-defer C1 FCR/abandon), add 1 Important clarification (B2 to D7 key ordering note), then re-run prp-validate-plan on quiesced tree before implementation.


