# PRP — Rich Menu: recreate-on-drift sync + edit-page action parity

PRD: `PRPs/2026-09-02-rich-menu-edit-sync.prd.md` · Branch: `fix/rich-menu-edit-sync`

## Phases

### Phase 1 — Backend: drift detection + recreate flow

Files: `backend/app/services/rich_menu_service.py`,
`backend/app/api/v1/endpoints/rich_menus.py`

1. `RichMenuService._line_menu_config(line_menu) -> dict` — project LINE's copy
   to `{size, name, chatBarText, areas}` for comparison.
2. `RichMenuService._local_config_projection(config) -> dict` — same projection
   for the stored config (ignores `selected` + extras).
3. `RichMenuService._needs_recreate(rich_menu, line_menu) -> bool` — projection
   mismatch or `sync_status == PENDING`.
4. `RichMenuService._recreate_on_line(db, rich_menu) -> dict` — the 7-step flow
   from the PRD (create → image → aliases → user re-links (batch 500) → default
   → delete old → persist). New helper `_relink_users(db, rich_menu, new_line_id)`
   using `decrypt_line_ids_for_users` + `bulk_link`; returns warnings list.
   Hard failures raise `RuntimeError` with readable detail (caller maps to
   FAILED); old-menu delete is warning-only.
5. `sync_with_idempotency`: existing `line_menu` lookup now feeds
   `_needs_recreate`; no-drift → current green return; drift → `_recreate_on_line`
   (result carries `recreated: true` + `warnings: [...]`).
6. `PUT /{id}` (`update_rich_menu`): compute new line_config first; if
   `line_rich_menu_id` and new != stored → `sync_status = PENDING`.
7. `POST /{id}/upload`: when push returns already-uploaded on a menu that already
   had a stored image → `sync_status = PENDING` (response keeps
   `already_uploaded: true`).

Validation: `python -m pytest tests/test_rich_menu_edit_recreate.py -v` then the
full rich-menu suite.

### Phase 2 — Backend tests

File: `backend/tests/test_rich_menu_edit_recreate.py` (new; `_SeqDB`/`_override`
patterns + httpx/AsyncMock patches from `test_rich_menu_image_media.py`).

Matrix per PRD §Test plan. Also update `tests/test_rich_menu_update_endpoint.py`
if PUT PENDING assertions change.

### Phase 3 — Frontend: edit-page action parity

Files: `frontend/app/admin/rich-menus/[id]/edit/page.tsx`, its `__tests__/page.test.tsx`,
`frontend/lib/rich-menu.ts` (if badge helper shared), list page badge if the
PENDING state needs it there too (`app/admin/rich-menus/page.tsx`).

1. Split `handleSave(andSync: boolean)`:
   - draft: PUT (+ upload if imageFile) → toast per PRD → `fetchMenu()` (stay).
   - sync: PUT (+ upload) → POST sync → `parseSyncResult` → recreated-aware
     toast → `fetchMenu()` (stay).
2. Action bar: [state cluster] ... [ยกเลอก] [บันทึกฉบับร่าง] [บันทึกและซิงค์].
3. Badge adds รอซิงค์ (amber) for `line_rich_menu_id && PENDING`.
4. Sync response typing: extend `SyncResultPayload` with `recreated?: boolean`.

Validation: `npm run test:unit -- rich-menu`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`.

### Phase 4 — Docs + ship

- PRD/PRP already in tree; commit everything; push; PR to `main` with PRD link.
- CI must be green (Pytest, Lint+Build, Playwright).

## Risks / notes

- Line-id pseudonymization: re-link uses `decrypt_line_ids_for_users`; users
  with no stored encrypted id are skipped + warned (never abort the whole sync
  for one unresolvable user).
- Migration: **none** (no schema change in this PR).
- Rollback: revert PR; sync returns to no-op-on-existing (pre-fix behavior) —
  no data model dependency.
