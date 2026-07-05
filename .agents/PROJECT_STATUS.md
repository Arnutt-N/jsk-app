# Project Status: SknApp

> **Last Updated:** 2026-07-05 23:34 by Claude Code (Tech-debt pass C on live-chat hooks.)

## Thai Summary
ฟีเจอร์ **Rich Menu Switching + การกำหนดเมนูรายบุคคล (R1/R2)** เสร็จสมบูรณ์และขึ้น production แล้ว — merge เข้า main ผ่าน PR #114 (merge commit `3a90f4d`), migrate ฐานข้อมูล Supabase PROD (richmenu alias + user_rich_menu_links แบบ additive) และ deploy frontend บน Vercel เรียบร้อย
- ขั้นตอนถัดไป: ยืนยันว่า **backend prod** มีโค้ด Task 6.2 ครบ (Vercel deploy แค่ frontend), smoke test การกำหนด rich menu (เดี่ยว+กลุ่ม) บน /admin/friends ให้ครบ loop

## 🆕 NEW AGENT? START HERE
1. **Entry Point:** `../START_HERE.md` - Friendly welcome and quick links
2. **Follow:** `.agents/workflows/start-here.md` - Step-by-step guide
3. **Keep Handy:** `.agents/QUICK_START_CARD.md` - Quick reference

## Agent Collaboration Quick Reference
- **🚀 Start Here:** `.agents/workflows/start-here.md` - Universal entry workflow
- **Universal Prompt:** `AGENT_PROMPT_TEMPLATE.md` (project root)
- **Quick Card:** `.agents/QUICK_START_CARD.md`
- **Pickup Workflow:** `.agents/workflows/pickup-from-any.md`
- **Handoff Workflow:** `.agents/workflows/handoff-to-any.md`
- **Collaboration Standard:** `.agents/skills/cross_platform_collaboration/SKILL.md`
- **Current Session:** `.agents/state/current-session.json`
- **Current Task:** `.agents/state/task.md`
- **Task History:** `.agents/state/TASK_LOG.md` (**GENERATED from checkpoints — do not hand-edit**)
- **Session Index:** `.agents/state/SESSION_INDEX.md` (**GENERATED cross-platform index — do not hand-edit**)

## Technical Environment (Critical)
- OS: Windows host + WSL2 required
- Backend: run in WSL using `backend/venv_linux`
- Frontend: run in WSL
- Database: PostgreSQL + Redis

## Active Milestones

### Rich Menu Switching & Per-User Assignment — R1/R2 (Status: COMPLETE - Merged to main, in PROD)
- [x] Backend Phase 1–4, 7: schema validation fix (richMenuAliasId), RichMenuAlias + UserRichMenuLink models + migration `t0u1v2w3x4y5`, alias CRUD endpoints, per-user link/unlink/bulk service, delete-guard + dependencies endpoint.
- [x] Frontend Phase 5–6.2: richmenuswitch switch-action UI (new+edit), alias management page `/admin/rich-menus/aliases`, per-user assignment UI on friends page (per-row modal + bulk toolbar), `user_link_count` badge, current-menu column.
- [x] Reviewed (ecc fastapi + react reviewers, 6 findings applied) + AgentShield security scan (clean).
- [x] Migrated Supabase PROD to alembic head `t0u1v2w3x4y5` (additive). Frontend deployed to Vercel (READY).
- [x] Merged PR #114 (merge commit `3a90f4d`). Local CI green (pytest 499, lint, vitest 161, build, encoding).
- [ ] **Open:** verify backend prod has Task 6.2 code (FastAPI deploys separately from Vercel frontend); smoke test on prod.

### UX & Error Handling Improvements (Status: COMPLETE - Merged to main)
- [x] Added `useUndoableState` hook with undo/redo controls and keyboard shortcuts.
- [x] Added `HelpSheet` component with bilingual search and keyboard shortcuts.
- [x] Created `api-error.ts` utilities for consistent backend error extraction.
- [x] Fixed undo/redo shortcuts interfering with input typing.
- [x] Fixed HelpSheet closing logic when navigating via related pages.
- [x] Replaced `console.error` with `logger.error` across admin pages.
- [x] Added unit tests for `useUndoableState` and `api-error` utilities (52 tests passing).
- [x] Resolved CI/CD build failures (missing React Hook dependencies).
- [x] Merged PR #78 to `main` branch.

