# PRP plan — Rich menu selected=true (show expanded always)

## Files to change (4 code + tests)
1. `backend/app/schemas/rich_menu.py`
   - Add helper `selected_for_display_mode(display_mode) -> bool`
     (`True` for ALWAYS and SCHEDULED, `False` for MANUAL). Single writer,
     both endpoints use it.
2. `backend/app/api/v1/endpoints/rich_menus.py`
   - `create_rich_menu`: `selected = selected_for_display_mode(data.display_mode)`.
   - `update_rich_menu`: same derivation AFTER `data.apply_to` intent is known
     (derive from `data.display_mode`, not the stale row). PENDING compare
     stays as-is (now meaningful: False->True drift flags PENDING).
3. `backend/app/services/rich_menu_service.py`
   - `_config_projection`: include `"selected"`.
   - `_needs_recreate` docstring: add selected to the immutable set.
   - Scheduler: NO CHANGE (stored SCHEDULED copies are already expanded;
     activate/expire only move/cancel the default).
4. `frontend/app/admin/rich-menus/[id]/edit/page.tsx`
   - Replace stale gate `displayMode===ALWAYS && menu?.status!=='PUBLISHED'`
     with `displayMode===ALWAYS` (always ensure default after ok sync),
     treating publish-409/400 as warning toast, not silent skip.
   - Keep create page (`new/page.tsx:402`) as-is (already unconditional).

## Tests
- Backend: extend `test_rich_menu_display_schedule.py` (or new
  `test_rich_menu_selected.py`): create ALWAYS->True, MANUAL->False; PUT
  MANUAL->ALWAYS flips + PENDING; projection includes selected
  (local True vs LINE False => `_needs_recreate` True).
- Frontend: extend `edit/__tests__/page.test.tsx`: save-and-sync on ALWAYS +
  `status:PUBLISHED` still calls publish (AC4 regression).
- Existing fixtures hardcoding `"selected": False`
  (`test_rich_menu_edit_recreate.py:52`,
  `test_rich_menu_display_scheduler_db.py:86`) stay valid only for
  MANUAL-mode menus — update helpers to pass explicit display_mode or expect
  True for ALWAYS.

## Validation
- `cd backend && python -m pytest tests/test_rich_menu_display_schedule.py tests/test_rich_menu_edit_recreate.py -q`
- `cd frontend && npm run test:unit -- rich-menu` (vitest)
- Manual: edit menu -> ALWAYS -> save-and-sync -> LINE shows expanded;
  MANUAL stays collapsed bar.

## Risks / notes
- `set_default` is idempotent: extra publish after no-op sync is harmless.
- SCHEDULED mid-window flip needs scheduler recreate to carry selected=True;
  out of scope if activate only sets default — flag in review.
- No migration: old rows heal on next save+sync (False->True drift).
