# Edit page status badge uses the shared menuStatusPill resolver

Written against: 1a16815 (branch fix/rich-menu-image-403)

## Evidence chain

- Surface: `/admin/rich-menus/[id]/edit` — the "สถานะ" (status) badge block in `frontend/app/admin/rich-menus/[id]/edit/page.tsx:407-435`.
- Problem: The edit page renders its status badge with hand-written conditionals covering only 5 outcomes (ACTIVE / SYNC FAILED / รอซิงค์ / SYNCED / DRAFT). It omits the SCHEDULED states (ตามเวลา, หมดเวลา) and the MANUAL state (ซ่อน), so the same menu shows a different status on the edit page than on the list page (e.g. a scheduled menu reads "ตามเวลา" on `/admin/rich-menus` but "SYNCED" on its own edit page). A hidden (MANUAL) menu likewise reads "ซ่อน" on the list but "SYNCED" on edit.
- Design evidence: The list page documents the binding decision inline — "menuStatusPill is the ONE resolver (shared with the edit page) so the states can never diverge" (`frontend/app/admin/rich-menus/page.tsx:211-215`). The resolver `menuStatusPill` in `frontend/lib/rich-menu.ts:75-106` returns `{ label, tone, title? }` for all 7 states including SCHEDULED (`rich-menu.ts:87-98`) and MANUAL-hidden (`rich-menu.ts:99-101`).
- Owner: `frontend/lib/rich-menu.ts` (`menuStatusPill`).
- Scope and affected surfaces: `frontend/app/admin/rich-menus/[id]/edit/page.tsx` (badge block only) and its test `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`.
- Uncertainty: none.

## Design decision

Replace the edit page's hand-rolled badge conditionals with a call to `menuStatusPill(menu)` and render it with the exact same tone-to-class map and `<span>` markup the list page uses. This resolves the root problem (two resolvers that can diverge) by leaving exactly one resolver, as the codebase's own documented decision requires. After the change, every status the list can show renders identically on the edit page, including the SCHEDULED and MANUAL states that are invisible there today.

## Reuse

- `menuStatusPill` from `@/lib/rich-menu` (already imported in the edit page for `needsResync`-adjacent logic; add to the existing import — do NOT reimplement).
- Exemplar markup: `frontend/app/admin/rich-menus/page.tsx:216-236` (the IIFE calling `menuStatusPill(menu)` plus the `pillTone: Record<string, string>` map at lines 218-227). Copy that map verbatim into the edit page with a one-line comment pointing at the list page as the source of truth.
- The edit page's `RichMenu` interface (`[id]/edit/page.tsx:35-51`) already carries every field `menuStatusPill` needs (`status`, `sync_status`, `last_sync_error`, `line_rich_menu_id`, `display_mode`, `display_start_at`, `display_end_at`) — no type changes required. If the compiler disagrees, adapt at the call site only (narrow, don't widen the shared type).

If a new primitive is required: none — the existing system fully expresses the decision. Do NOT extract a shared badge component or tone map; two call sites sharing one resolver plus a verbatim-copied presentation map (with a pointer comment) is the accepted end state per the audit.

## Changes

1. `frontend/app/admin/rich-menus/[id]/edit/page.tsx`
   - Change: Delete the hand-rolled badge `<span>` and its nested ternaries (lines 411-434, keeping the surrounding `<label>สถานะ</label>` wrapper at 406-407). In its place, render `{menu && (() => { const pill = menuStatusPill(menu); ... })()}` using the exemplar markup: `<span title={pill.title} className={...pillTone[pill.tone]}>{pill.label}</span>`. The `menu &&` guard is required because `menu` is nullable before fetch completes (the page redirects on fetch failure but still renders once with `menu === null`). Consequently the status-dot `<span className="w-2 h-2 rounded-full ...">` is removed — the list pill has no dot, and the two presentations must be identical. The `pendingResync` const (line 363) stays: it still drives the action bar below.
   - Preserve: The "สถานะ" label, the tooltip behavior (`title` attribute now comes from `pill.title`, which carries `last_sync_error` / schedule-period text — richer than today's tooltip, by design), and all badge-adjacent layout (no surrounding layout changes).
   - Verify: Open edit pages for (a) a SCHEDULED menu → badge reads "ตามเวลา" with indigo tone, identical to the list; (b) an expired SCHEDULED menu → "หมดเวลา"; (c) a MANUAL hidden synced menu → "ซ่อน"; (d) a PENDING-edits menu → "รอซิงค์" (unchanged); (e) a FAILED menu → "SYNC FAILED" with the `last_sync_error` tooltip (unchanged).
2. `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`
   - Change: Add one test per newly visible state: SCHEDULED menu fixture asserts `getByText('ตามเวลา')`; MANUAL synced-but-unpublished fixture asserts `getByText('ซ่อน')`. Follow the existing `editMenuFixture` + `routeFetch` pattern already in the file. Confirm no existing test asserts the removed dot element or the old badge class strings; the existing 'รอซิงค์' assertions must keep passing unchanged (same label from the shared resolver).
   - Preserve: All existing tests and fixtures; add, don't rewrite.
   - Verify: The edit-page suite passes including the two new tests.

## Scope

- Inherit: the edit page badge only.
- Verify: the list page (`frontend/app/admin/rich-menus/page.tsx`) and its suite — untouched, must still pass (regression check that the shared resolver was not modified).
- Exclude: the edit page header (separate plan), save-button copy (separate plan), the action bar (Sync/Set Active logic), English section titles, and any backend change. Do NOT touch `frontend/lib/rich-menu.ts`.

## Validation

- Product: An admin opening a scheduled/hidden menu's edit page sees the same status word and color as the list row — no more "SYNCED on edit, ตามเวลา on list".
- Interface: routes `/admin/rich-menus` (unchanged) and `/admin/rich-menus/[id]/edit` for each of the 7 pill states; tooltip (`title`) present on error/scheduled states; mobile width (badge is inline, no overflow).
- System: `grep -rn "menuStatusPill" frontend/app/admin/rich-menus` shows exactly two consumer call sites (list + edit) and zero remaining hand-rolled status ternaries on the edit page.
- Repository: from `frontend/`, `npx vitest run app/admin/rich-menus` → all suites green; `npm run lint` → no new warnings in touched files.

## Stop conditions

- Stop if `menuStatusPill`'s signature or tone set changed since this plan was written (re-resolve against `frontend/lib/rich-menu.ts` instead of copying a stale map).
- Stop if the edit page's `menu` object no longer carries the display/sync fields the resolver needs (widening scope to data plumbing, not presentation).
- Stop if product prefers the dot indicator kept — that contradicts byte-identical parity with the list and needs a new decision, not a silent deviation.

## Design documentation

- After acceptance and validation: none — no design doc updates. (The list page's "ONE resolver" comment becomes true; optionally fix its "(shared with the edit page)" claim tense — no, it is already stated as fact; leave it.)
