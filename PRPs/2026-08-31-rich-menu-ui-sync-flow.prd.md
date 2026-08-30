# PRD: Rich Menu UX — Edit-page Parity (Template Overlay + Sync Actions) & List-page Sync Flow

**Created:** 2026-08-31
**Status:** Draft → self-review (two-axis) applied
**Branch:** `feat/rich-menu-ui-sync-flow`
**Companion plan:** `PRPs/2026-08-31-rich-menu-ui-sync-flow.plan.md`
**Follow-up to:** PR #214 (user smoke-tested the sync fix — it works; these are the UI gaps hit during that smoke)

---

## 1. Executive Summary

User smoke test of the rich-menu admin surfaced three UX gaps:

| # | Gap | Where |
|---|---|---|
| G1 | Edit page shows no template-area preview — the create page overlays numbered area boxes over the menu image; the edit page shows the bare image, so the admin can't see which area each action editor belongs to | `/admin/rich-menus/[id]/edit` |
| G2 | Edit page has only "บันทึกการแก้ไข" — after a failed sync the admin must go back to the list to re-sync/publish; the actions they need next are missing from the page they're on | `/admin/rich-menus/[id]/edit` |
| G3 | List page Re-sync button (white/outline, no spinner) gives no feedback while syncing; when it silently succeeds it *morphs into* "Set Active" with no explanation — the admin has no idea a second step is required to actually go live | `/admin/rich-menus` table |

G1/G2 are parity gaps with the create page and the backend contract that
already exists (`GET /{id}` returns `config.areas` + `sync_status` +
`last_sync_error`; sync/publish endpoints are live). G3 is a
feedback/affordance problem.

## 2. Design decisions

### G1 — Template overlay on the edit page (read-only)
Derive the overlay from the menu's own `config.areas` (the saved bounds) —
NOT from `PRESET_TEMPLATES` matching: canvas size is fixed at creation
(`RichMenuUpdate` omits `template_type`), so the saved areas ARE the truth.
Render the same numbered-box overlay the create page renders over the picked
image. No template-switching UI on edit (canvas is immutable — switching
templates would silently break bounds).

### G2 — Sync actions on the edit page
Mirror the list page's state machine, reusing `canPublish` from
`lib/rich-menu.ts` (single source of truth):
- `sync_status === 'FAILED'` → outline **"Re-sync"** button
- `canPublish(menu)` && `status !== 'PUBLISHED'` → **"Set Active"** (success
  variant)
- `status === 'PUBLISHED'` → read-only **"Live Now"** pill
- else (PENDING, synced-but-not-published) → **"Sync to LINE"** primary
The edit page needs `sync_status` in its local `RichMenu` interface — the
backend `GET /{id}` response already includes it.

### G3 — List page sync flow (the design question the user asked)
User's instinct is right: **split the two actions into a guided 2-step flow
and make the second step appear only after the first succeeds** — but with
explicit feedback at each transition, never silent morphing:

1. **Re-sync button gets a spinner** (`Button isLoading` — the component
   already supports it) and disables during the call.
2. **On success, the row updates and "Set Active" appears as a distinct,
   attention-drawing success-variant button.** The row badge also flips
   SYNC FAILED → SYNCED, so the state change is visible in two places.
3. **A success toast explicitly says the next step**: e.g.
   "ซิงค์สำเร็จ — กด 'Set Active' เพื่อใช้งานเมนูนี้" (and if the menu is
   already PUBLISHED: "ซิงค์สำเร็จ — เมนูนี้กำลังใช้งานอยู่แล้ว"). This is the
   piece that makes the flow self-explanatory without a manual.
4. Keep the single-slot layout (no separate always-visible Set Active
   column): the reveal-after-success is exactly the guidance the user
   asked for ("ถ้ารีซิงสำเร็จจึงจะกดเซ็ทแอคทีฟได้"), and it matches the
   existing `canPublish` gating that already prevents publishing un-synced
   menus.

Non-goals: no backend changes (all endpoints/fields exist), no template
switching on edit, no per-row dropdown menus, no dark-mode work beyond what
existing components already carry.

## 3. Acceptance Criteria

### AC-1 (G1): Edit-page image preview overlays area boxes
- **AC-1.1** The preview renders one numbered box per `config.areas` entry,
  positioned by the saved bounds scaled to the canvas (same math as the
  create page), over the current image.
- **AC-1.2** Boxes show on both the stored image and a newly picked image
  preview; hover states and the "เปลี่ยนรูปภาพ" overlay keep working.

### AC-2 (G2): Edit page offers the sync state machine
- **AC-2.1** A status area shows the real sync badge (SYNCED / SYNC FAILED /
  PENDING / ACTIVE) + `last_sync_error` tooltip text when present — replacing
  the DRAFT/ACTIVE-only pill that hides FAILED.
- **AC-2.2** Buttons per the state machine in §2; each uses the shared
  `Button` component with `isLoading` while its call is in flight; after
  sync/publish the page re-fetches the menu and re-renders the machine.
- **AC-2.3** Sync result interpretation goes through `parseSyncResult` (200
  bodies carrying `image_upload_error` must still error-toast); publish
  failures surface the backend detail via `readErrorMessage`.

### AC-3 (G3): List-page sync flow is visible and guided
- **AC-3.1** While syncing, the clicked button shows a spinner and is
  disabled; other rows' buttons stay usable.
- **AC-3.2** On sync success the toast names the next step ("กด Set Active…")
  unless the menu is already PUBLISHED; on failure the existing error toast
  (parseSyncResult) is unchanged.
- **AC-3.3** "Set Active" appears (only) when `canPublish` is true — the
   reveal is driven by the refetched row state, not local guesswork.

### AC-4: Pinned by tests
- List page: spinner state during sync; success toast carries the Set Active
  guidance; Set Active button appears after refetch.
- Edit page: overlay boxes render for a 2-area menu; sync badge reflects
  FAILED vs SYNCED; Re-sync button visible when FAILED.

## 4. Operator note

After deploy: re-sync flow is now guided end-to-end — click Re-sync (spinner
shows), toast tells you to click Set Active, the button is right there on
the revealed state. Edit page shows the area layout you're editing and the
same sync actions as the list.