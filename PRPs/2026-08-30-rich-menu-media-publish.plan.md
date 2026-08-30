# PRP: Rich Menu Preview & Publish — Implementation Plan

**Created:** 2026-08-30
**Status:** Approved for implementation
**Branch:** `fix/rich-menu-media-publish`
**PRD:** `PRPs/2026-08-30-rich-menu-media-publish.prd.md`

---

## Ground rules

- Each phase lands with its own validation green before the next starts.
- Tests are written alongside the phase they cover (Phase 5 files are created in
  the same commit as the code they pin).
- No new env flags; rollback = revert PR or `alembic downgrade -1`.

## Phase 0 — Branch + documents (DONE)

- [x] Branch `fix/rich-menu-media-publish`
- [x] PRD + PRP written; agent review 2026-08-30 verdict **READY-WITH-FIXES**
      (9 findings — all folded into this plan + PRD); approved

## Phase 1 — Schema + model + response schema

**Files:**
- `backend/alembic/versions/s0t1u2v3w4x5_rich_menu_image_media.py` (new)
  - `down_revision = "r9s0t1u2v3w4"` (verified sole head)
  - Add `rich_menus.image_media_id` (UUID, nullable, FK → `media_files.id`,
    `ondelete="SET NULL"`)
  - Backfill (best-effort, online): for every row with non-null `image_path`,
    read the file from disk — **resolve path relative to the migration file**
    (`Path(__file__).resolve().parents[2] / "uploads" / "rich_menus" / basename`,
    mirroring `main.py:204-210`'s two-location fallback, NOT CWD — old code at
    `rich_menus.py:47` was CWD-relative but `db_target.py:31-33` runs alembic
    with `cwd=BACKEND_DIR` so both resolve to `backend/uploads/rich_menus/`
    locally; the file-relative form also works if migration runs from
    elsewhere). If the file exists, insert a `media_files` row (filename from
    the stored basename, mime from extension `.png`→image/png else
    image/jpeg, size, data, category `IMAGE`) and set `image_media_id`.
    Missing file → leave null (Koyeb ephemeral FS case). Local dir is
    currently empty → local backfill is a no-op.
  - Drop `rich_menus.image_path`
  - Downgrade: re-add `image_path`, write files back from `media_files.data`
    best-effort (path `uploads/rich_menus/{menu_id}_{filename}`), drop FK column.
- `backend/app/models/rich_menu.py` — replace `image_path` with
  `image_media_id` (UUID FK) + `image_media` relationship with
  `passive_deletes=True` (the DB-side `SET NULL` owns nulling the FK; the ORM
  never fights it)
- `backend/app/schemas/rich_menu.py` — `RichMenuResponse.image_path` →
  `image_url: Optional[str] = None` (**default None — a bare `Optional[str]`
  is still required in Pydantic v2 and would 500 every response missing it**)

**Validation:** `alembic upgrade head` then `downgrade -1` then `upgrade head`
against local Postgres (`python scripts/db_target.py alembic --target local ...`).
Migration test in this suite is STRUCTURAL (repo precedent:
`test_booking_migration.py:1-9` only loads the file and asserts
revision/down_revision/columns) — no live-DB round-trip machinery exists here,
so the real round-trip is this phase's manual validation step.

## Phase 2 — Backend endpoints (images into media pipeline)

