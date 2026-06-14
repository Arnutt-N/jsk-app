# Project Status: SknApp

> **Last Updated:** 2026-06-14 12:27 by Claude Code (PRs #102, #103, #104 merged to main `2e8fab5`)

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
- [2026-06-14 12:27] Claude Code: Merged PR #104 (LIFF service-request close/cancel redesign + mobile auto-close fix + provinces CORS fix), PR #103 (cleanup: 9 stale plans + 16 lint warnings), PR #102 (closed configurable-permission-matrix + region-migration PRDs). Recovered handoff log after ~11-day gap — PRs #79–#101 were unlogged; git history on `main` is the source of truth. (Claude Code)
- [2026-06-03 18:30] Claude Code: Merged PR #78 (Undo/Redo, Help System, Error Handling). All CI/CD checks passed. (Claude Code)
- [2026-06-02 01:39] Kimi Code CLI: Applied all P0–P3 critique fixes on `/admin/requests/[id]`. PR #77 merged. (Kimi Code CLI)
- [2026-06-02 00:32] Antigravity: Committed CommandPalette (⌘K launcher), production logger utility. (Antigravity/Cline)
- [2026-05-25 01:00] Claude Code: Implemented PRD E — Drug Reporting. PR #61 merged to main. (Claude Code)

## Backlog (Future)
- [ ] Monitor production deployment via Vercel
- [ ] Address any post-merge feedback or minor UI polish