## Latest Pickup Status
- [2026-06-21] R1/R2 Rich Menu (incl Task 6.2 per-user UI) merged to `main` via PR #114 (`3a90f4d`); Supabase PROD migrated; Vercel frontend deployed. Branch `feat/rich-menu-switching-r1` deleted. Working tree clean.

## Recent Completions
- [2026-07-05 23:34] Claude Code: Tech-debt pass C on live-chat hooks. SHIPPED #1: toggleMode (useChatRoom.ts) was the only room action without try/catch — network error / non-ok response failed silently. Added try/catch + system notification mirroring claim/close/transfer, (Claude Code)
- [2026-07-05 21:18] Claude Code: Fixed the long-standing CI-red (auto-replies focus test, red since ce5a414) at its root: a timing race in the SHARED components/ui/Modal.tsx. The open-focus effect's 50ms setTimeout focused the first focusable element (Close button); when t (Claude Code)
- [2026-07-05 19:29] Claude Code: Diagnosed the long-standing CI-red (auto-replies focus test, red since ce5a414 2026-07-03) via systematic-debugging Phase 1 — ROOT CAUSE FOUND, no code changed yet. It is a timing RACE in the SHARED frontend/components/ui/Modal.tsx (lines ~ (Claude Code)
- [2026-07-05 18:46] Claude Code: Synced skn-* skill docs with this session's live-chat code changes (commit aca5e1c, pushed). Fixed stale references that would misdirect future work: skn-ui-library (useTheme moved hooks/useTheme.ts DELETED -> components/providers/ThemeProv (Claude Code)
- [2026-07-05 16:58] Claude Code: Fixed 7 live-chat UI/UX bugs (diagnosing-bugs + 2 parallel agents): bubble sides (user L/admin+bot R), unified presence dots (new lib/constants/live-chat-presence.ts), theme toggle from resolvedTheme + dark navbar semantic tokens + .dark -- (Claude Code)
- [2026-07-05 03:01] Claude Code: Fixed 4 live-chat UI bugs via diagnosing-bugs loop (Playwright probe vs live WSL stack): (1) layout shift/dead-space root cause = CustomerPanel 806px>650px viewport gave overflow-hidden shell a hidden scroll range + scrollIntoView scrolled  (Claude Code)
- [2026-07-05 00:30] Claude Code: Fixed prod live-chat cannot-connect: Vercel rewrite strips WS upgrade headers (WS via Vercel=404, direct Koyeb=101) -> new lib/websocket/wsUrl.ts derives wss URL from NEXT_PUBLIC_API_URL with same-host fallback; both call sites (useLiveChat (Claude Code)
- [2026-07-04 23:27] Claude Code: Setup Matt Pocock skills config: added '## Agent skills' block to CLAUDE.md + created docs/agents/{issue-tracker,triage-labels,domain}.md (local-markdown issue tracker under .scratch/, default 5 triage labels, single-context domain docs) (Claude Code)
- [2026-07-04 22:51] Claude Code: 2026-07-04 session: fixed the broken GLOBAL statusLine (out-of-repo ~/.claude/statusline-command.sh) - Git Bash on Windows ships no jq, so every field read empty and only the git-branch fallback rendered (user saw just "branch" + the built- (Claude Code)
- [2026-07-03 15:24] Claude Code: Session shipped 2 prod bug fixes + designed a 3rd feature. (1) Modal focus-steal FIXED+deployed (733c09f, Vercel). (2) Bot silent on STARTS_WITH/REGEX = stale Koyeb backend lacked #120; re-enabled CD + deployed backend (run 28643492923 succ (Claude Code)
- [2026-07-03 13:50] Claude Code: Fixed 2 user-reported prod bugs. (1) Modal focus-steal: focus effect keyed on onClose identity re-ran every keystroke and stole focus from inputs (create-category modal, live since PR #112) - split into open-keyed focus effect + separate ke (Claude Code)
- [2026-07-03 12:02] Claude Code: Tasks 1-5 done: Actions re-enabled + keepalive green (run 28632529122); #120 verified vs real PG16 6/6 in WSL (rollback, no data); pr-116 all 6 deferred items verified ALREADY FIXED (table in pr-116-review.md); #121 shipped 4bbcd9a (a11y/se (Claude Code)
- [2026-07-03 06:56] Claude Code: Wrote consolidated session handoff rollup (project-log-md/claude_code/session-summary-20260703-0655-claude-code-handoff.md): all DONE tasks (CodeX continuation, 3-agent review + 9 fixes, e2e green, PROD migration v2w3x4y5z6a7, 3 deferred fo (Claude Code)
- [2026-07-03 06:21] Claude Code: Fixed issue #120: implemented STARTS_WITH + REGEX intent matching at runtime in the LINE webhook via a new find_intent_keyword() helper (priority EXACT > STARTS_WITH > CONTAINS > REGEX, case-insensitive; REGEX evaluated in Python with ReDoS (Claude Code)
- [2026-07-03 04:04] Claude Code: Shipped the 3 deferred live-chat follow-ups from the review round (commit 1e5cf5d): (1) typing_start throttled to one frame per room per 3s window so normal typing no longer trips the 30/60s WS rate limit (auto-stop timer still refreshes pe (Claude Code)
- [2026-07-03 01:43] Claude Code: Applied migration v2w3x4y5z6a7 (uq_chat_sessions_one_open_per_line_user partial unique index) to Supabase PROD via db_target remote upgrade head. Pre-checked: PROD had 0 open sessions / 0 duplicates so no cleanup was needed; verified alembi (Claude Code)
- [2026-07-03 00:01] Claude Code: Follow-up to ba16647 (live-chat hardening, see previous checkpoint): committed the leftover untracked doc .claude/docs/skill-collections-comparison.md as 4932cbe (docs) to leave the tree fully clean; both commits pushed to main. (Claude Code)
- [2026-07-02 23:55] Claude Code: Validated + hardened CodeX live-chat fix before commit: stacked WSL dev env, e2e green (2-client 2/2 single run, smoke 3 passed/1 skip), 3-agent review (fastapi/react/security) found 2 CRITICALs in unmodified middle-layer useWebSocket.ts (o (Claude Code)
- [2026-06-29 07:23] Claude Code: Fan-out review (7 experts + adversarial verify, 44 findings: 2 blocking, 35 non-blocking, 7 refuted) then merged PR #111 (matchtype enum re-chained migration, fixed revision-id collision) + PR #112 (reply-object type editors + LINE preview; (Claude Code)
- [2026-06-28 22:17] Claude Code: Final 2 optional tasks DONE — no code change needed. (Task 1) PR #119 verified on prod: /api/v1/health/websocket = uptime 3s, healthy, pubsub_connected=true -> server_id 128-bit deployed, no behavior change. (Task 2) Investigated the 27 WSL (Claude Code)
- [2026-06-28 21:13] Claude Code: PR #119 (PR2 review polish, 3 LOW) reviewed (mergeable CLEAN; diff scope verified = exactly the 2 expected files, docs + 1-line server_id hardening, no behavior change) + MERGED to main (squash 3cc616e). ALL 3 session PRs now merged: #117 ( (Claude Code)
- [2026-06-28 20:21] Claude Code: Tasks 2+3 from prior handoff DONE. (Task 3 / LOW polish) PR #119 opened = the 3 review-LOW items from #118: server_id full 128-bit uuid4().hex (vs hex[:12]) to avoid _origin-guard collision, Redis trust-boundary comment in _handle_remote_br (Claude Code)
- [2026-06-28 18:39] Claude Code: PR #118 (PR2 architectural) REVIEWED by 2 independent agents (security-reviewer + fastapi-reviewer, both SHIP, 0 blockers) + MERGED to main (squash eaf39d9). Fix A (Redis broadcast self-loopback dedup via _origin stamp) + Fix B (JWT removed (Claude Code)
- [2026-06-28 17:51] Claude Code: Fan-out (3 agents: reviewer/investigator/architect) → completed all 3 follow-up tasks. (1) PR #117 (PR1 quick wins) REVIEWED (code-reviewer: SHIP, 0 issues; found MESSAGE_ACK is dead code on backend) + MERGED to main (squash 58ea66a). (2) P (Claude Code)
- [2026-06-28 16:52] Claude Code: PR #117 opened (branch fix/livechat-followups-pr1-quickwins): PR1 follow-ups = 4 quick wins from PR #116 review — (#2) prune admin_display_names on last disconnect (slow leak + stale-name fix); (#3) memoize onConnectionChange via useCallbac (Claude Code)
- [2026-06-28 15:40] Claude Code: Session COMPLETE: PR #116 (live-chat audit remediation Phases 1-8 — a11y/perf/multi-operator/provider refactor) MERGED to main via squash 07ec9d1, branch deleted. This session = pre-merge review via 3 parallel agents (fastapi/react/security (Claude Code)
- [2026-06-28 15:12] Claude Code: Merged PR #116 (squash 07ec9d1) to main — live-chat audit remediation Phases 1-8 (a11y/perf/multi-operator/provider refactor). This session: pre-merge review via 3 parallel agents (fastapi/react/security) found 3 blockers per-phase reviews  (Claude Code)
- [2026-06-28 14:56] Claude Code: Pre-merge review of PR #116 via 3 parallel agents (fastapi/react/security) + remediated 3 blockers in cbc3064: (1) /admin/users/workload leaked LINE-customer PII to AGENT after auth widened to get_current_staff -> added server-side filter U (Claude Code)
- [2026-06-28 11:06] Claude Code: All 8 live-chat remediation phases DONE + pushed; PR #116 refreshed to cover Phases 1-8 (title+body). Phase 8 this session: 805-line LiveChatContext.tsx -> 395-line composition root + 6 hooks (useMediaQuery/liveChatApi/useMessageFlow/useCha (Claude Code)
- [2026-06-28 10:42] Claude Code: Phase 8 provider refactor DONE — split 805-line LiveChatContext.tsx into a 395-line composition root + 6 hooks (useMediaQuery/liveChatApi/useMessageFlow/useChatRoom/useConversationSync/useLiveChatActions); 34-key contract preserved byte-for (Claude Code)
- [2026-06-28 05:42] Claude Code: Phase 8 plan REFRESHED via 3 ecc reviewers (architect/react/code-reviewer) before implementing — verdict NEEDS-REFRESH-THEN-GO; added a REFRESH addendum to phase-8-provider-refactor.plan.md (commit c400ad8). KEY DRIFT caught (plan written a (Claude Code)
- [2026-06-28 00:48] Claude Code: Phase 7 operator UX (M18/M19/M20/L10) implemented via 5 parallel file-owned agents + 3-expertise review (react/a11y/ts); committed a91f23f. M18 hide manual mode toggle during session + Thai session-aware label; M19 quick-replies(preset) vs  (Claude Code)
- [2026-06-27 21:59] Claude Code: Hardened the 2-client live-chat e2e (Phase 6 acceptance) to a RELIABLE single-run pass on the WSL/9p box via 3 file-owned agents (commit d99a59d). Replaced networkidle (never settles w/ open WS + REST poll) with a deterministic role=listbox (Claude Code)
- [2026-06-27 19:49] Claude Code: Fixed the 2 env blockers from the Phase 6 2-client e2e — BOTH were real bugs (commit 393b22c). (1) WS auth_failed = real bug in frontend/hooks/useWebSocket.ts: 'effectiveToken = isDevMode ? undefined : token' forced the WS token to undefine (Claude Code)
- [2026-06-27 17:48] Claude Code: Live-Chat Phase 6 ACCEPTANCE follow-up (commit 9361fba): (1) CONFIRMED auth relax /admin/users/workload get_current_admin->get_current_staff so AGENT/DIRECTOR/HEAD operators load transfer-picker offline roster (+test_workload_allows_non_adm (Claude Code)
- [2026-06-27 16:29] Claude Code: Implemented Live-Chat Phase 6 (operator UX multi-operator + scoped backend) via 6 parallel file-owned agents in 2 barriered stages (commit 5ef9ff7). H2 searchable operator-picker TransferDialog (presence online + /admin/users/workload offli (Claude Code)
- [2026-06-27 10:50] Claude Code: Implemented Live-Chat Phase 5 (React/Perf Hardening) via 6 parallel file-owned agents (commit 12abb86): M10 component-level ErrorBoundary per panel (ConversationList/ChatArea/CustomerPanel) inside provider + new PanelErrorFallback (one pane (Claude Code)
- [2026-06-27 09:53] Claude Code: Implemented Live-Chat Phase 4 (Motion & Polish) via 1 foundation + 7 parallel file-owned agents (commit 031d67b): W4 new useReducedMotion hook (useSyncExternalStore, SSR-safe) gating ChatArea scrollIntoView + TypingIndicator anim; M2/M11a t (Claude Code)
- [2026-06-27 06:42] Claude Code: Implemented Live-Chat Phase 3 (Design System Unify) via 5 parallel file-owned agents: M1/L4 analytics page rebuilt on design tokens + ds-* utils + Recharts via var(--color-*); M6 CustomerPanel hierarchy (removed 3 dead N/A stat tiles + unus (Claude Code)
- [2026-06-27 05:27] Claude Code: Implemented Live-Chat Phase 2 (A11y Compliance WCAG 2.2 AA) via 5 parallel file-owned agents: H5 new MobileDrawer (role=dialog + focus trap/Escape/restore) wired into LiveChatShell mobile branch; M7 sr-only/option-aria-label presence status (Claude Code)
- [2026-06-27 00:40] Claude Code: Implemented Live-Chat Phase 1 (Quick Wins) via 5 parallel file-owned agents: H1 composer a11y (aria-label/pressed/expanded + aria-hidden SVGs), M4/W5 hit-areas >=24px, H3 memoize Context value, M3 delete dead ChatState (value now 30 keys no (Claude Code)
- [2026-06-26 23:00] Claude Code: Cleared the WSL Playwright system-deps blocker (libnspr4/libnss3/libasound2t64/xvfb + dpkg --configure -a repair); re-bootstrapped the local e2e stack (docker db/redis on Windows host + backend run.py --no-reload + next dev) against the LOC (Claude Code)
- [2026-06-24 22:14] Claude Code: Live-chat remediation — closed 7 plan-review BLOCKERs at document level (commit e1823ad, pushed). Created .claude/PRPs/plans/PLAN-REVIEW-FIXES.md (authoritative errata: B1-B7 + 2 snippet corrections, verified vs live source), expanded PRD F (Claude Code)
- [2026-06-22 07:27] Claude Code: Live-chat console remediation — planning complete (no source changes), branch PUSHED to origin. 5 fan-out workflows: multi-expert audit (37 findings 5H/21M/11L) -> PRD v2 (BLOCKERs B1 backend-dep + B2 WCAG resolved) -> 6-expert PRD review - (Claude Code)
- [2026-06-22 07:15] Claude Code: Live-chat console remediation — planning complete (no source changes). Ran 5 fan-out workflows: multi-expert audit (37 findings: 5H/21M/11L) -> PRD v2 (post-review, BLOCKERs B1 backend-dep + B2 WCAG resolved) -> 6-expert PRD review -> 8 /pr (Claude Code)
- [2026-06-21 21:57] Claude Code: Reviewed + merged PR #115 (handoff-system hardening) to main via merge commit 33729fd. code-reviewer verdict APPROVE (0 CRITICAL / 0 HIGH); fixed the 1 MEDIUM it caught — archive-checkpoints.cjs date cutoff had a month-overflow (Mar 31 - 1m (Claude Code)
- [2026-06-21 20:21] Claude Code: Hardened the .agents handoff system (branch chore/handoff-system-hardening, code commit 8b7f778): (1) fixed the checkpoint timestamp timezone bug — local time now carries the real UTC offset (+07:00) instead of a fake trailing Z; (2) purged (Claude Code)
- [2026-06-21 19:06] Claude Code: Session complete - R1/R2 rich-menu-switching (incl Task 6.2 per-user assignment UI) MERGED to main via PR #114 (merge commit 3a90f4d). Flow: built Task 6.2 (backend read-enrichment user_link_count + friends current-menu; frontend per-row as (Claude Code)
- [2026-06-21 18:22] Claude Code: R1/R2 Phase 6.2 reviewed+polished (PR #114, commits 8ed4196 feat, 2ce0857 selection fix, 7075a25 review feedback): per-user rich menu assignment UI. Retried ecc:fastapi-reviewer + ecc:react-reviewer (1st attempt failed on transient API Conn (Claude Code)
- [2026-06-21 17:33] Claude Code: R1/R2 Phase 6.2 reviewed+fixed (commits 8ed4196 feat, 2ce0857 fix): per-user rich menu assignment UI (per-row modal + bulk toolbar) + user_link_count badge + current-menu column. Self-review (ecc reviewer agents failed on transient API Conn (Claude Code)
- [2026-06-21 16:15] Claude Code: R1/R2 Phase 6.2 done (commit 8ed4196): per-user rich menu assignment UI on friends page - per-row assign modal (single) + checkbox bulk toolbar (bulk-link/bulk-unlink) + current-menu column; user_link_count 'X users' badge on rich-menus lis (Claude Code)
- [2026-06-21 10:56] Claude Code: R1 Phase 6.1 done (commit 3360bbb): alias management UI at /admin/rich-menus/aliases (list + create with alias_id pattern/synced-target validation + per-row re-point PUT + delete ConfirmDialog) and an 'Aliases' link button on the rich-menus (Claude Code)
- [2026-06-21 10:09] Claude Code: R1 Phase 5 done (commit 044b779): richmenuswitch switch-action UI on new+edit rich-menu pages + PUT edit-save fix (PUT /{id} now uses RichMenuUpdate, preserves stored canvas size instead of re-deriving from template_type, fixes latent 422). (Claude Code)
- [2026-06-21 07:41] Claude Code: R1/R2 backend complete: Phase 4 (per-user rich menu link/unlink/bulk service + endpoints, cbf38be) + Phase 7 (delete guard + GET /{id}/dependencies endpoint, c203aac). Full TDD (RED-GREEN) + code/security review. Backend for rich-menu switc (Claude Code)
- [2026-06-21 01:37] Claude Code: R1 Phase 1.2 + Phase 8 done on feat/rich-menu-switching-r1. Phase 1.2 (commit f3084fd): BulkLinkRequest + BulkUnlinkRequest in schemas/rich_menu.py for Phase 4 bulk per-user; userId validated per-element ^U[0-9a-f]{32}$ via LineUserId alias (Claude Code)
- [2026-06-20 23:43] Claude Code: Session close: R1 Rich Menu backend complete through Phase 3 on feat/rich-menu-switching-r1. 1. Fixed local alembic ghost-stamp blocker: alembic_version pinned to non-existent t0u1v2w3x4y5; both alembic stamp and current failed to resolve t (Claude Code)
- [2026-06-20 23:08] Claude Code: R1 Phase 3 done (commit 43205ea): RichMenuService alias methods create_alias_on_line/update_alias_on_line(PUT!)/delete_alias_on_line(404-safe)/list_aliases_from_line (raw httpx, returns .get('aliases',[])). rich_menus.py: GET/POST/PUT/DELET (Claude Code)
- [2026-06-20 22:36] Claude Code: Fixed local alembic ghost-stamp blocker (alembic_version pinned to non-existent t0u1v2w3x4y5; alembic stamp/current both failed to resolve the phantom, so repaired via guarded raw UPDATE -> s9t0u1v2w3x4 real head). KEY: db_target --target l (Claude Code)
- [2026-06-20 21:36] Claude Code: Established WSL bridge (Git Bash -> wsl bash -lc with venv_linux py3.13.12/pydantic2.12.5; files shared via /mnt/d; docker DB reachable) so backend CAN be validated from this Windows session. Implemented R1 Phase 1 on branch feat/rich-menu- (Claude Code)
- [2026-06-20 19:44] Claude Code: 6-agent panel reviewed the rich-menu implementation PLAN (verdict NEEDS_REVISION, confidence 6/10) verifying every snippet vs real code. Applied all 12 edits -> plan REVISED, confidence ~8-9. Caught real bugs I wrote: update_alias must be P (Claude Code)
- [2026-06-20 18:57] Claude Code: Created self-contained PRP implementation plan covering ALL 8 phases of the rich-menu PRD (.claude/PRPs/plans/rich-menu-switching-and-per-user.plan.md). XL complexity, ~22 files, ~16 tasks each with ACTION/IMPLEMENT/MIRROR/IMPORTS/GOTCHA/VA (Claude Code)
- [2026-06-20 18:41] Claude Code: 6-agent panel review of rich-menu PRD (verdict NEEDS_REVISION) then applied all 22 edits -> PRD now REVISED/ready-to-execute. Panel caught + I verified a CRITICAL factual error: PRD wrongly claimed rich-menu endpoints have 'no auth' but ric (Claude Code)
- [2026-06-20 17:38] Claude Code: Investigated rich-menu support + authored PRD. Findings: creating rich menus = fully implemented; tab switching (alias/richmenuswitch) = missing; per-user assignment = missing (only set-default-for-all). Wrote PRD .claude/PRPs/prds/rich-men (Claude Code)
- [2026-06-20 10:37] Claude Code: Merged PR #113 to main (squash d400368): Thai Buddhist-era (พ.ศ.) date pickers across admin + reply-object send (template/text_v2). CalendarPickerTH gained a month grid (year→month→day drill-down) keeping typing + พ.ศ. validation; native da (Claude Code)
- [2026-06-20 08:12] Claude Code: Audit + fix Thai Buddhist-era (พ.ศ.) date input/display across all admin pages. CalendarPickerTH: added month grid (drill-down year→month→day) keeping typing + พ.ศ. validation. Replaced native datepickers with CalendarPickerTH in Reports cu (Claude Code)
- [2026-06-20 06:32] Claude Code: Wire template/text_v2 + quickReply sending: extended build_message_from_object (response_parser.py) so reply objects of type TEMPLATE (buttons/confirm/carousel/image_carousel via TemplateMessage.from_dict) and TEXT_V2 (TextMessage) now send (Claude Code)
- [2026-06-20 00:10] Claude Code: Phase 4 PR2 Phase A complete + PR #110 opened: Reply Objects template/text_v2 enum (uppercase migration verified vs live DB) + per-type payload validation + filter bug fix + LineFlexRenderer (recursive, XSS-safe) + tests (backend 21/full 42 (Claude Code)
- [2026-06-17 06:40] Claude Code: Phase 4 PR2 plan created (Reply Objects full types + LINE-fidelity preview): add template(4 sub-types)+text_v2, Quick reply as modifier, defer Coupon; full flex renderer for preview. Decisions locked with user. PR1 already merged (#109). No (Claude Code)
- [2026-06-17 00:35] Claude Code: Phase 4 PR1 (Chatbot Management Hardening Must-fixes) MERGED via squash (#109, commit d540472) into main; CI all green (Backend Pytest, Frontend Lint/Build, Playwright Smoke). Delivered: broadcast scheduler (in-process asyncio), CSV export  (Claude Code)
- [2026-06-16 23:16] Claude Code: Phase 4 PR1 (Chatbot Management Hardening Must-fixes) IMPLEMENTED + reviewed on branch feat/phase4-pr1-chatbot-hardening (commit 7dffad9). Broadcast scheduler (in-process asyncio), CSV export wiring, rich menu compact 843 fix, 5 broadcast-d (Claude Code)
- [2026-06-16 22:21] Claude Code: Phase 4 PR1 plan created (Chatbot Management Hardening Must-fixes): broadcast scheduler in-process asyncio loop + CSV export wiring + rich menu compact 843 fix + broadcast detail label bug. PRD updated to in-progress; scheduler Open Questio (Claude Code)
- [2026-06-16 21:22] Claude Code: Phase 3 PR2 (frontend matrix UI) complete & merged — PR #108 squash-merged to main (9cc0b0a). Permissions v2 fully shipped: backend enforcement (#107) + module-based matrix UI (#108). New: permission-modules.ts registry mirror + level helpe (Claude Code)
- [2026-06-16 00:21] Claude Code: Phase 3 Permissions v2 PR1 (backend) COMPLETE + pushed as PR #107. Implemented: engine (11 module keys + require_permission factory + capability API in core/permissions.py/deps.py/settings.py), enforcement on 13 endpoint files, alembic seed (Claude Code)
- [2026-06-15 21:52] Claude Code: Phase 3 (Permissions v2 module-based) PLAN-FIRST: recovered git (HEAD lock cleared, on main, deleted merged phase2 branch), branched feat/chatbot-sys-audit-phase3, ran 4 parallel explore agents, wrote full XL implementation plan (.claude/PR (Claude Code)
- [2026-06-14 21:23] Claude Code: Phase 1 complete: wired DIRECTOR/HEAD request access via new get_current_manager gate (closed dead policy where DEFAULT_POLICY granted assign/self-assign but get_current_admin blocked them). Merged PR #105 with green CI (backend 61 tests, f (Claude Code)
- [2026-06-14 17:01] Claude Code: Enhanced handoff-new.cjs to auto-refresh PROJECT_STATUS.md (Last Updated line + prepend one Recent Completions entry) as part of the 1-command handoff, closing the validator freshness WARNING permanently. Fail-open; curated sections untouch (Claude Code)
- [2026-06-14 16:02] Claude Code: Redesigned the handoff system — checkpoints are the single source of truth; `TASK_LOG.md` + `SESSION_INDEX.md` are now **generated** (`gen-handoff-views.cjs`, recovered full ~62-entry history); added `handoff-new.cjs` 1-command scaffold; deleted 11 `.OLD` + legacy `.agents/handoffs/`. (Claude Code)
- [2026-06-14 15:34] Claude Code: Added Stop-hook handoff enforcement (`.agents/scripts/handoff-stop-check.cjs` + local `.claude/settings.json`). Blocks session end once when a fresh handoff checkpoint is missing; verified live. (Task #44) (Claude Code)
- [2026-06-14 12:27] Claude Code: Merged PR #104 (LIFF service-request close/cancel redesign + mobile auto-close fix + provinces CORS fix), PR #103 (cleanup: 9 stale plans + 16 lint warnings), PR #102 (closed configurable-permission-matrix + region-migration PRDs). Recovered handoff log after ~11-day gap — PRs #79–#101 were unlogged; git history on `main` is the source of truth. (Claude Code)
- [2026-06-03 18:30] Claude Code: Merged PR #78 (Undo/Redo, Help System, Error Handling). All CI/CD checks passed. (Claude Code)
- [2026-06-02 01:39] Kimi Code CLI: Applied all P0–P3 critique fixes on `/admin/requests/[id]`. PR #77 merged. (Kimi Code CLI)
- [2026-06-02 00:32] Antigravity: Committed CommandPalette (⌘K launcher), production logger utility. (Antigravity/Cline)
- [2026-05-25 01:00] Claude Code: Implemented PRD E — Drug Reporting. PR #61 merged to main. (Claude Code)

## Backlog (Future)
- [ ] Monitor production deployment via Vercel
- [ ] Address any post-merge feedback or minor UI polish