**File:** `backend/app/api/v1/endpoints/rich_menus.py`
- Delete `UPLOAD_DIR`, `os.makedirs`, `_write_upload_sync`, `_read_file_sync`.
- `POST /{id}/upload` (`L555-596`):
  - Validate FIRST: mime ∈ {image/png, image/jpeg} → 422 otherwise;
    ≤ 10 MB → 413 otherwise (mirror media.py limits). Only then create the row.
  - Create `MediaFile(filename, mime_type, data, size_bytes,
    category=FileCategory.IMAGE)`; replace previous row if any (delete old).
  - Set `rich_menu.image_media_id`; if `line_rich_menu_id` exists, still push to
    LINE immediately — on push failure the media row SURVIVES (commit anyway,
    same semantics as today's `L591-593`) and the error is raised as 400 with a
    clear message.
- `POST /{id}/sync` (`L598-632`): read bytes from `MediaFile.data`; on LINE
  image-upload failure call
  `RichMenuService.update_sync_status(db, menu, "FAILED", "...")` AND include
  `image_upload_error` in the response (stop swallowing).
  **Trap noted:** the endpoint's local `rich_menu` object is stale after
  `sync_with_idempotency`'s internal commit/refresh (`rich_menu_service.py:353`
  refreshes its own copy) — the endpoint must re-fetch the menu before calling
  `update_sync_status` (in tests `_SeqDB` has no identity map, so relying on
  session identity would silently skip the write).
- `DELETE /{id}` (`L660-703`): delete via the `image_media` relationship
  (passive_deletes means the DB handles the FK NULL; delete the menu first,
  then the media row); remove `os.remove`.
- List (`L74-93`): after `model_validate`, set
  `item.image_url = f"/api/v1/media/{menu.image_media_id}"` when media exists.
