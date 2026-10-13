# PRP Plan: Fix Rich-Menu Image Previews Returning 403

## Metadata

- Complexity: Small (1 service line + docstring, 1 data migration, 1–2 test
  additions, zero API/frontend changes)
- Source PRD: `.claude/PRPs/prds/2026-10-09-rich-menu-image-403.prd.md`
- Branch: `fix/rich-menu-image-403` (created, based on `main@1a16815`)
- Working directory: ALL shell commands run from `backend/` unless stated.
  (`cd backend` first; every validation command below assumes it.)
- Alembic head (verified by revision-graph grep on 2026-10-09):
  `d4e5f6a7b8c9` (`d4e5f6a7b8c9_broadcast_failed_recipients.py`) — re-verify
  with `alembic heads` before writing the migration; if a second head exists,
  chain onto the true single head or merge first.

## Summary

Rich-menu images are stored as private `MediaFile` rows but served to bare
`<img>` tags with no token, so `GET /media/{id}` answers 403 and the admin UI
shows "Image Load Error" for every menu. Fix at write time
(`is_public=True` in `replace_image`) + backfill existing menu-image rows via
a data-only migration. No endpoint, schema, or frontend changes.

## UX Clarity

User-visible change: menu artwork renders in `/admin/rich-menus` rows and on
the edit page instead of the grey "Image Load Error" tile. No interaction or
layout changes. Before/after evidence: list-page thumbnails load (HTTP 200 on
`/api/v1/media/{menu-image-id}` with no token).

## Units

### Unit 1 — Mark new menu images public

- File: `backend/app/services/rich_menu_service.py`, `replace_image`
  (lines 80–105).
- Change: pass `is_public=True` in the `MediaFile(...)` constructor (after
  `category=FileCategory.IMAGE`). Extend the docstring by one sentence:
  menu art is served to unauthenticated `<img>` tags and pushed to LINE's
  public CDN, so the row must be public for previews to load.
- Preserve: previous-row deletion, flush/commit/refresh sequence, return
  value, all validation (caller-owned).
- Verify: new test in Unit 3 asserts the added row's `is_public is True`.

### Unit 2 — Backfill existing menu-image rows

- New file: `backend/alembic/versions/<rev>_rich_menu_images_public.py`
  (generate `<rev>` via `alembic revision` so the id is unique; single
  `down_revision = "<verified head>"`).
- Style precedent: `o5p6q7r8s9t0_recategorize_media_files_by_extension.py`
  (data-only, `op.execute`, no-op downgrade with rationale comment).
- `upgrade()`: one statement —
  `UPDATE media_files SET is_public = true WHERE is_public = false AND id IN
  (SELECT image_media_id FROM rich_menus WHERE image_media_id IS NOT NULL)`.
  The `is_public = false` predicate makes it idempotent and narrows the
  write set; the subquery scopes it to menu art only.
- `downgrade()`: no-op with comment (post-upgrade public rows are
  intentional; a blind reset would re-break previews — same rationale as
  the precedent migration).
- Verify: `alembic upgrade head --sql` renders the statement (dry run);
  `alembic heads` still shows exactly one head after adding the file.

### Unit 3 — Tests

- File: `backend/tests/test_rich_menu_image_media.py` (extends existing
  `_SeqDB`/override patterns — no new harness).
- Change 1 (new test): `test_upload_marks_media_row_public_for_plain_img_access`
  — POST `/{id}/upload` with PNG bytes (mirror
  `test_upload_creates_media_row_and_returns_media_id`), then assert the
  added `MediaFile` has `is_public is True`.
- Change 2 (one line): in `test_replace_image_deletes_previous_media_row`,
  add `assert media.is_public is True` (service-level lock).
- Must-stay-green (no changes): `test_media_private_gate.py` (private-gate
  behavior for non-menu files is intentionally untouched).
- Verify: `python -m pytest tests/test_rich_menu_image_media.py
  tests/test_media_private_gate.py` → all pass; then full
  `python -m pytest` → no new failures vs pre-change baseline.

## Validation (ordered)

1. `python -m pytest tests/test_rich_menu_image_media.py tests/test_media_private_gate.py` → pass (AC1 at unit level, AC3 partial).
2. `alembic heads` → exactly one head (the new revision).
3. `python -m pytest` (full backend suite) → no new failures (AC3).
4. Manual (local, needs `docker-compose up -d db redis` + migrated DB):
   upload a menu image via the admin UI or `POST /{id}/upload`, then
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/media/{media_id}`
   → `200` (AC1 end-to-end); list page thumbnails render (UX evidence).
5. Self-review: `git diff` shows only the 4 intended files
   (service, migration, test, + PRD/plan docs); no endpoint/schema/frontend
   edits.

## Stop conditions

- Stop if `alembic heads` shows more than one head before the change (merge
  heads first — do not chain onto a stale revision).
- Stop if any existing test asserts menu-image rows are private (contradicts
  the PRD decision — escalate, don't weaken the test).
- Stop if `replace_image` has other callers whose files must stay private
  (grep shows only the rich-menu upload endpoint; if that changed, scope the
  flag per-caller instead).
