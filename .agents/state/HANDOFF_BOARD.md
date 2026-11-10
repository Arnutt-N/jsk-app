<!-- GENERATED — do not hand-edit. Regenerate: node .agents/scripts/gen-handoff-views.cjs -->
# Handoff Board (generated)

> **Last generated**: 2026-11-10 20:28 (from newest checkpoint)
> 329 active handoffs, 12 platforms, 0 queued directed handoff(s).

> Regenerate after any handoff: `node .agents/scripts/gen-handoff-views.cjs`

## Agent Status

| Platform | Status | Last active | Queued | Last task | Summary |
|----------|--------|-------------|--------|-----------|---------|
| antigravity | AVAILABLE | 2026-09-04 09:00 | 0 | P2 Thai Calendar and Date Standardization merged into main (PR #223, commit f91b12b). 3-gate codebase-review-fix pipelin | `project-log-md/antigravity/session-summary-20260904-0900.md` |
| claude_code | AVAILABLE | 2026-11-10 20:28 | 0 | PR #330 green on head 196561a: all 6 CI checks SUCCESS. Gauntlet status: no-comments done (4 comments killed, 8 KEEP), b | `project-log-md/claude_code/session-summary-20261110-2028.md` |
| cline | AVAILABLE | 2026-09-27 20:08 | 0 | Merged PR 236 codebase-review-fix batch F1-F7: SQL-like escaping pagination bounds broadcast fan-out dedup LINE-ID log m | `project-log-md/cline/session-summary-20260927-2008.md` |
| codex | AVAILABLE | 2026-08-29 06:54 | 0 | Completed evidence-backed deep review of Qoder audit sweep and architecture report; consolidated findings and remediatio | `project-log-md/codex/session-summary-20260829-0654.md` |
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
| 2026-11-10 20:28 | claude_code → all | PR #330 green on head 196561a: all 6 CI checks SUCCESS. Gauntlet status: no-comments done (4 comments killed, 8 KEEP), blast-radius probe OK | `handover-claude_code-20261110-2028.json` |
| 2026-11-09 23:11 | claude_code → all | Closed handoff items 1-3 from checkpoint 20261109-0712: r.cjs shell branch by platform, resolve_by_line_id hash branch in friend-history moc | `handover-claude_code-20261109-2311.json` |
| 2026-11-09 07:12 | claude_code → all | PR #326 merged + #327 verified; poteto review of #325 done | `handover-claude_code-20261109-0712.json` |
| 2026-11-09 05:08 | claude_code → all | Date-filter rollout + agent guardrails (PR #321-#327 merged) | `handover-claude_code-20261109-0508.json` |
| 2026-11-07 13:42 | claude_code → all | Merged 2 PRs continuing the admin UI consistency pass. #319 (d31f628) fixed the shared DatePresetFilter: the preset and clear buttons were r | `handover-claude_code-20261107-1342.json` |
| 2026-11-05 19:59 | claude_code → all | Merged 6 PRs unifying the admin date-filter UI across all six pages. #313 (c502d09) deleted the dead Gregorian DateRangePicker+Calendar fami | `handover-claude_code-20261105-1959.json` |
| 2026-11-04 14:01 | claude_code → all | Merged one more PR after the previous handoff: #312 (fix/live-chat-search-race, merged as 0c1919f) closed a race that #311 had introduced in | `handover-claude_code-20261104-1401.json` |
| 2026-11-04 07:40 | claude_code → all | Merged three PRs completing the Next.js 16.4.3 security upgrade and full react-hooks conformance on main. #309 upgraded next 16.1.1 -> 16.4. | `handover-claude_code-20261104-0740.json` |
| 2026-11-01 11:11 | claude_code → all | Next.js security upgrade in progress on branch chore/next-16-4-3-cve (uncommitted). next 16.1.1 -> 16.4.3 clears 4 critical advisories to 0  | `handover-claude_code-20261101-1111.json` |
| 2026-10-29 17:21 | claude_code → all | Codebase review plan 30/30 complete, plus a review/correct/deslop pass that closed 4 findings (2 latent fail-open in the route manifest, 1 s | `handover-claude_code-20261029-1721.json` |