- Get-single (`L491-497`): **currently returns the ORM object directly —
  restructure to `model_validate` + set `image_url`** (the response model now
  has `image_url`, and FastAPI validating an ORM object can't populate it).

**Validation:** pytest for upload/replace/reject/delete-image (new file, Phase 5
patterns); update fixtures that reference `image_path`:
`test_rich_menu_delete_guard.py:98`, `test_rich_menu_list_user_count.py:57`,
`test_rich_menu_update_endpoint.py:93`.

## Phase 3 — Publish hardening (verify-then-act)

**Files:**
- `backend/app/services/rich_menu_service.py`:
  - `get_client_headers` (`L23-29`): empty token → raise
    `RuntimeError("LINE channel access token is not configured")` (fail fast;
    improves every method's message — callers map it to their existing
    error codes: publish → 503 (below), sync/alias → existing 400 wraps with
    this clear message).
  - Add helper `_line_error_detail(e: httpx.HTTPStatusError) -> str` parsing
    `e.response.text` JSON (`message`/`details`) with plain-text fallback.
- `backend/app/api/v1/endpoints/rich_menus.py` — `POST /{id}/publish`
  (`L642-658`) becomes:
  1. Menu exists (404) — unchanged.
  2. No `line_rich_menu_id` → 409 (unchanged).
  3. Token empty → **503** config message (idiom from `liff.py:26`).
  4. `RichMenuService.get_from_line(...)` returns None → **409** structured
     detail `{"message": "เมนูนี้ถูกลบจาก LINE แล้ว กรุณากด Sync เพื่อสร้างใหม่ก่อนตั้งค่า"}`;
     set `sync_status=FAILED, last_sync_error` via `update_sync_status`.
  5. `set_default_on_line` failure → `httpx.HTTPStatusError` → **502** with
     `_line_error_detail(e)`; keep 400/500 path for unexpected exceptions but
     with clearer message.

**Validation:** pytest publish matrix: 409 not-synced / 409 stale-on-LINE / 503
empty-token / 502 upstream-reject / success marks PUBLISHED.

## Phase 4 — Frontend

**Files:**
- `frontend/app/admin/rich-menus/page.tsx`:
  - `RichMenu` interface: `image_path` → `image_url: string | null`;
    delete `getImageUrl`; `<img src={menu.image_url}>`.
  - Badge/buttons from real state: "Set Active" only when
    `line_rich_menu_id && sync_status === 'SYNCED'`; `sync_status === 'FAILED'`
    → red badge + "Sync" button; surface `last_sync_error` as title/tooltip.
  - `handleSync`: parse body — `success === false` or `image_upload_error`
    present → error toast with message (today only `res.ok` is checked).
  - `handlePublish`: rely on `readErrorMessage` for 409/502/503 bodies.
- `frontend/app/admin/rich-menus/new/page.tsx`:
  - Same `handleSave` sync-result check (it has the identical `res.ok`-only bug
    at `L344-349` — a 200-with-`success:false` shows a success toast today).
- `frontend/app/admin/rich-menus/[id]/edit/page.tsx`:
  - Interface `image_path` → `image_url`; preview from `data.image_url`.
  - On upload failure inside `handleSave`: show error toast and stay on page
    (today it swallows and redirects).

**Validation:** vitest for gating/toast/URL usage; `npm run lint`;
`npm run test:unit`; `npm run build`.

## Phase 5 — Tests (written with their phase; summarized here)

- `backend/tests/test_rich_menu_image_media.py` (new):
  - upload creates MediaFile + sets `image_media_id`; replaces old row;
    rejects non-PNG/JPEG (422); over-10MB (413); row survives a failed LINE push
  - sync reads from `MediaFile.data`; LINE image failure → `sync_status=FAILED`
    + `last_sync_error` set + `image_upload_error` in response (endpoint
    re-fetches the menu first — `_SeqDB` has no identity map)
  - delete menu deletes its MediaFile row
  - publish matrix (Phase 3 cases)
  - list/get populate `image_url` (get-single goes through `model_validate`)
  - Reuse `FakeResp`/`_make_client`/`_patches` (extend `FakeResp` response with
    `.text`) from `test_rich_menu_alias_service.py:13-67` /
    `test_rich_menu_peruser_service.py:23-77`, and `_SeqDB`/
    `dependency_overrides` from `test_rich_menu_alias_endpoints.py` /
    `test_rich_menu_delete_guard.py`.
- Migration: STRUCTURAL test (repo precedent `test_booking_migration.py:1-9`) —
  load the migration module, assert `down_revision == "r9s0t1u2v3w4"`, the
  upgrade adds `image_media_id` + drops `image_path`, downgrade reverses.
  The live upgrade/downgrade/upgrade round-trip is Phase 1's manual validation.
- Fixture updates (same commit): `test_rich_menu_delete_guard.py:98`,
  `test_rich_menu_list_user_count.py:57`, `test_rich_menu_update_endpoint.py:93`
  (`image_path` → removed/replaced).
- Frontend: `frontend/app/admin/rich-menus/__tests__/page.test.tsx` — badge/button
  gating by `sync_status`, sync error toast, `<img>` uses `image_url`.

## Phase 6 — Verification + ship

1. `docker-compose up -d db redis` → `python -m pytest`
2. `npm run lint && npm run test:unit && npm run build`
3. Manual local flow: create menu → upload image → preview renders in list +
   edit → sync → Set Active succeeds.
4. PR → CI green → merge (`gh pr merge` per repo policy) → CD deploy → prod
   smoke: preview loads; Set Active on a real menu succeeds.
5. Handoff via `node .agents/scripts/handoff-new.cjs`.

## Risk register

| Risk | Mitigation |
|---|---|
| Backfill on large images slows migration | Rich-menu images are 100-500 KB; bounded by table size; run in one transaction per row, log skips |
| Old rows on prod with missing files | Accepted in PRD review: "No Image" + one-time re-upload |
| Pydantic v2: bare `Optional[str]` is required, not optional | `image_url: Optional[str] = None` (default) in the schema; get-single restructured to `model_validate` |
| Stale `rich_menu` object after service-internal commit | Endpoint re-fetches before `update_sync_status`; tests use `_SeqDB` (no identity map) so this is load-bearing |
| `_SeqDB` tests touching removed `image_path` | Three fixtures updated in the same commit (delete_guard:98, list_user_count:57, update_endpoint:93); grep `image_path` across backend/frontend before commit |
| Frontend tests assert old URL builder | Delete `getImageUrl` assertions; new tests assert `image_url` passthrough |
| Stale agent docs (`image_path` references) | Out of PR scope by review decision; tracked as follow-up (`skn-rich-menu-*` skills, image-generator PRD metrics) |