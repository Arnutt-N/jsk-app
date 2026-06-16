# Project Status: SknApp

> **Last Updated:** 2026-06-17 06:40 by Claude Code (Phase 4 PR2 plan created Reply Objects full types + LINE-fidelity preview: add template4 s)

## Thai Summary
แผนการปรับปรุง UX และ Error Handling **เสร็จสมบูรณ์ 100%** — ฟีเจอร์ Undo/Redo, Help System และ Error Handling ใหม่ถูก merge เข้าสู่ main แล้ว
- ขั้นตอนถัดไป: ตรวจสอบการ deploy บน Vercel และจัดการ feedback หลัง merge

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
- **Task History:** `.agents/state/TASK_LOG.md` (**APPEND-ONLY - all tasks from all agents**)
- **Session Index:** `.agents/state/SESSION_INDEX.md` (**Cross-platform summary index**)

## Technical Environment (Critical)
- OS: Windows host + WSL2 required
- Backend: run in WSL using `backend/venv_linux`
- Frontend: run in WSL
- Database: PostgreSQL + Redis

## Active Milestones

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
- [2026-06-03] All changes from PR #78 merged to `main`. Branch `feat/undo-redo-help-error-handling` is ready for deletion.

## Recent Completions
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
