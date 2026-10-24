# PRD — Rich menu "show expanded always" (selected=true)

## Problem
Admin sets a rich menu to "show always" (display_mode ALWAYS), saves and syncs,
but LINE still shows it collapsed (chat bar only, tap to open). User-tested on
edit-save-sync of an existing menu.

## Root cause (why-investigation 2026-10-18, source-control evidence)
- `PUT /{id}` (`rich_menus.py:563`) and `POST` (`:594`) hardcode
  `"selected": False`. Born in `7bf64078` (2026-01-24, empty body, no PR),
  ~7 months before display modes. Never set to True anywhere in history.
- `_config_projection` (`rich_menu_service.py:462-473`, PR #220) deliberately
  drops `selected` ("purely local"), and `_needs_recreate` enumerates only
  size/name/chatBarText/areas — so an expanded-vs-collapsed difference can
  never trigger a recreate.
- PR #221 defines ALWAYS as "set as default menu immediately" (default-menu),
  never equated with expanded. Publish = `set_default_on_line` only.
- Edit-page save-and-sync gate (`edit/page.tsx:250-254`) publishes only when
  `displayMode === ALWAYS && menu?.status !== 'PUBLISHED'` — reads the
  pre-save snapshot, so an already-PUBLISHED menu skips re-publish. Create page
  (`new/page.tsx:402-403`) publishes unconditionally. Asymmetry born same
  commit `ff8bae81`.

## LINE spec (user-supplied docs 2026-10-18)
- `selected: true` = "automatically open a rich menu linked to a user".
- `selected: false` = displayed in a closed state, tap chat-bar text to open.
- Default rich menu (`POST /user/all/richmenu/{id}`) controls WHICH menu shows,
  `selected` controls WHETHER it opens expanded. Both are needed for "show
  always expanded".

## Decision
`display_mode` drives `selected` on LINE (per LINE docs: `selected=true`
= auto-open expanded, `false` = closed bar). `ALWAYS` and `SCHEDULED` save with
`selected=true`; `MANUAL` saves with `false`. No new column, no migration:
`selected` already lives inside `config` JSON; the writer derives it from
`display_mode` on every save. The SCHEDULED scheduler needs no change — the
stored copy is already expanded, the scheduler only moves/cancels the
default (show = default on expanded copy, hide = default cancelled).

## Acceptance criteria
- AC1: Create with ALWAYS or SCHEDULED produces `config.selected == True`;
  MANUAL produces `False`. (SCHEDULED is expanded from birth; the scheduler
  only moves/cancels the default to show/hide it.)
- AC2: PUT edit changing only display_mode MANUAL->ALWAYS flips
  `config.selected` False->True, flags PENDING, and the next sync recreates on
  LINE with `selected=true`.
- AC3: Sync drift detection includes `selected`: a local True vs LINE False
  triggers recreate (projection covers it).
- AC4: Edit-page save-and-sync on an ALWAYS menu (already PUBLISHED or not)
  ends with the menu as LINE default AND `selected=true` on LINE — no silent
  skip from a stale status snapshot.
- AC5: Existing PUBLISHED ALWAYS menus (stored `selected=False`) heal on next
  save+sync without manual LINE work.
- AC6: Backend suite green; edit/new page Vitest suites green.
