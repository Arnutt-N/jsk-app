# PRP: Rich Menu Image 1 MB — Implementation Plan

**Created:** 2026-08-31
**Status:** Approved for implementation (self-review round complete)
**Branch:** `fix/rich-menu-image-1mb`
**PRD:** `PRPs/2026-08-31-rich-menu-image-1mb.prd.md`

---

## Ground rules

- No migration / no env flag — rollback = revert PR.
- Tests land in the same commit as the code they pin.
- Local gates: rich-menu pytest files (full suite minus the 3 Windows-hang
  websocket files) + vitest + `tsc --noEmit` + eslint (changed files only —
  `playwright-report-2client/` noise) + `next build`.

## Phase 0 — Branch + documents (DONE)

- [x] Branch `fix/rich-menu-image-1mb`
- [x] PRD + PRP written; two-axis self-review applied (findings folded:
  fail-fast must also cover the stale-recreate fall-through; 413 mapping must
  use `_line_error_detail` fallback for non-413; ≤1 MB files must pass through
  un-re-encoded to avoid alpha loss; degraded-browser path must block, not POST).

## Phase 1 — Backend (`rich_menus.py` + `rich_menu_service.py`)

**Files:**
- `backend/app/api/v1/endpoints/rich_menus.py`
  - `MAX_RICH_MENU_IMAGE_BYTES = 1024 * 1024` — comment cites LINE's
    rich-menu content limit and this PRD; both 413 raise sites get the Thai
    actionable detail (module-level constant `_IMAGE_TOO_LARGE_DETAIL` shared
    with the service).
- `backend/app/services/rich_menu_service.py`
  - `upload_image_to_line`: wrap the LINE call; `except httpx.HTTPStatusError`
    → re-raise `RuntimeError` — 413 → `_IMAGE_TOO_LARGE_DETAIL`, else
    `f"LINE rejected image upload ({status}): {self._line_error_detail(e)}"`
    (chained `from e`). Import the constant from the endpoints module would be
    a layering inversion → define the constant in the **service** and import
    it in the endpoint instead.
  - `sync_with_idempotency`: before `create_on_line` (covers both fresh create
    and stale-recreate fall-through), if `image_media_id` is set, `db.get`
    the media row; `size_bytes > MAX_RICH_MENU_IMAGE_BYTES` →
    `update_sync_status(FAILED, _IMAGE_TOO_LARGE_DETAIL)` + return
    `{"success": False, "message": ..., "sync_status": FAILED, "error": ...}`
    without calling LINE. (Verify `_SeqDB`-style test doubles implement `get` —
    they do, `replace_image` relies on it.)
- `backend/tests/test_rich_menu_image_media.py` (or sibling rich-menu test file)
  - Existing monkeypatch cap test keeps working (cap constant is patched, not
    assumed).
  - New: LINE 413 on push → RuntimeError text contains "1 MB"; non-413 LINE
    error → contains `LINE rejected image upload` + `_line_error_detail` body.
  - New: sync fail-fast — menu with oversized stored image,
    `create_on_line` mocked with `AsyncMock(side_effect=AssertionError)` /
    assert_not_called, response `success:false`, status FAILED, message is the
    Thai guidance.
  - New: ≤1 MB image still syncs (guard does not false-positive).

**Validation:** `venv/Scripts/python.exe -m pytest tests/test_rich_menu_image_media.py tests/test_rich_menu_size.py -q` then the rich-menu file set.

## Phase 2 — Frontend (`lib/rich-menu.ts` + new/edit pages)

**Files:**
- `frontend/lib/rich-menu.ts`
  - `RICH_MENU_IMAGE_LIMIT_BYTES = 1024 * 1024`, `RICH_MENU_IMAGE_MAX_W = 2500`,
    `RICH_MENU_IMAGE_MAX_H = 1686` (as const).
  - Pure `planRichMenuFit(fileSize: number, w = MAX_W, h = MAX_H)`:
    scale ladder `[1, .75, .5, .35]` × quality ladder `[0.9, 0.8, 0.7, 0.6]`;
    returns `{ scale, quality }` of the first combo whose estimated floor can
    hit the limit… decision: estimation is unreliable → the plan returns the
    ladder order and the **wrapper** measures actual blob sizes, stopping at
    the first ≤ limit. `planRichMenuFit` stays pure by computing scaled
    dimensions + the ordered attempt list (testable without canvas); blob
    measurement lives in `ensureRichMenuImage`.
  - `ensureRichMenuImage(file: File): Promise<{ file: File | Blob; converted: boolean }>`:
    - `file.size ≤ limit` → passthrough, `converted:false` (never re-encode —
      PNG alpha preserved).
    - else decode via `createImageBitmap` (Image+objectURL fallback), fit into
      the box preserving aspect, white-fill JPEG, iterate the plan, return the
      first blob ≤ limit (worst case: smallest attempted blob).
    - canvas/bitmap unavailable → throw `Error` with the Thai guidance
      (caller shows it; no doomed POST).
- `frontend/app/admin/rich-menus/new/page.tsx` — `handleSave`: run
  `ensureRichMenuImage(file)` before `formData.append`; info toast when
  `converted`.
- `frontend/app/admin/rich-menus/[id]/edit/page.tsx` — same wrap at its upload
  site; `converted` → same toast.
- `frontend/lib/__tests__/rich-menu-image.test.ts` (or extend existing
  rich-menu lib test file if present)
  - `planRichMenuFit`: passthrough boundary (≤ limit), scale progression,
    dimensions preserve aspect and stay within the box, attempt list ordered.
  - `ensureRichMenuImage`: small File returns the **same object**,
    `converted:false` (no canvas touched); oversized with canvas unavailable →
    rejects with Thai guidance (jsdom has no canvas — that's the easy branch);
    canvas happy-path exercised indirectly by build (`next build` + tsc).

**Validation:** `npx vitest run lib/__tests__/rich-menu-image*` then full
`npm run test:unit`, `tsc --noEmit`, eslint on changed files, `next build`.

## Phase 3 — Ship

- [ ] Conventional commits per phase; push; open PR referencing this plan.
- [ ] CI green (Backend Pytest / Frontend Lint & Build / E2E smoke) → squash
  merge; watch CD (migrate + smoke).
- [ ] Operator note from PRD §5 to the user for their stuck menu.
