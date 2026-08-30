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
- No new env flags; rollback = revert PR (migration is additive-only, so the
  downgrade is optional — see PRD §5).

## Phase 0 — Branch + documents (DONE)

- [x] Branch `fix/rich-menu-media-publish`
- [x] PRD + PRP written; agent review 2026-08-30 verdict **READY-WITH-FIXES**
      (9 findings — all folded into this plan + PRD); approved

## Phase 1 — Schema + model + response schema

**Files:**
- `backend/alembic/versions/s0t1u2v3w4x5_rich_menu_image_media.py` (new)
  - `down_revision = "r9s0t1u2v3w4"` (verified sole head)
  - **Additive only (expand-contract, revised after senior review):** add
    `rich_menus.image_media_id` (UUID, nullable, FK → `media_files.id`,
    `ondelete="SET NULL"`). `image_path` is NOT dropped in this PR — CD
    applies migrations before deploying (`cd.yml:247,269-273`) and Koyeb
    rolls instances, so a same-PR drop would 500 the old code mid-rollout.
    The drop is a follow-up PR (repo precedent: PR C's staged drop,
    `q8r9s0t1u2v3`).
  - Backfill (best-effort, online): for every row with non-null `image_path`,
    read the file from disk — **resolve path relative to the migration file**
    (`Path(__file__).resolve().parents[2] / "uploads" / "rich_menus" /
    os.path.basename(stored_path)` — basename also neutralizes any tampered
    `../` in stored values), mirroring `main.py:204-210`'s two-location
    fallback, NOT CWD. If the file exists, insert a `media_files` row
    (filename from the stored basename, mime from extension `.png`→image/png
    else image/jpeg, size, data, category `IMAGE`) and set `image_media_id`.
    Missing file → leave null (Koyeb ephemeral FS case). Local dir is
    currently empty → local backfill is a no-op.
  - Downgrade: drop `image_media_id` (pure reverse; `image_path` untouched —
    no file write-back needed since this PR never removes it).
- `backend/app/models/rich_menu.py`:
  - Add `image_media_id` (UUID FK column attribute). **No relationship** —
    async code must never traverse it (`MissingGreenlet`); endpoints select
    `MediaFile` explicitly by FK id. (Review correction: `passive_deletes` on
    a many-to-one is a no-op — dropped from the plan; the DB-side SET NULL
    owns nulling when a media row is deleted from the files page.)
  - Remove the `image_path` attribute from the model (DB column stays until
    the follow-up PR; SQLAlchemy simply stops selecting it — old code during
    rollout still sees the column).
  - Add `class RichMenuSyncStatus(str, Enum): PENDING/SYNCED/FAILED`
    (AGENTS.md enum rule; the DB column stays String, `native_enum=False`).
- `backend/app/schemas/rich_menu.py` — `RichMenuResponse.image_path` →
  `image_url: Optional[str] = None` (**default None — a bare `Optional[str]`
  is still required in Pydantic v2 and would 500 every response missing it**)

**Validation:** `alembic upgrade head` then `downgrade -1` then `upgrade head`
against local Postgres (`python scripts/db_target.py alembic --target local ...`).
Migration test in this suite is STRUCTURAL (repo precedent:
`test_booking_migration.py:1-9` only loads the file and asserts
revision/down_revision/columns) — no live-DB round-trip machinery exists here,
so the real round-trip is this phase's manual validation step.
**Intermediate-state note:** Phases 1+2 land in the SAME PR (squash-merge);
Phase 1 alone would leave endpoints assigning a removed model attribute —
never deployed separately.

## Phase 2 — Backend endpoints (images into media pipeline)

**File:** `backend/app/api/v1/endpoints/rich_menus.py` + `backend/app/services/rich_menu_service.py`
- Delete `UPLOAD_DIR`, `os.makedirs`, `_write_upload_sync`, `_read_file_sync`.
- **Service home for image logic (feature-envy remedy):** add
  `RichMenuService.replace_image(db, menu, filename, mime, data)` (validate →
  create MediaFile → delete previous row → set `image_media_id`) and
  `RichMenuService.push_image_to_line(db, menu)` (select MediaFile explicitly
  by `image_media_id` → `upload_image_to_line`). The endpoint stays thin;
  upload and sync share one code path instead of three inline variants.
