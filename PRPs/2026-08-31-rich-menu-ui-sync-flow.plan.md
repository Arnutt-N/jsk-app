# PRP: Rich Menu UX — Sync Flow & Edit Parity — Implementation Plan

**Created:** 2026-08-31
**Status:** Approved for implementation (self-review round complete)
**Branch:** `feat/rich-menu-ui-sync-flow`
**PRD:** `PRPs/2026-08-31-rich-menu-ui-sync-flow.prd.md`

---

## Ground rules

- Frontend-only; no backend change (endpoints/fields already exist).
- Reuse `Button` (isLoading), `canPublish`, `parseSyncResult`,
  `readErrorMessage` — no parallel implementations.
- Tests land in the same commit as the code they pin.
- Local gates: vitest (rich-menu files) + `tsc --noEmit` + eslint (changed
  files) + `next build`.

## Phase 1 — List page: visible sync flow (`app/admin/rich-menus/page.tsx`)

1. `handleSync(id)` gains `syncingId` state: set before fetch, clear in
   `finally`. The Re-sync / Sync to LINE button passes
   `isLoading={syncingId === menu.id}` (Button's overlay spinner + disable).
   Per-row disable via `syncingId === menu.id`; other rows stay clickable.
2. Success branch: build the next-step toast text —
   `status === 'PUBLISHED'` → "ซิงค์สำเร็จ — เมนูนี้กำลังใช้งานอยู่แล้ว",
   else → "ซิงค์สำเร็จ — กด 'Set Active' เพื่อใช้งานเมนูนี้" (append the
   backend `message` only when it exists). Failure branch: existing
   parseSyncResult toast, unchanged.
3. No other layout change: Set Active reveal keeps being driven by
   `fetchMenus()` refetch + `canPublish`.

## Phase 2 — Edit page: area overlay + sync machine
(`app/admin/rich-menus/[id]/edit/page.tsx`)

1. Local `RichMenu` interface adds `sync_status: string` and
   `last_sync_error: string | null` (backend GET /{id} already returns both).
2. Status pill in the form becomes the sync-aware badge (SYNCED / SYNC
   FAILED / PENDING / ACTIVE) with `last_sync_error` as `title` tooltip —
   same classes as the list page badge.
3. Image preview gains the numbered area overlay, derived from
   `menu.config.areas` bounds against `menu.config.size` (same scale math
   as the create page: x/width vs 2500, y/height vs canvas height). Render
   over both stored and newly picked previews; keep the hover
   "เปลี่ยนรูปภาพ" overlay.
4. Action buttons next to "บันทึกการแก้ไข" implement the state machine:
   FAILED → Re-sync (outline, isLoading while `syncBusy`); canPublish &&
   not PUBLISHED → Set Active (success, isLoading while `publishBusy`);
   PUBLISHED → "Live Now" pill; else → Sync to LINE (primary). Both flows
   re-fetch the menu after completion (`fetchMenu`) and toast via
   parseSyncResult / readErrorMessage.
5. `menuId` number-coerce once for the fetch URLs (it is a route string).

## Phase 3 — Tests

**File:** `frontend/app/admin/rich-menus/__tests__/page.test.tsx` (list)
- New: clicking Re-sync → button shows spinner state (assert
  `getByRole('button', { name: /กำลังซิงค์|Syncing/i })` or
  `disabled` while the fetch promise is pending — use a deferred promise
  to observe in-flight state).
- New: sync success (not published) → toast text contains "Set Active".
- New: after refetch returns canPublish menu, Set Active button renders
  (existing fixture covers; keep asserting).

**File:** `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`
(new directory)
- Render with a FAILED 2-area menu fixture → assert numbered overlay
  markers (texts "1", "2") over the image, "SYNC FAILED" badge, and
  Re-sync button present.
- Render with SYNCED + PUBLISHED menu → "Live Now" (no Set Active
  button), badge ACTIVE.

**Validation:** `npx vitest run app/admin/rich-menus` then
`npx tsc --noEmit`, eslint on changed files, `npm run build`.

## Phase 4 — Ship

- Commit (code + tests), push, PR with PRD link, merge per `git_workflow`;
  PRD Status → merged.