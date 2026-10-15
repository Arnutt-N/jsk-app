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
- [x] Phase 7 done: docs committed + pushed, report-only PR #257 opened, handoff checkpoint written + views regenerated + pushed.
- [x] Fix race launched per user order: .worktrees/audit-fix-poteto @ fix/audit-f1f4-poteto (agent a1aa96af, poteto-mode only) vs .worktrees/audit-fix-ecc @ fix/audit-f1f4-ecc (agent a9a7b160, ecc-guide + domain skills only). Same tasks F2-prove/F1/F3/F4, one commit per fix, stop at pushed branch, no PRs yet.
- [x] Race compared (.audit/fix-race-verdict.md): F1/F2/F3 ties, F4 ECC wins (9/9, full green). Wakeup cancelled.
- [x] Cross-review done: .audit/review-poteto-on-ecc.md (4 APPROVE, F4 notes) + .audit/review-ecc-on-poteto.md (3 APPROVE + F4 APPROVE-WITH-NOTES non-blocking). Committed + pushed.
- [x] Landed per user go: fix/audit-f1f4 pushed; PR #258 reviewed (CI green, diff identical to reviewed lane) and SQUASH-MERGED to main (a9d807c). Main CI+CD+Encoding green post-merge. Prod smoke: backend 200 (one transient 000, retry 200), frontend 200.
- [x] Cleanup: lane worktrees removed, local+remote lane branches deleted. Report PR #257 still OPEN (audit docs, user decision).
- [ ] Final handoff
- [ ] skip: code fixes in this run (report-only until user approves Phase 6)

throughput checkpoint: n/a, read-only investigation
