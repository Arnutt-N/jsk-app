# TODO — enterprise-audit-sweep (Investigation playbook steps, verbatim first)

- [x] Route through the **how** skill. For motivation questions, also route through the **why** skill.
- [x] Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
- [ ] Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
- [ ] Apply the **unslop** skill to the reply.

# Task todos (below the playbook steps)
- [x] Pickup: read PROJECT_STATUS + HANDOFF_BOARD + TASK_LOG + SESSION_INDEX + latest checkpoint (main @ PR #256)
- [x] Branch: `feat/enterprise-audit-sweep` created from main
- [x] PRD written: `.claude/PRPs/prds/enterprise-audit-sweep.prd.md`
- [x] Plan written: `.claude/PRPs/plans/enterprise-audit-sweep.plan.md`
- [x] Self-review PRD + plan vs AGENTS.md mandatory workflow
- [x] User approval gate: start approved, prod smoke yes, report-only first (2026-10-15)
- [x] Phase 1 inventory done (.audit/enterprise-audit-inventory.md)
- [x] Phase 2 backend gates done (.audit/enterprise-audit-gates-backend.md): 1476 collected, WS 10/10, full 1469 passed / 2 failed / 5 skipped; failures = test_detailed_and_ws_health_require_admin + test_inbox_equivalence_db (base comparison pending in triage)
- [ ] Phase 3 frontend gates (agent a60f90c3 died of connection error with no file; fresh retry agent a53ddb92 dispatched, writes partial results per step)
- [x] Phase 4 security scan + Phase 5 prod smoke done (.audit/enterprise-audit-security.md, .audit/enterprise-audit-prod-smoke.md); secret lines re-verified by length (58/39 chars, doc mentions only)
- [x] Phase 6 triage done (.audit/enterprise-audit-findings.md, report-only): F1 low test-env (DEV_AUTH_BYPASS=true local), F2 medium unproven (InvalidToken, fresh-DB rerun pending), F3 low eslint-generated-dir, F4 info warnings backlog, F5 closed (ceed1ff), F6 verified
- [x] Phase 7 done: docs committed + pushed, report-only PR #257 opened, handoff checkpoint written + views regenerated + pushed. Fix PRs wait for user go.
- [ ] skip: code fixes in this run (report-only until user approves Phase 6)

throughput checkpoint: n/a, read-only investigation
