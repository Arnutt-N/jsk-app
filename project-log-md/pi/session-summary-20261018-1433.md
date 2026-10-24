# Session Summary — pi — 2026-10-18T14:33:00+07:00

**Branch**: `main`  **HEAD**: `e305389` (Merge PR #268)
**Checkpoint**: `.agents/state/checkpoints/handover-pi-20261018-1433.json`
**Work branch**: `fix/rich-menu-show-expanded` (2 commits: `a9eaaa6`, `c74ee3d`, `9158e37`)

## Objective
Fix: admin sets rich menu to "show always" but LINE kept showing it collapsed.
Merged PR #268: display_mode now drives LINE `selected` (ALWAYS/SCHEDULED expand, MANUAL collapsed).

## Completed
- `why` investigation (source-control evidence): PUT/POST hardcoded `selected: False`
  since `7bf64078` (empty body, no PR); `_config_projection` (PR #220) dropped
  `selected`; PR #221 defined ALWAYS as default-menu only; edit-page publish gate
  read a stale pre-save status. Full report in chat 2026-10-18.
- User-supplied LINE docs confirmed: `selected=true` = auto-open expanded.
- PRD + plan: `PRPs/2026-10-18-rich-menu-selected-true.{prd,plan}.md`.
- Code: `selected_for_display_mode()` single writer (schemas); PUT+POST derive it
  (endpoints); projection includes `selected` (service); edit page always
  re-ensures default for ALWAYS + `preSaveMenu` snapshot naming (frontend).
- Tests: backend 28 passed (new `test_rich_menu_selected.py`), frontend
  rich-menu 51 passed (new ALWAYS+PUBLISHED regression test), tsc clean.
- Reviews: `no-comments` (7 DELETE/3 KEEP triaged) + branch `comment-sicko` sweep
  (1 DELETE + MUST KILL encoded as `preSaveMenu`); `deslop` (1 blank-line fix).
- Blast-radius writeup with run proof (incl. pinned `line-bot-sdk==3.21.0`
  `RichMenuResponse.selected` required → no perpetual drift).
- Babysat PR #268 to green (Backend Pytest, Frontend Lint+Build, Playwright Smoke
  SUCCESS; 0 unresolved threads) and merged to `main`; local `main` pulled.

## Next Steps
- Manual phone test: edit old ALWAYS menu, save-and-sync, verify expanded on LINE.
- Press sync again, expect no-op Already synced (no perpetual drift).

## Blockers
- _none_

> Iron Rules (2026-10-13): no key/token/secret material touched or printed in this session.

> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.
