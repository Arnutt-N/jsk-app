# PRD: Rich Menu Image — Treat LINE's "Already Uploaded" 400 as Idempotent Success

**Created:** 2026-08-31
**Status:** Draft → self-review (two-axis) applied
**Branch:** `fix/rich-menu-image-already-uploaded`
**Companion plan:** `PRPs/2026-08-31-rich-menu-image-already-uploaded.plan.md`
**Follow-up to:** PR #213 (`PRPs/2026-08-31-rich-menu-image-1mb.prd.md`) — found while following that PR's own operator note on the user's stuck menu

---

## 1. Executive Summary

The user's menu is stuck at `sync_status=FAILED` with the toast:

> Sync ไม่สมบูรณ์ — เมนูถูกสร้างบน LINE แล้ว แต่อัปโหลดรูปไม่สำเร็จ (LINE จะไม่รับเมนูที่ไม่มีรูป): LINE rejected image upload (400): An image has already been uploaded to the richmenu

Root cause is a LINE API semantic our sync flow violates: **a rich menu's
image can be uploaded exactly once**. LINE provides no image-replace or
image-delete endpoint (only upload + download on
`/v2/bot/richmenu/{id}/content`, verified against the official Messaging API
reference) — the only way to change an image is to delete the menu and
recreate it. Our flow ignores this and pushes the stored image on *every*
sync and *every* post-upload refresh:

| Trigger | What happens today |
|---|---|
| `POST /{id}/sync` on an already-synced menu (`rich_menus.py:653-662`) | `sync_with_idempotency` returns "Already synced", then the endpoint **unconditionally re-pushes the stored image** → second push hits `400 An image has already been uploaded to the richmenu` → `sync_status=FAILED` |
| `POST /{id}/upload` on an already-synced menu (`rich_menus.py:613-624`) | New bytes are stored, then pushed — first upload succeeds, but the admin is left mid-flow with no retry path that doesn't hit the same error |
| The stuck state | Every retry path (Re-sync button → sync endpoint; re-pick image → upload endpoint) re-pushes to a menu LINE has already decorated → permanent `FAILED`, un-publishable, and the menu id on LINE becomes unusable |

PR #213's operator note made this exact trap: it walked the user through
"re-pick the image → upload (push succeeds) → Re-sync", and the Re-sync step
pushed the image *again* to the same LINE menu id, landing on the 400.

The stored image is never lost (media row survives), so the correct behavior
is **idempotency**: when LINE answers the image push with
`400 An image has already been uploaded to the richmenu`, the menu already
has *an* image on LINE — the sync is effectively complete, not failed.

## 2. Why this shape (what a minimal patch would leave behind)

- **Treat the error as success, don't skip the push.** "Don't push when
  already synced" alone would fix the sync-endpoint trigger, but the upload
  endpoint (legitimate re-upload of a new image) needs the same mapping — and
  a future flow could still hit the 400. Mapping the LINE error at the single
  chokepoint (`upload_image_to_line`) fixes every caller at once, including
  the case where the admin re-picks an image *after* a first successful push
  (the honest answer there is "LINE won't take a replacement image; delete
  the menu to change it" — surfaced as a readable error, not a dead sync).
- **Why not delete-and-recreate on image change:** that changes sync
  semantics for aliases (LINE aliases point at rich menu ids; recreating
  breaks them silently), user links, and the default menu. It is a product
  decision beyond this fix; the error message will state the real constraint
  so the admin can act.
- **Why not pre-check with GET content:** a GET-based "has image?" probe adds
  a network round-trip on every sync for a case the push itself already
  answers definitively (and GET content's 404 behavior for imageless menus
  is not contractually documented). The 400 mapping is authoritative and
  cheaper.

## 3. Acceptance Criteria

### AC-1: The "already uploaded" 400 is recognized at the chokepoint
- **AC-1.1** `upload_image_to_line` inspects LINE's 400 response body: when
  the message matches "An image has already been uploaded to the richmenu"
  (substring, case-insensitive — LINE's exact wording must not be pinned
  byte-for-byte), the call **succeeds** (no exception).
- **AC-1.2** The success is distinguishable from a real upload: the call
  returns a marker (e.g. `{"already_uploaded": True}`) so callers and tests
  can assert idempotency explicitly.

### AC-2: Sync on an already-decorated menu completes green
- **AC-2.1** `POST /{id}/sync` where the menu exists on LINE and already has
  an image: the push's "already uploaded" outcome is treated as success —
  response is `success:true`, **no** `image_upload_error` field, and
  `sync_status` stays/becomes `SYNCED` (never flipped to FAILED).
- **AC-2.2** A genuine LINE failure on the image push (any other status or
  message) still marks `sync_status=FAILED` with the readable error — the
  honesty rule from PR #212/#213 is preserved.

### AC-3: Upload endpoint behaves identically
- **AC-3.1** `POST /{id}/upload` on a synced menu whose LINE menu already has
  an image: the new bytes are stored, the "already uploaded" outcome maps to
  200 with `already_uploaded` in the payload instead of 400/FAILED.
- **AC-3.2** Genuine push failures keep today's behavior (400, Thai detail,
  `sync_status=FAILED`, media row survives).

### AC-4: Pinned by tests
- Backend unit: 400 + already-uploaded body → no raise, returns marker;
  400 + other message → raises with `LINE rejected image upload (400): …`.
- Backend endpoint: sync on decorated menu → `success:true`, no
  `image_upload_error`; upload on decorated menu → 200 +
  `already_uploaded:true`; genuine failure paths unchanged (existing tests
  keep passing).

### AC-5: Non-goals
- No delete-and-recreate of LINE menus on image change (breaks aliases/user
  links silently — product decision, out of scope).
- No GET-content pre-probe (extra round-trip for information the push
  already returns).
- No frontend change required: `parseSyncResult` already renders
  `success:true` + no `image_upload_error` as a green toast, and the upload
  flow already stops on non-ok responses.

## 4. Operator note (post-deploy)

The user's stuck menu: press **Re-sync** (or Sync) once. The push returns
"already uploaded", which now reads as success → `sync_status=SYNCED` →
**Set Active** becomes available. If the admin actually wants to *change*
the image, they must delete the menu and recreate it (LINE's constraint) —
the error path now states this in the toast instead of a dead FAILED badge.