- `POST /{id}/upload` (`L555-596`):
  - **Rate limiter**: carry the media upload limiter (20/60 s) — reuse
    media.py's `_upload_rate_limit` dependency (import it; if the leading
    underscore blocks import, hoist it to a shared module in the same commit).
  - **Validate FIRST, before reading the body fully**: check `file.size`
    (Starlette provides it from the multipart header) against 10 MB → 413
    without buffering; then read; then **sniff magic bytes** — PNG
    `\x89PNG\r\n\x1a\n`, JPEG `\xFF\xD8\xFF` → 422 otherwise. The SNIFFED
    type (not the client Content-Type) is what gets stored and pushed to
    LINE (Content-Type is spoofable; liff.py:77-88 precedent).
  - Create `MediaFile(..., category=FileCategory.IMAGE)` via
    `replace_image`; **concurrent-upload orphan guard**: re-read
    `rich_menu.image_media_id` in the same transaction just before commit and
    delete whichever old row it now points to (loser of a race must not
    orphan rows).
  - If `line_rich_menu_id` exists, `push_image_to_line` — on failure the
    media row SURVIVES (commit anyway, semantics of today's `L591-593`)
    **and** `update_sync_status(db, menu, FAILED, "image upload to LINE
    failed: ...")` — an uploaded-but-unpushed image must never read SYNCED
    (senior-review Required finding) — then 400 with a clear message
    ("รูปบันทึกในระบบแล้ว แต่อัปโหลดไป LINE ไม่สำเร็จ" — the old
    "saved locally" wording is dead with the disk pipeline).
- `POST /{id}/sync` (`L598-632`): fetch bytes via explicit
  `select(MediaFile).where(MediaFile.id == rich_menu.image_media_id)` —
  **never `rich_menu.image_media` relationship traversal in async code
  (MissingGreenlet)**; guard `if rich_menu.image_media_id` (a menu synced
  without an image, or whose media was deleted from the files page, still
  syncs menu-only). On LINE image-upload failure: re-fetch the menu (the
  endpoint's object is stale after the service's internal commit — `_SeqDB`
  has no identity map, this is load-bearing in tests), then
  `update_sync_status(..., FAILED, ...)` AND include `image_upload_error`
  in the response (stop swallowing).
- `DELETE /{id}` (`L660-703`): delete the menu, then delete its MediaFile row
  explicitly (the FK is rich_menus→media_files; deleting the menu orphans the
  media row unless we remove it); add `create_audit_log`
  (action="rich_menu_delete"); remove `os.remove`.
- **All response paths go through `model_validate` + `image_url`** — list
  (`L74-93`), get-single (`L491-497`, currently returns the ORM object —
  restructure), **and PUT/POST (`L499-553`, same ORM-passthrough pattern)** —
  set `item.image_url = f"/api/v1/media/{menu.image_media_id}"` when the FK
  is set (no extra query — plain column; never expose a lazy `image_media`
  field on the response model).

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
  - **Stale-id recovery (closes the dead end the senior review found):**
    `sync_with_idempotency` (`L304-377`) currently returns `success:false`
    forever when the stored `line_rich_menu_id` is gone from LINE — but
    publish's 409 tells the user "กด Sync เพื่อสร้างใหม่". Change: when
    `get_from_line` returns None, clear `rich_menu.line_rich_menu_id = None`
    and fall through to the create path (recreate on LINE, push image if the
    media row exists) — return success with message
    "Recreated on LINE (previous id was stale)". Safe: a `get_from_line` 404
    means the menu is truly gone, so recreation cannot duplicate anything.
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
  6. **Audit**: `create_audit_log(action="rich_menu_publish",
     resource_type="rich_menu", resource_id=str(id))` on success (AC-4.5;
     publish changes what every LINE user sees and is currently unaudited).
- `AGENTS.md` — refresh the documented HTTP-status list
  (`400/401/403/404/409/422/500` → add `402/413/429/502/503`, all already in
  use by the codebase; standards-review docs-drift finding).

**Validation:** pytest publish matrix: 409 not-synced / 409 stale-on-LINE / 503
empty-token / 502 upstream-reject / success marks PUBLISHED.

## Phase 4 — Frontend

**Files:**
- `frontend/lib/rich-menu.ts` (new) — **one shared helper, not per-page
  duplicates** (standards-review Duplicated-Code finding):
  `RichMenuSyncStatus` constants mirroring the backend enum, `canPublish(menu)`
  (true iff `line_rich_menu_id && sync_status === SYNCED`), and
  `parseSyncResult(json)` → `{ ok, message }` interpreting `success:false` /
  `image_upload_error`.
- `frontend/app/admin/rich-menus/page.tsx`:
  - `RichMenu` interface: `image_path` → `image_url: string | null`;
    delete `getImageUrl`; `<img src={menu.image_url}>`.
  - Badge/buttons via `canPublish`/constants: "Set Active" only when
    `canPublish(menu)`; `sync_status === FAILED` → red badge + "Sync" button;
    surface `last_sync_error` as title/tooltip.
  - `handleSync`: `parseSyncResult` — not-ok → error toast with message
    (today only `res.ok` is checked).
  - `handlePublish`: rely on `readErrorMessage` for 409/502/503 bodies.
- `frontend/app/admin/rich-menus/new/page.tsx`:
  - Same `parseSyncResult` in `handleSave` (it has the identical
    `res.ok`-only bug at `L344-349` — a 200-with-`success:false` shows a
    success toast today; covers AC-3.3).
- `frontend/app/admin/rich-menus/[id]/edit/page.tsx`:
  - Interface `image_path` → `image_url`; preview from `data.image_url`.
  - On upload failure inside `handleSave` (`L156-162` — today it shows an
    error toast AND a success toast AND redirects): show the error toast and
    STAY on the page.

**Validation:** vitest for gating/toast/URL usage; `npm run lint`;
`npm run test:unit`; `npm run build`.

## Phase 5 — Tests (written with their phase; summarized here)

- `backend/tests/test_rich_menu_image_media.py` (new):
  - upload creates MediaFile + sets `image_media_id`; replaces old row;
    rejects non-PNG/JPEG (422 — including a spoofed Content-Type over
    non-magic-byte content); over-10MB (413); row survives a failed LINE push
    AND `sync_status` flips to FAILED
  - sync reads bytes via explicit select (no relationship traversal); LINE
    image failure → `sync_status=FAILED` + `last_sync_error` set +
    `image_upload_error` in response (endpoint re-fetches the menu first —
    `_SeqDB` has no identity map)
  - **stale-id recovery**: menu with a `line_rich_menu_id` that LINE 404s →
    sync clears the id, recreates on LINE, returns success with the new id
  - delete menu deletes its MediaFile row; publish + delete write audit rows
  - publish matrix (Phase 3 cases: 409 not-synced / 409 stale-on-LINE / 503
    empty-token / 502 upstream-with-detail / success marks PUBLISHED)
  - list/get/PUT/POST all populate `image_url`
  - Reuse `FakeResp`/`_make_client`/`_patches` (extend `FakeResp` response with
    `.text`) from `test_rich_menu_alias_service.py:13-67` /
    `test_rich_menu_peruser_service.py:23-77`, and `_SeqDB`/
    `dependency_overrides` from `test_rich_menu_alias_endpoints.py` /
    `test_rich_menu_delete_guard.py`.
- Migration: STRUCTURAL test (repo precedent `test_booking_migration.py:1-9`) —
  load the migration module, assert `down_revision == "r9s0t1u2v3w4"` and the
  upgrade adds `image_media_id` (additive-only — no drop). The live
  upgrade/downgrade/upgrade round-trip is Phase 1's manual validation.
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
5. **Follow-up PR (contract phase)**: drop `rich_menus.image_path` once this
   PR is verified live (rollback for that step = simple code revert).
6. Handoff via `node .agents/scripts/handoff-new.cjs`.

## Review trail

- 2026-08-30 — four-skill review round on the PRD + this plan (user-mandated
  order): `review` (two-axis Standards+Spec), `code-review-and-quality`
  (five-axis), `requesting-code-review` (senior reviewer, verdict
  "Needs fixes first"), `security-review` (verdict "needs security fixes
  first"). 24 consolidated findings — the load-bearing ones: expand-contract
  staging of the `image_path` drop (deploy-window 500s), stale-id sync
  recovery dead end, async `MissingGreenlet` traversal trap, upload-path
  honesty (`sync_status=FAILED` on LINE push failure), upload rate limiter +
  `file.size` pre-read bound + magic-byte sniffing, audit logging for
  publish/delete, PUT/POST ORM-passthrough responses, shared frontend sync
  helper, `RichMenuSyncStatus` enum, AGENTS.md status-list refresh. All
  folded into Phases 1-5 above; none deferred silently.
- Known cosmetic debt: commit `4ec5887`'s subject says "PRD + PRD" (typo for
  PRD + PRP); corrected going forward, history left as-is.

## Risk register

| Risk | Mitigation |
|---|---|
| Backfill on large images slows migration | Rich-menu images are 100-500 KB; bounded by table size; per-row insert with logged skips; `basename()` on stored paths neutralizes tampered `../` |
| Old rows on prod with missing files | Accepted in PRD review: "No Image" + one-time re-upload; no-op backfill is the expected case |
| Deploy-window breakage from schema change | ELIMINATED by expand-contract: this PR's migration is additive-only; `image_path` drop deferred to a verified-then-ship follow-up PR |
| Pydantic v2: bare `Optional[str]` is required, not optional | `image_url: Optional[str] = None` (default) in the schema; get-single/PUT/POST all restructured to `model_validate` |
| Async lazy-load (`MissingGreenlet`) on media bytes | No relationship on the model; explicit `select(MediaFile)` by FK id everywhere; guarded when the FK is null |
| Stale `rich_menu` object after service-internal commit | Endpoint re-fetches before `update_sync_status`; tests use `_SeqDB` (no identity map) so this is load-bearing |
| Concurrent uploads orphan a media row | Re-read the FK inside the transaction just before commit; delete whichever old row it points to |
| `_SeqDB` tests touching removed `image_path` | Three fixtures updated in the same commit (delete_guard:98, list_user_count:57, update_endpoint:93); grep `image_path` across backend/frontend before commit |
| Frontend tests assert old URL builder | Delete `getImageUrl` assertions; new tests assert `image_url` passthrough |
| Memory-DoS via unbounded upload read | `file.size` checked BEFORE the body is read; magic-byte sniff decides stored mime |
| Stale-id recreate could duplicate a menu on LINE | Cannot: recreation only fires when `get_from_line` 404s — the old menu is provably gone |
| Preview 429s on large tables (120/60s per IP) | Pre-existing media-route behavior; follow-up to add Cache-Control — not silently accepted, tracked in PRD out-of-scope |
| Stale agent docs (`image_path` references) | Out of PR scope by review decision; tracked as follow-up (`skn-rich-menu-builder`, `skn-rich-menu-frontend` skills, image-generator PRD metrics) |