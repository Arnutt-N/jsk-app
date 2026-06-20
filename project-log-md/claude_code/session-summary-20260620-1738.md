# Session Summary — claude_code — 2026-06-20T17:38:00Z

**Branch**: `main`  **HEAD**: `d998a73`
**Checkpoint**: `.agents/state/checkpoints/handover-claude_code-20260620-1738.json`

## Objective
ตรวจสอบว่าระบบ Rich Menu ของ jsk-app รองรับ (1) การสร้างริชเมนู (2) การสลับเมนู (tab switching) (3) การกำหนดเมนูตามผู้ใช้ (per-user) หรือยัง — ถ้ายังไม่มี ให้เขียน PRD

## Completed
- **สำรวจโค้ดจริงด้วย Explore agents (backend + frontend คู่ขนาน)** ได้ผล evidence-based:

  | ความสามารถ | สถานะ | หลักฐาน |
  |---|---|---|
  | สร้าง rich menu | ✅ มีครบ | `rich_menus.py:42-224` (9 endpoints), `rich_menu_service.py:23-205` (9 methods) — create→sync→upload→publish |
  | สลับเมนู (tab switching) | ❌ ไม่มี | ไม่มี `RichMenuAlias` model/migration/endpoint; `schemas/rich_menu.py:24-30` action `type:str` ไม่มี enum + ขาดฟิลด์ `richMenuAliasId`; frontend dropdown มีแค่ uri/message (`new/page.tsx:440-447`) |
  | per-user | ❌ ไม่มี | มีแค่ `set_default_on_line()` → `POST /user/all/richmenu` (`rich_menu_service.py:50-59`); ไม่มี link-to-user/bulk/mapping table/UI |

- **เขียน PRD:** `.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md`
  - ครอบคลุม 2 ฟีเจอร์: A) Tab switching (alias + richmenuswitch)  B) Per-user assignment
  - ตารางใหม่ 2 ตาราง (cache): `rich_menu_aliases`, `user_rich_menu_links` (LINE ไม่มี API list-all per-user)
  - แก้ช่องโหว่ schema: เพิ่ม `richMenuAliasId` + enum validation (ปิดบั๊ก richmenuswitch "พังเงียบ")
  - 8 phases, MoSCoW, Risks, Decisions Log, อิง LINE API spec ที่ user ส่งมา + file:line จากโค้ด

## Key Findings / Decisions
- **บั๊กที่มีอยู่:** ใส่ `type:"richmenuswitch"` ได้โดยไม่ error แต่ส่งไป LINE จะใช้ไม่ได้ (payload ขาด `richMenuAliasId`) → PRD Phase 1 แก้ก่อน เสี่ยงต่ำ
- **LINE display priority:** per-user (API) > default (API) > default (OA Manager) — per-user ทับ default
- **endpoint rich menu ปัจจุบันไม่มี auth** (`# no auth for now` ใน api.py) → PRD แนะนำเพิ่ม `get_current_admin`
- คง pattern เดิม: RichMenuService = raw httpx + token จาก DB (ห้ามใช้ line_service)

## Next Steps
- Review/refine PRD — resolve Open Questions (endpoint auth, per-user targeting scope รายคน vs segment, live-chat auto-switch)
- Break PRD into implementation plan under `.claude/PRPs/plans/`
- Start Phase 1: fix `RichMenuAreaAction` schema — add `richMenuAliasId` field + action-type enum validation (closes silent richmenuswitch bug)

## Blockers
- _none_

## Context to Load (next session)
- `.claude/PRPs/prds/rich-menu-switching-and-per-user.prd.md` (the PRD)
- `backend/app/schemas/rich_menu.py` (Phase 1 target)
- `backend/app/services/rich_menu_service.py`, `backend/app/models/rich_menu.py`
- skills: `skn-rich-menu-builder`, `skn-rich-menu-frontend`
