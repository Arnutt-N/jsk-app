# Session Summary — claude_code — 2026-06-20T18:41:00Z

**Branch**: `main`  **HEAD**: `a8cf662`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260620-1841.json`

## Objective
รีวิว PRD rich-menu (`.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md`) ด้วยทีมผู้เชี่ยวชาญหลายสาขา (option A) แล้วแก้ตามผล + อุดต้นตอ skill เก่า (option C)

## Completed
- **Multi-agent review (Workflow):** คณะ 6 มุมมอง (PM / Backend Architect / LINE API Expert / Security / Frontend-UX / Completeness Critic) รันคู่ขนาน (reviewers=Sonnet) → สังเคราะห์ (Opus). ~575k tokens, 7 agents. Verdict: **NEEDS_REVISION**
- **3 CRITICAL ที่จับได้:**
  1. PRD อ้างผิดว่า endpoint "no auth" — **ผม grep ยืนยันแล้วว่าผิด**: `rich_menus.py` มี auth ครบ (`get_current_admin` reads :43,48,181 / `require_permission(KEY_MANAGE_RICH_MENUS)` writes :56,83,111,145,189,205; permissions.py = SUPER_ADMIN+ADMIN). ต้นเหตุ = skill rule #10 เก่า
  2. `richmenuswitch.data` = optional ไม่ใช่ required → validator ต้อง require เฉพาะ `richMenuAliasId`
  3. alias chicken-and-egg ใน UX flow (Phase 5) ยังไม่แก้
- **A) แก้ PRD ครบ 22 edits** — เขียนใหม่ทั้งฉบับ (3 CRITICAL + 6 HIGH + 6 MED + 3 LOW), เพิ่ม Release Sequencing (R1/R2), Review History, Data Model (FK RESTRICT, sync_status:str), guards (synced 409 / IDOR 404 / format 422), rate-limit fix (delete alias 100/hr), route-ordering note, Alembic downgrade, 2-tier success metrics → Status: **REVISED, ready-to-execute**
- **C) แก้ skill `skn-rich-menu-builder` rule #10** — จาก "no auth for now" → ระบุ auth จริง + บอกว่า endpoint ใหม่ต้องใส่ `require_permission(KEY_MANAGE_RICH_MENUS)`
- บันทึก memory `project_richmenu_auth_skill_stale` (กัน session หน้าเชื่อ skill ผิด)

## Files Changed
- `.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md` (revised, full rewrite)
- `.claude/skills/skn-rich-menu-builder/SKILL.md` (rule #10 corrected)
- memory (outside repo): `project_richmenu_auth_skill_stale.md` + MEMORY.md index

## Next Steps
- Break revised PRD into implementation plan under `.claude/PRPs/plans/` (consider R1=Feature A / R2=Feature B split)
- Start Phase 1: `RichMenuAreaAction` schema — add `richMenuAliasId` + action-type enum + validator (aliasId required, data optional) + alias_id/userId format validators
- Phase 2: create `rich_menu_aliases` + `user_rich_menu_links` tables (FK ondelete=RESTRICT, sync_status:str) with tested upgrade AND downgrade migration

## Blockers
- _none_ (E2E later needs a real test LINE OA + token + device — flagged in PRD Phase 8 pre-condition)

## Context to Load (next session)
- `.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md` (the revised PRD)
- `backend/app/schemas/rich_menu.py` (Phase 1), `backend/app/models/rich_menu.py` (Phase 2 pattern)
- `backend/app/api/v1/endpoints/rich_menus.py` (auth pattern reference)
- skills: `skn-rich-menu-builder` (updated), `skn-rich-menu-frontend`
