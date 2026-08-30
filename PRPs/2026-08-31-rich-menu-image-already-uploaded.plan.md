# PRP: Rich Menu Image "Already Uploaded" — Implementation Plan

**Created:** 2026-08-31
**Status:** Approved for implementation (self-review round complete)
**Branch:** `fix/rich-menu-image-already-uploaded`
**PRD:** `PRPs/2026-08-31-rich-menu-image-already-uploaded.prd.md`

---

## Ground rules

- No migration, no schema change, no frontend change — rollback = revert PR.
- LINE's error text is matched by substring (case-insensitive), not pinned
  byte-for-byte.
- Tests land in the same commit as the code they pin.
- Local gates: rich-menu pytest files + vitest rich-menu files (regression
  only) + `tsc --noEmit` (no TS change expected — run anyway if any file
  under `frontend/` is touched).

## Phase 1 — Backend service (`rich_menu_service.py`)

**File:** `backend/app/services/rich_menu_service.py`

1. Module constant:
   `_ALREADY_UPLOADED_MARKER = "an image has already been uploaded"` —
   the lowercase substring matched against LINE's 400 body.
2. `upload_image_to_line` — inside the `except httpx.HTTPStatusError` handler,
   before the generic re-raise: when `status_code == 400` and the marker
   substring is in `_line_error_detail(e).lower()` (detail already carries
   LINE's own `message`), **return** `{"already_uploaded": True}` instead of
   raising. The 413 mapping and the generic
   `LINE rejected image upload ({code}): {detail}` re-raise stay untouched
   (they are above/below this branch in the same handler).
3. `push_image_to_line` — return type widens to `bool | dict`: pass through
   whatever `upload_image_to_line` returns (`True` for legacy bool semantics,
   the `{"already_uploaded": True}` dict when LINE says already-uploaded).
   Callers that only truthiness-check keep working unchanged.

**Validation:** unit tests in Phase 3 pin both arms of the 400 branch.

## Phase 2 — Backend endpoints (`rich_menus.py`)

**File:** `backend/app/api/v1/endpoints/rich_menus.py`

1. `POST /{id}/sync` (`sync_rich_menu`): the existing
   `push_image_to_line` call site stays in the `try`; because the
   already-uploaded case no longer raises, the `except` (which flips
   `sync_status=FAILED` and sets `image_upload_error`) now runs only on
   genuine failures — AC-2 falls out with **no endpoint change**. Verify
   this by reading, then pin with an endpoint test.
2. `POST /{id}/upload` (`upload_rich_menu_image`): the same no-raise
   reasoning applies; when the push returns
   `{"already_uploaded": True}`, the response payload adds
   `"already_uploaded": True` so the admin sees why their re-pick did not
   replace LINE's copy. One `isinstance(push_result, dict)` check on the
   `push_image_to_line` return.

**Validation:** endpoint tests in Phase 3.

## Phase 3 — Backend tests (`test_rich_menu_image_media.py`)

**File:** `backend/tests/test_rich_menu_image_media.py` (same fake apparatus:
`_SeqDB`, `_override`, `_full_menu`, `_patch_line_client`)

1. `test_upload_image_to_line_already_uploaded_400_is_success` — 400 +
   already-uploaded body → returns `{"already_uploaded": True}`, no raise.
2. `test_upload_image_to_line_400_other_message_still_raises` — 400 +
   unrelated body → `RuntimeError` containing
   `LINE rejected image upload (400)` + LINE's message (guards the
   substring match against false positives).
3. `test_sync_on_already_decorated_menu_stays_synced` — endpoint-level:
   menu synced + media row present, `push_image_to_line` patched to return
   `{"already_uploaded": True}` → 200, `success:true`, **no**
   `image_upload_error` key, `sync_status` not FAILED.
4. `test_upload_endpoint_already_uploaded_returns_200_with_marker` —
   endpoint-level: synced menu, `push_image_to_line` patched to return the
   marker dict → 200, `already_uploaded:true` in body, media row added,
   `sync_status` untouched (no FAILED).
5. Existing genuine-failure tests (`test_upload_line_push_failure_marks_sync_failed_but_keeps_media_row`,
   `test_sync_surfaces_image_upload_error_and_marks_failed`) must keep
   passing unchanged — they pin AC-2.2/AC-3.2.

**Validation command:**
`venv/Scripts/python.exe -m pytest tests/test_rich_menu_image_media.py tests/test_rich_menu_size.py tests/test_rich_menu_delete_guard.py -q`
(then the full rich-menu file set).

## Phase 4 — Ship

- Commit (code + tests together), push, PR with PRD link, merge per
  `git_workflow` skill; update PRD **Status** to reflect self-review → merged.