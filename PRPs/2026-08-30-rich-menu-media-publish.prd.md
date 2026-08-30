# PRD: Rich Menu Preview & Publish — Durable Fix

**Created:** 2026-08-30
**Status:** Approved — 4-skill review round complete (review/code-review/requesting-code-review/security-review); all findings folded in
**Branch:** `fix/rich-menu-media-publish`
**Companion plan:** `PRPs/2026-08-30-rich-menu-media-publish.plan.md`

---

## 1. Executive Summary

Two user-facing defects on `/admin/rich-menus` share one root-cause class: rich-menu
images are the **last admin feature still on a local-disk file pipeline that has no
serving route**, while the publish action calls LINE's set-default API **without
verifying preconditions** and surfaces raw upstream errors.

| Symptom | Root cause |
|---|---|
| Table preview images all error (placehold.co fallback) | `<img>` points at `/uploads/rich_menus/...`; the static `/uploads` mount was removed (`main.py:214-215`) and Next.js rewrites don't proxy `/uploads/*` — the URL 404s unconditionally |
| "Set Active" → `LINE Publish Error: Client error '400 Bad Request'` | Publish posts to `api.line.me/v2/bot/user/all/richmenu/{id}` with no pre-flight. LINE 400s when the richMenuId no longer exists on LINE (deleted there, stale DB id) or when the menu has no image on LINE. The sync endpoint swallows image-upload failures (`image_upload_error` is returned but never surfaced), so menus carry `SYNCED` status while being un-publishable |

## 2. Why durable (what a minimal patch would leave behind)

A minimal patch (add a serving route + a pre-check in publish) would fix today's
symptoms but leave:

1. **Ephemeral filesystem** — Koyeb redeploys lose `uploads/`; any image stored
   today silently disappears and `image_path` in the DB becomes a lie. Two
   identical deployments behave differently.
2. **Two image pipelines** — `media_files` (BYTEA in DB, tokenized URLs) already
   serves LIFF attachments and the admin files page. Rich menus keeping a private
   disk pipeline guarantees drift, as the removed static mount already proved.
3. **Silent half-failures** — `sync_status=SYNCED` can mean "menu exists on LINE"
   while the image upload failed. Every future admin action inherits the lie
   (publish 400s with a cryptic upstream message).

The durable fix moves rich-menu images into `media_files` (one pipeline) and makes
publish **verify-then-act** with honest state transitions.

## 3. User Stories / Acceptance Criteria

