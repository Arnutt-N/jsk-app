<!-- GENERATED — do not hand-edit. Regenerate: node .agents/scripts/gen-handoff-views.cjs -->
# Handoff Board (generated)

> **Last generated**: 2026-11-28 17:57 (from newest checkpoint)
> 354 active handoffs, 12 platforms, 0 queued directed handoff(s).

> Regenerate after any handoff: `node .agents/scripts/gen-handoff-views.cjs`

## Agent Status

| Platform | Status | Last active | Queued | Last task | Summary |
|----------|--------|-------------|--------|-----------|---------|
| antigravity | AVAILABLE | 2026-09-04 09:00 | 0 | P2 Thai Calendar and Date Standardization merged into main (PR #223, commit f91b12b). 3-gate codebase-review-fix pipelin | `project-log-md/antigravity/session-summary-20260904-0900.md` |
| claude_code | AVAILABLE | 2026-11-28 17:57 | 0 | Completed the full codex review backlog: N10, N06/N07, N04/N05/N13/N14, F01-F16 plus deferred follow-ups (F02/F03/F06 te | `project-log-md/claude_code/session-summary-20261128-1757.md` |
| cline | AVAILABLE | 2026-09-27 20:08 | 0 | Merged PR 236 codebase-review-fix batch F1-F7: SQL-like escaping pagination bounds broadcast fan-out dedup LINE-ID log m | `project-log-md/cline/session-summary-20260927-2008.md` |
| codex | AVAILABLE | 2026-11-25 14:59 | 0 | Codex read-only review of PR 355 and morning release: N01-N14 plus F01-F16, with ordered fixes and measurement checks | `project-log-md/codex/session-summary-20261125-1459.md` |
| gemini_cli | AVAILABLE | 2026-04-03 12:00 | 0 | Redesigned the login page to align with the new landing page aesthetic (glassmorphism, shared backgrounds, brand mark).  | — |
| kilo_code | AVAILABLE | 2026-09-13 18:22 | 0 | Feature-line audit map: PRD + 19-task PRP plan (4 Critical + ~30 High fixes across 19 features); plan revised to clear d | `project-log-md/kilo_code/session-summary-20260913-1822.md` |
| kimi_code | AVAILABLE | 2026-10-25 13:55 | 0 | Merged PR #299: admin UI polish batch (reply-objects SKN->JSK rename+migration, canned badge removal, rich-menu shared S | `project-log-md/kimi_code/session-summary-20261025-1355.md` |
| muse_code | AVAILABLE | 2026-10-11 15:10 | 0 | Merged PR #248 (act-on-8 fixes + 6 review findings) via guarded squash d5dbef9 after independent PASS+NOTES verdict; del | `project-log-md/muse_code/session-summary-20261011-1510.md` |
| open_code | AVAILABLE | 2026-08-25 07:39 | 0 | LIFF smoke-test plan for PR #202 drafted+reviewed (.scratch/liff-smoke-pr202/smoke-test-plan.md, REV1: 5 findings fixed) | `project-log-md/open_code/session-summary-20260825-0739.md` |
| pi | AVAILABLE | 2026-10-27 12:25 | 0 | Codebase review: Task 22 backend ruff gate done, PR #301 draft CI green; 29 tasks remain starting with Phase 0 CI tasks | `project-log-md/pi/session-summary-20261027-1225.md` |
| qoder | AVAILABLE | 2026-08-29 23:21 | 0 | Merged PR #206 + #207 to main (8ddbda3, beaff04) — resolved #206 generated-state conflicts (kept both 21:58/22:44 record | `project-log-md/qoder/session-summary-20260829-2321.md` |
| zcode | AVAILABLE | 2026-09-06 22:56 | 0 | codebase-review-fix on PR #228 CLOSED via PR #229 (squash e63ee9f, CI 4/4, CD success): review found 0 Critical/High; 3  | `project-log-md/zcode/session-summary-20260906-2256.md` |

## Handoff Queue

_Queue empty — no pending directed handoffs._

## Needs attention

_None — no blocked checkpoints._

## Recent Activity

| When | From → To | Task | Checkpoint |
|------|-----------|------|------------|
| 2026-11-28 17:57 | claude_code → all | Completed the full codex review backlog: N10, N06/N07, N04/N05/N13/N14, F01-F16 plus deferred follow-ups (F02/F03/F06 test gaps closed). 28  | `handover-claude_code-20261128-1757.json` |
| 2026-11-25 14:59 | codex → all | Codex read-only review of PR 355 and morning release: N01-N14 plus F01-F16, with ordered fixes and measurement checks | `handover-codex-20261125-1459.json` |
| 2026-11-25 14:12 | claude_code → all | PR 355 merged to main (5320144): VIEWER role manageable only by SUPER_ADMIN; VIEWER added to admin auth roles; create/edit role dropdowns fi | `handover-claude_code-20261125-1412.json` |
| 2026-11-25 10:38 | claude_code → all | PR #354 merged as 3ddab89; all release PRs 349-352 and handoff closeout PR 353-354 are on main. Browser simulation passed 3 flows with no pr | `handover-claude_code-20261125-1038.json` |
| 2026-11-25 08:45 | claude_code → all | PR #353 handoff state reviewed PASS+NOTES and merged to main as squash 18dc61a with guarded merge at head da705ff | `handover-claude_code-20261125-0845.json` |
| 2026-11-25 01:55 | claude_code → all | PR #352 release summary reviewed PASS, no-comments corrections applied, merged to main as squash 430d527 with guarded merge at head 97c2f17 | `handover-claude_code-20261125-0155.json` |
| 2026-11-25 00:22 | claude_code → all | Release summary written at .audit/RELEASE_SUMMARY_20261125.md indexing merged PRs, production CD verification, review verdicts, perf outcome | `handover-claude_code-20261125-0022.json` |
| 2026-11-25 00:13 | claude_code → all | Browser simulation checklist completed: delayed upload, new-case retry, and hidden-email booking all pass with cleanup verified; no product  | `handover-claude_code-20261125-0013.json` |
| 2026-11-24 13:13 | claude_code → all | C4 measured with 10-run interleaved A/B: lazy audit cuts pre-tab requests 9 to 8 but latency gap stays inside noise, verdict NO CHANGE. C1 a | `handover-claude_code-20261124-1313.json` |
| 2026-11-24 11:50 | claude_code → all | PR #351 C1 attachment metadata fix reviewed PASS, merged to main as squash 13d7845 with guarded merge at head 06cce5b | `handover-claude_code-20261124-1150.json` |
