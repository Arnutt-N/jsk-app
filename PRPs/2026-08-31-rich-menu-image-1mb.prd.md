# PRD: Rich Menu Image — Enforce LINE's 1 MB Limit + Client Auto-fit

**Created:** 2026-08-31
**Status:** Draft → self-review (two-axis) applied
**Branch:** `fix/rich-menu-image-1mb`
**Companion plan:** `PRPs/2026-08-31-rich-menu-image-1mb.plan.md`
**Follow-up to:** PR #212 (`PRPs/2026-08-30-rich-menu-media-publish.prd.md`) — found during the user's device smoke of that PR

---

## 1. Executive Summary

Device smoke on prod (2026-08-31) hit a sync failure PR #212's fix correctly
*surfaced* but did not prevent: the menu was created on LINE, then the image
upload to `api-data.line.me/v2/bot/richmenu/{id}/content` returned
**413 Request Entity Too Large**, leaving `sync_status=FAILED` and a menu on
LINE without an image (un-publishable).

| Symptom | Root cause |
|---|---|
| Sync → "อัปโหลดรูปไม่สำเร็จ … Client error '413 …'" | `MAX_RICH_MENU_IMAGE_BYTES = 10 MB` (`rich_menus.py:42`) mirrors `media.py`, but **LINE caps rich-menu image content at 1 MB**. A 1–10 MB image passes the upload endpoint, is stored in `media_files`, and only fails later at the sync push — after the menu was already created on LINE |
| Raw httpx blob shown to the admin | `push_image_to_line` call sites format `f"…: {e}"` — `str(e)` of an `httpx.HTTPStatusError` contains neither LINE's error body nor an actionable instruction (`_line_error_detail` exists but is only used by publish) |
| No client-side guard | New/edit rich-menu pages POST the raw `File`; nothing warns about size before or after picking a file |

## 2. Why this shape (what a minimal patch would leave behind)

- Capping upload at 1 MB **without** client auto-fit makes every oversized
  screenshot a dead end — the admin must discover `/admin/image-resize` on
  their own. Auto-fit (canvas downscale + JPEG quality ladder) makes any
  picked image just work, and matches the tool the repo already ships
  (`RESIZE_PRESETS` has LINE rich-menu sizes).
- Mapping the LINE 413 to a friendly message is still required **after** the
  cap: legacy media rows stored before this fix can exceed 1 MB (the user's
  current menu does), and re-syncing them must not surface the raw blob or
  create another orphan menu on LINE.
- **Fail-fast in sync**: without it, a legacy >1 MB image still gets a fresh
  menu created on LINE before the push fails — one more orphan to clean up.

## 3. Acceptance Criteria

### AC-1: Upload endpoint enforces LINE's real limit
- **AC-1.1** `MAX_RICH_MENU_IMAGE_BYTES = 1 MB` (LINE's documented rich-menu
  content limit); `file.size` pre-check and buffered-length check both use it.
- **AC-1.2** Rejection is `413` with an actionable Thai detail (resize guidance),
  not "Image exceeds the 10 MB limit".

### AC-2: LINE image-upload failures are human-readable everywhere
- **AC-2.1** `upload_image_to_line` maps `httpx.HTTPStatusError` → `RuntimeError`
  whose text is: 413 → fixed Thai "รูปใหญ่เกินขีดจำกัด 1 MB ของ LINE…" guidance;
  other statuses → `LINE rejected image upload ({code}): {_line_error_detail(e)}`.
- **AC-2.2** Both existing catch sites (upload-endpoint push, sync-endpoint push)
  inherit the friendly text in their HTTP detail / `image_upload_error` /
  `last_sync_error` without further change.

### AC-3: Sync never creates an orphan menu it cannot decorate
- **AC-3.1** In `sync_with_idempotency`, the create path (including the
  stale-id recreate fall-through) checks the stored media first: image larger
  than the cap → `sync_status=FAILED` with the AC-2 message, **no**
  `create_on_line` call, `success:false` returned.
- **AC-3.2** Menus already existing on LINE keep today's behavior (sync returns
  SYNCED; the endpoint's push surfaces the friendly error) — no behavior change
  for the healthy path.

### AC-4: Frontend auto-fits oversized images before upload
- **AC-4.1** `lib/rich-menu.ts` gains a pure `planRichMenuFit(fileSize, w, h)`
  decision helper (scale ladder × JPEG quality ladder, first combo ≤ 1 MB) and
  an async `ensureRichMenuImage(file)` wrapper: ≤ 1 MB files pass through
  **untouched** (no re-encode, no alpha loss); oversized files are downscaled
  to fit a 2500×1686 box preserving aspect ratio, white-filled JPEG at the
  planned quality.
- **AC-4.2** Both upload sites (new page `handleSave`, edit page image upload)
  run `ensureRichMenuImage` before POSTing; if a conversion happened, a toast
  informs the admin ("ย่อรูปอัตโนมัติ…").
- **AC-4.3** If auto-fit still can't reach ≤ 1 MB (degraded browser without
  canvas), the upload is blocked with the AC-1-style guidance instead of
  POSTing a doomed file.

### AC-5: Pinned by tests
- Backend: cap change exercised via existing monkeypatch test (unchanged);
  new tests pin AC-2.1 (413 → Thai RuntimeError with `_line_error_detail`
  fallback path) and AC-3.1 (create not called, FAILED + message).
- Frontend: `planRichMenuFit` ladder cases (small passthrough, boundary 1 MB,
  scale-down progression, worst-case floor) + `ensureRichMenuImage` passthrough.

## 4. Non-goals

- No migration, no env flags, no schema change (rollback = revert PR).
- Not touching `media.py`'s 10 MB cap (chat/LIFF media are unrelated to LINE).
- Not refactoring `image-utils.ts` / the image-resize page (helper is
  self-contained in `lib/rich-menu.ts` to keep the lib→page layering clean).
- Not stretching/matching source aspect to the menu canvas — LINE already
  stretches images to the canvas; we preserve source aspect when downscaling.

## 5. Operator note (post-deploy)

The user's stuck menu (LINE id `richmenu-affeb34d…`, `sync_status=FAILED`,
stored image > 1 MB): after deploy, open its edit page → re-pick the image
(auto-fit shrinks it) → upload pushes to LINE immediately (menu already has a
LINE id) → Re-sync → Set Active. No DB cleanup needed.
