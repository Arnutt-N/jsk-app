# PRD: Fix Rich-Menu Image Previews Returning 403 (Image Load Error)

Date: 2026-10-09 · Branch: `fix/rich-menu-image-403` · Owner: Muse Code
Skills invoked: `improve-ui` (audit that surfaced the bug), `diagnosing-bugs`,
`karpathy-guidelines` (baseline: surgical change); skill map:
`.claude/docs/skill-collections-20260712.md`.

## 1. Background

On production (`https://jsk-app.vercel.app/admin/rich-menus`) every rich-menu
row shows a grey "Image Load Error" placeholder instead of its menu artwork.
The edit page (`/admin/rich-menus/[id]/edit`) is affected the same way — both
pages render `image_url` through a bare `<img>` tag.

## 2. Problem statement (root cause, evidence-backed)

One root cause, proven end-to-end in code (no guessing):

1. `RichMenuService.replace_image` stores the uploaded menu image as a
   `MediaFile` row **without** `is_public` (`backend/app/services/rich_menu_service.py:92-98`),
   so it keeps the model default `is_public=False` (`backend/app/models/media_file.py:84`)
   with `public_token=None`.
2. `GET /api/v1/media/{media_id}` refuses any non-public row unless a matching
   private token is presented, and empty-vs-empty never passes
   (`backend/app/api/v1/endpoints/media.py:161`, `check_private_token` at
   `media.py:45-53`, locked in by `backend/tests/test_media_private_gate.py`).
3. The frontend requests the image with no token
   (`frontend/app/admin/rich-menus/page.tsx:177`) → backend answers **403** →
   the `<img onError>` fallback swaps in the placehold.co "Image Load Error"
   tile (`page.tsx:180-185`).

So 100% of rich-menu images are unviewable in the admin UI (and would be
unviewable to any future public consumer of `image_url`). LINE push/sync is
unaffected — it reads bytes straight from the DB, not over HTTP.

## 3. Decision

Mark rich-menu menu-art images **public at write time** (`is_public=True` in
`replace_image`) and backfill existing rows with a data migration.

Why public-by-flag (not a tokenised URL):

- Menu artwork is inherently public content: a synced menu's image is pushed
  to LINE's public CDN anyway, and the admin UI consumes it through bare
  `<img>` tags that cannot attach auth or tokens (the `/media/{id}` route
  comment at `media.py:142` already blesses this pattern: "No auth — used by
  `<img src>`").
- The alternative (mint `public_token` per upload, append `?token=` to every
  `image_url`) adds a secret to every response, needs URL-building changes on
  all four `image_url` producers, and still leaves old rows broken without a
  backfill. More moving parts for zero extra protection of non-sensitive art.
- Residual exposure is negligible: media ids are unguessable UUIDs, the bytes
  are PNG/JPEG menu art (sniff-verified at upload), and the admin metadata
  endpoints stay permission-gated.

## 4. Scope

IN:

- `replace_image`: set `is_public=True` on the created `MediaFile`.
- Alembic data migration: flip `is_public` for media rows referenced by
  `rich_menus.image_media_id` (only rows, no schema change).
- Tests: new upload produces a public row; existing private-gate tests stay
  green (they use non-menu files).

OUT (explicitly not this task):

- Frontend changes (the `<img>` + `onError` fallback is correct as-is).
- `/media/{id}` auth logic changes.
- The three `design-plans/2026-10-09-rich-menu-*` UI parity plans (separate
  execution).
- Public-token minting for menu images (rejected alternative, see §3).

## 5. Acceptance criteria

- AC1: Uploading a menu image then `GET /api/v1/media/{new_id}` with no token
  returns 200 with the image bytes.
- AC2: After migrating, every media row referenced by `rich_menus` is public;
  non-menu private rows are untouched.
- AC3: `test_media_private_gate.py` and `test_rich_menu_image_media.py` pass;
  full backend suite shows no new failures.
- AC4: Downgrade is a documented no-op (same rationale as
  `o5p6q7r8s9t0`: post-upgrade public rows are intentional, a blind reset
  would break them).

## 6. Risks

- Low: the flag flip only affects rows reachable via `rich_menus`, which are
  menu art by construction. No PII/secret bytes live in that set (upload path
  accepts sniff-verified PNG/JPEG only).
