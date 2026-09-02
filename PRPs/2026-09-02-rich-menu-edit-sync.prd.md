# PRD — Rich Menu: edits must reach LINE (recreate-on-drift) + edit-page action parity

Date: 2026-09-02 · Branch: `fix/rich-menu-edit-sync` · Reporter: user (production smoke test)

## Problem

1. **Bug (blocker)**: On the admin rich-menu edit page, changing an area (e.g. area 2
   `message` → `uri`) and saving produces **no change in LINE** — users still see the
   old menu. Save reports success.
2. **UX gap**: The edit page's primary actions are only บันทึก/ยกเลอก (save/cancel).
   The user expects the create page's action set: save draft / save & sync /
   publish (set active), and a clear indication that local edits are not on LINE yet.

## Root cause (verified in code + LINE docs)

- LINE Messaging API has **no rich-menu update endpoint**. A rich menu's
  `size` / `chatBarText` / `areas` (and its image — uploads exactly once per
  richMenuId, PR #214) are immutable. Changing any of them requires
  **create new menu → re-upload image → re-bind → delete old**.
- `RichMenuService.sync_with_idempotency` treats "exists on LINE" as "synced"
  (`rich_menu_service.py:448-458`): it never compares the local `config` with
  LINE's copy, so after `PUT /{id}` the sync is a permanent no-op.
- `POST /{id}/upload` maps the already-uploaded 400 to a green marker (PR #214) —
  correct per se, but it means a replaced image also never reaches LINE.
- Nothing marks a synced menu as "locally edited" — the UI keeps showing
  SYNCED after an edit, hiding the stale state.

## Goals

G1. Sync makes LINE match local state: config drift or a locally-replaced image
    triggers a full **recreate-on-drift** flow.
G2. Bindings survive recreation: default (PUBLISHED), aliases, per-user links all
    move to the new LINE menu id.
 G3. A synced menu that is edited locally shows an honest "รอซิงค์" (pending
    re-sync) state in the UI, and upload no longer pretends the image reached LINE.
G4. Edit page offers the create page's action set: **บันทึกฉบับร่าง** (save draft /
    local only) and **บันทึกและซิงค์** (save + push to LINE), keeping the existing
    state machine (Sync / Re-sync / Set Active / Live Now).

## Non-goals (deferred to the follow-up feature PR)

- Display period / default-behavior options on the create page
  (แสดงตลอดเวลา / ตามช่วงเวลา / ซ่อน) — needs a scheduler task + migration.
- Changing the canvas size of an existing menu (immutable by design; the edit
  payload still omits `template_type`).

## Solution design

### Drift detection (`sync_with_idempotency`)

When the menu has a `line_rich_menu_id` and the menu still exists on LINE:

```
drift := (normalized local config != normalized LINE copy)
      or (sync_status == PENDING)      # local edit flag set by PUT / upload
```

- Normalized compare covers exactly the fields LINE stores: `size`, `name`,
  `chatBarText`, `areas` (deep equality; `selected` and extra local keys ignored).
- `sync_status == PENDING` on a menu that already has a LINE id means "local
  edit not pushed yet" (set by PUT on real change, by upload on image replace)
  — covers image drift, which the config compare cannot see.
- No drift → current green no-op ("Already synced with LINE").
- Stale id (404 on LINE) → existing stale-recreate path, unchanged.

### Recreate flow (on drift)

Ordered so that **the old menu stays fully functional until every re-bind has
succeeded**; any hard failure aborts before the destructive delete:

1. `create_on_line(config)` → new id. Failure → FAILED (old intact).
2. Upload stored image to the **new** id (fresh id → upload cannot hit the
   once-per-menu limit). Failure → best-effort delete of the new id, FAILED with
   image error (old intact).
3. Re-point every local alias pointing at this menu via
   `update_alias_on_line(alias_id, new_id)`. Failure → **abort** (a deleted old
   menu would break tab-switch aliases), FAILED, old intact.
4. Re-link per-user users: `decrypt_line_ids_for_users` on the linked local user
   ids, then `bulk_link(new_id, line_ids)` in batches of ≤500. LINE-side failure
   → **abort**, FAILED, old intact. Users whose id cannot be decrypted/missing
   are skipped individually with a warning in the result message.
5. If `status == PUBLISHED`: `set_default_on_line(new_id)` (moves the default —
   LINE refuses deleting the current default with 400). Failure → abort, FAILED,
   old intact.
6. `delete_from_line(old_id)` — best-effort (404 accepted). Failure is a warning
   only: a lingering old copy on LINE is harmless and the local record already
   points at the new id.
7. Persist: `line_rich_menu_id = new_id`, SYNCED, clear `last_sync_error`.
   Result message states the menu was recreated and bindings moved
   (`recreated: true` in the response payload).

Retry safety: an aborted recreate leaves `line_rich_menu_id` pointing at the old
menu and drift still detectable (config compare, or FAILED + config compare), so
pressing Sync again re-runs the whole flow idempotently.

### Honest local-edit flag

- `PUT /{id}`: when the menu already has a `line_rich_menu_id` and the new
  line-config differs from the stored one → `sync_status = PENDING`
  (no-op saves keep SYNCED).
- `POST /{id}/upload`: keep the current push attempt (it still handles the
  "synced menu gets its first image" case in place). When LINE answers
  already-uploaded (image replaced) → `sync_status = PENDING` so sync recreates
  with the new bytes; response keeps `already_uploaded: true` for the UI hint.

### Edit page (frontend)

- Replace the single บันทึกการแก้ไข with two primary actions mirroring the create
  page:
  - **บันทึกฉบับร่าง** — PUT (+ image upload if picked). If the menu is synced:
    toast "บันทึกในระบบแล้ว — ยังไม่ส่งไป LINE กด 'บันทึกและซิงค์' เพื่ออัปเดต".
  - **บันทึกและซิงค์** — PUT (+ upload) + POST sync. Recreated result → toast
    "อัปเดตบน LINE แล้ว". Stays on the page and refreshes state (badges flip to
    the new truth); no redirect — the page is now the guided flow's home.
- Keep the left state cluster (Sync to LINE / Re-sync / Set Active / Live Now),
  gated exactly as today (`canPublish`).
- Badge: `line_rich_menu_id && sync_status == PENDING` → **รอซิงค์**
  (amber "แก้ไขแล้ว ยังไม่ได้ส่งไป LINE") so the stale state is visible.

## Acceptance criteria

AC1. Edit area action (message→uri) → บันทึกและซิงค์ → LINE menu shows the new
     action (recreate flow ran; old menu deleted; default/aliases/user-links
     moved). The chat shows the new behaviour without re-adding the OA.
AC2. Sync on an unedited synced menu → no-op green, no recreate (regression).
AC3. Sync on a stale LINE id → stale-recreate path still works (regression).
AC4. Alias re-point or set-default failure during recreate → old menu still on
     LINE and still bound; sync FAILED with a readable Thai/English message.
AC5. Replaced image + sync → LINE shows the new image (recreate carries bytes).
AC6. Edit page shows รอซิงค์ after a local edit of a synced menu; Set Active
     stays hidden until re-sync (canPublish keeps requiring SYNCED).
AC7. All existing rich-menu backend tests keep passing; new tests cover the
     recreate matrix; frontend vitest covers the new action bar + toasts.

## Test plan

Backend (`tests/test_rich_menu_edit_recreate.py`, patterns from
`test_rich_menu_image_media.py`): the AC matrix above — no-drift no-op,
config-drift recreate sequence (create called, image to NEW id, aliases
re-pointed, users bulk-linked in ≤500 batches, PUBLISHED → default moved,
old deleted, id updated), PENDING-flag recreate, alias-failure abort,
default-failure abort, delete-old-failure tolerated, undecryptable user skipped,
PUT change→PENDING / no-op→SYNCED, upload replace→PENDING (already-uploaded),
upload first-image→stays SYNCED.

Frontend (edit page `__tests__`): action bar renders both save buttons + state
cluster; บันทึกและซิงค์ issues PUT→upload→sync in order and stays on page
(fetchMenu refreshed, no router.push); recreated toast wording; รอซิงค์ badge.
Gates: full `python -m pytest`, `npm run test:unit`, `tsc`/`eslint`/`next build`,
CI (Pytest + Lint/Build + Playwright).