### AC-1: Preview images render everywhere
- **AC-1.1** List-page `<img>` loads from a URL the backend actually serves; menus
  without an image show a clean "No Image" state, not a broken-image icon.
  Serving relies on the deliberate `None != None` open-by-UUID behavior at
  `media.py:124` (the same path the admin files page uses — rate-limited,
  unguessable UUIDs; documented in the route's own comment at `media.py:109-111`).
- **AC-1.2** Edit page shows the current image on load from the same source.
- **AC-1.3** Backfill is best-effort: rows whose disk file still exists get a
  preview after migration; rows whose file is gone (Koyeb ephemeral FS) stay
  null and show "No Image". A no-op backfill is an acceptable, expected
  outcome (`backend/uploads/rich_menus/` is empty locally today).

### AC-2: Upload uses the one media pipeline
- **AC-2.1** `POST /{id}/upload` stores bytes as a `media_files` row (category
  `IMAGE`), not a disk file. No `uploads/rich_menus` directory is created.
- **AC-2.2** Re-uploading replaces the previous media row (no orphans).
- **AC-2.3** Upload validation runs BEFORE any storage: non-PNG/JPEG rejected
  422 (the frontend `accept` attribute already promises this whitelist — and
  the **sniffed PNG/JPEG magic bytes**, not the spoofable client
  Content-Type, decide what is stored and pushed to LINE); over 10 MB
  rejected 413 with `file.size` checked BEFORE the body is read (memory-DoS
  bound); the upload endpoint carries the media upload rate limiter
  (20/60 s, same as `media.py:210`).
- **AC-2.4** Deleting a menu deletes its media row.
- **AC-2.5** If the menu is already synced, upload still pushes the image to LINE
  immediately (existing behavior preserved) — validation (mime/size) runs
  BEFORE the media row is created; if the LINE push then fails, the media row
  survives (same "save anyway" semantics as today's `rich_menus.py:591-593`)
  **and** `sync_status` becomes `FAILED` with `last_sync_error` — an
  uploaded-but-unpushed image must never read as SYNCED (same honesty rule as
  AC-3.1).
- **AC-2.6** Known size reality: the UI says 1 MB (`new/page.tsx:596`), the media
  API allows 10 MB, and LINE's own rich-menu limit is ~1 MB — a >1 MB upload
  will pass our checks and fail at LINE with the (now honest) error surfaced by
  AC-3.1. Accepted; aligning the UI copy to LINE's limit is a follow-up.

### AC-3: Sync state is honest
- **AC-3.1** When the LINE image upload fails during sync, the menu's
  `sync_status` becomes `FAILED`, `last_sync_error` records why, and the response
  body carries `image_upload_error` — the frontend shows an error toast (today it
  shows success). The same honesty rule covers the upload path (AC-2.5).
- **AC-3.2** List-page badge and action buttons derive from real state: "Set
  Active" only appears when `line_rich_menu_id` AND `sync_status === 'SYNCED'`;
  a `FAILED` sync shows a "Re-sync" affordance with the error. Frontend gates
  on named constants (a code-level `(str, Enum)` per AGENTS.md's enum rule —
  the DB column stays String), not scattered string literals.
- **AC-3.3** The new-menu page (`new/page.tsx`) handles sync results the same
  way as the list page — `success:false` or `image_upload_error` → error
  toast — via one shared frontend helper, not duplicated per-page logic.

### AC-4: Publish fails fast with actionable messages
- **AC-4.1** Menu missing/stale on LINE (verified via `get_from_line`) → **409**
  with a Thai message telling the user to Sync first; DB records
  `sync_status=FAILED, last_sync_error`. **The promised recovery must work**:
  pressing Sync on a stale-id menu clears the dead `line_rich_menu_id` and
  re-creates the menu on LINE (today `sync_with_idempotency` returns
  `success:false` forever without clearing the stale id — a dead end the fix
  closes).
- **AC-4.2** LINE channel token not configured → **503** with a config message
  (not a raw 401 from LINE wrapped in a 400).
- **AC-4.3** LINE upstream rejects the set-default call → **502** with the
  upstream status code and parsed error detail (English blob replaced by a
  structured message).
- **AC-4.4** A successful publish on a real channel still works end-to-end and
  marks the menu `PUBLISHED`.
- **AC-4.5** Publish and menu-delete write `create_audit_log` entries (parity
  with `media.py`'s delete audit, `media.py:270-277`) — publish changes what
  every LINE user sees and is currently unaudited.

### AC-5: Non-regression
- **AC-5.1** Existing rich-menu tests pass (fixtures referencing `image_path`
  updated: `test_rich_menu_delete_guard.py:98`,
  `test_rich_menu_list_user_count.py:57`,
  `test_rich_menu_update_endpoint.py:93`); alias/per-user link/unlink behavior
  untouched.
- **AC-5.2** Frontend lint/unit/build green; manual local flow (create → upload →
  preview → sync → set active) works.
- **AC-5.3** The admin files page (`/admin/files`) can list a rich-menu media
  row (it reads the same table) — deleting one there makes the menu fall back
  to "No Image" (FK `ondelete=SET NULL`). Accepted interaction, noted here.

## 4. Scope

### In scope
- `rich_menus` schema change: `image_media_id` FK → `media_files` + best-effort
  backfill migration (**additive only** — `image_path` drop is a follow-up PR,
  see Decision 3)
- Backend endpoints: upload / sync / publish / delete / list / get-single /
  PUT / POST adjustments (every response path goes through `model_validate` +
  `image_url`)
- Publish hardening: verify-then-act + stale-id sync recovery + audit logging
- Frontend: list + edit + new pages (`image_url`, sync-failure surfacing,
  button gating, shared sync-result helper)
- Code-level `RichMenuSyncStatus` `(str, Enum)` (AGENTS.md enum rule)
- AGENTS.md HTTP-status list refresh (add 402/413/429/502/503 — all already in
  use by the codebase; documented list is stale)
- Tests: backend (endpoint + service + structural migration test), frontend
  vitest

### Out of scope (recorded as follow-ups)
- **Drop `image_path`** — a small follow-up PR after this one is verified live
  (expand-contract; repo precedent: PR C staged its destructive drop,
  `q8r9s0t1u2v3`). Dropping in the same PR would 500 the old code during the
  CD migrate→deploy window and during Koyeb rolling deploys
  (`cd.yml:247,269-273`).
- Chat media migration (`line_service.persist_line_media` writes `/uploads/...`
  URLs that are equally unserved — needs Flex-payload impact analysis)
- Circuit-breaker wrapping for httpx LINE calls (breaker currently used only by
  line-bot-sdk paths)
- Absolute-URL strategy via `SERVER_BASE_URL` (relative `/api/v1/media/{id}`
  suffices for admin `<img>`)
- `Cache-Control` on `GET /api/v1/media/{id}` + preview-429 mitigation
  (PUBLIC_FILE_RATE_LIMIT 120/60s per IP vs a 20-row table re-fetching every
  image on refresh) — pre-existing behavior, quantify first
- Aligning the UI's "Max size 1MB" copy with the actual limits (UI 1 MB vs API
  10 MB vs LINE ~1 MB)
- Updating stale agent-facing docs that reference `image_path`:
  `.claude/skills/skn-rich-menu-builder/` (`SKILL.md:154,192,198,274,342`,
  `references/menu_reference.md`),
  `.claude/skills/skn-rich-menu-frontend/` (`SKILL.md:262`,
  `references/rich_menu_frontend_reference.md`), and
  `.claude/PRPs/prds/rich-menu-image-generator.prd.md:92,149` (its
  `image_path LIKE '%generated_%'` metrics die when the column is dropped) —
  tracked separately so this PR stays code-focused

## 5. Rollback

- This PR is **additive-only** at the schema level (new FK column; no column
  dropped) — rollback = revert the PR. The migration downgrade (drop
  `image_media_id`) is optional and safe either way; old and new code both run
  against the migrated schema, so no broken deploy window exists.
- The follow-up PR that drops `image_path` gets a simple code-revert rollback
  precisely because the drop is staged after this PR is verified live.

## 6. Decisions from review

1. `image_url` is relative `/api/v1/media/{id}` — consistent with LIFF and
   admin-files usage; serving relies on the deliberate open-by-UUID behavior
   at `media.py:124` (rate-limited, unguessable v4 UUIDs, same path the admin
   files page already uses). ✅
2. Menus whose disk files are already gone (Koyeb) will show "No Image" and
   need one re-upload via the edit page; the backfill is best-effort and a
   no-op where files are missing. ✅ accepted
3. ~~Drop `image_path` in the same PR~~ **Revised after the 4-skill review
   round**: expand-contract — this PR adds the new column and switches all
   code to it; the drop is a small follow-up PR (repo precedent: PR C staged
   its destructive drop, `q8r9s0t1u2v3`). Rationale: CD applies the migration
   before deploying (`cd.yml:247,269-273`) and Koyeb rolls instances — a
   same-PR drop would 500 the old code mid-rollout and make rollback
   impossible in either order.