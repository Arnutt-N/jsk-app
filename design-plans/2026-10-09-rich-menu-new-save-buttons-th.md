# New-page save buttons use the same Thai labels as the edit page

Written against: 1a16815 (branch fix/rich-menu-image-403)

## Evidence chain

- Surface: `/admin/rich-menus/new` — the two save buttons at the bottom of the sticky "Design & Sync" column in `frontend/app/admin/rich-menus/new/page.tsx:743-772`.
- Problem: The create and edit pages perform the same two save actions (draft-only save vs save-and-sync-to-LINE) but label them in different languages. New page: "Save as Draft Only" (line 749) and "Save & Sync to LINE" (line 765), with busy text "Processing..." (lines 749, 761). Edit page: "บันทึกฉบับร่าง" (`[id]/edit/page.tsx:688`), "บันทึกและซิงค์" (`[id]/edit/page.tsx:701`), busy text "กำลังบันทึกและซิงค์..." (`[id]/edit/page.tsx:698`). An admin who learns one page meets foreign labels for the identical action on the other.
- Design evidence: (1) Repository guidance `AGENTS.md` — "UI is in Thai (primary)" — governs all admin surfaces including this one. (2) Direct same-task contradiction: the edit page's Thai labels are the established exemplar for these exact two actions. Thai direction is therefore deterministic (change new → Thai, not edit → English).
- Owner: the edit page's button copy (`frontend/app/admin/rich-menus/[id]/edit/page.tsx:683-703`) as exemplar; no shared component owns these labels today.
- Scope and affected surfaces: `frontend/app/admin/rich-menus/new/page.tsx` (button copy only) and its test `frontend/app/admin/rich-menus/new/__tests__/page.test.tsx`.
- Uncertainty: none.

## Design decision

Replace the four English strings on the new page's save buttons with the edit page's Thai strings, keeping every className, layout, icon, and disabled state byte-identical. Copy-only change; zero visual restyle. This resolves the root problem (same action, two languages) in the direction the Thai-primary rule mandates.

## Reuse

- Exemplar strings from `frontend/app/admin/rich-menus/[id]/edit/page.tsx`: "บันทึกฉบับร่าง" (688), "บันทึกและซิงค์" (701), "กำลังบันทึกและซิงค์..." (698).
- Exact mapping for the new page:
  - line 749 `{isSaving ? 'Processing...' : 'Save as Draft Only'}` → `{isSaving ? 'กำลังบันทึก...' : 'บันทึกฉบับร่าง'}`
  - line 761 `Processing...` (primary busy) → `กำลังบันทึกและซิงค์...` (matches the edit primary busy text verbatim)
  - line 765 `Save & Sync to LINE` → `บันทึกและซิงค์`
- Note on "กำลังบันทึก...": the edit draft button shows no busy text (it only disables), so there is no verbatim exemplar for the draft busy state; "กำลังบันทึก..." is the minimal Thai rendering consistent with the primary busy pattern. This is the plan's single judgment call; flag it in review if product prefers the draft button to disable-without-text like edit (that would be a behavior change — do NOT do it here).

If a new primitive is required: none — no component, token, or primitive is introduced.

## Changes

1. `frontend/app/admin/rich-menus/new/page.tsx`
   - Change: Apply the three string replacements above (lines 749, 761, 765). Nothing else in the file changes — no classNames, no markup, no handler logic.
   - Preserve: Button styling (outline draft button, gradient primary button), the arrow icon, Loader2 busy spinner, disabled states, and all surrounding layout.
   - Verify: Rendered buttons read "บันทึกฉบับร่าง" and "บันทึกและซิงค์"; while saving they read "กำลังบันทึก..." and "กำลังบันทึกและซิงค์..." respectively.
2. `frontend/app/admin/rich-menus/new/__tests__/page.test.tsx`
   - Change: Grep the file for the old English strings first — at audit time it contained no assertions on them, so the suite should pass unmodified. Add two assertions reusing the file's existing render/fetch-mock pattern: `getByRole('button', { name: 'บันทึกฉบับร่าง' })` and `getByRole('button', { name: 'บันทึกและซิงค์' })` are present. If (contrary to the audit) English-string assertions exist, update them to the Thai strings instead of adding.
   - Preserve: All existing tests and fixtures.
   - Verify: The new-page suite passes including the label assertions.

## Scope

- Inherit: the new page's two save buttons only.
- Verify: the edit page (untouched exemplar — regression check only) and the new page's other copy (must remain exactly as-is).
- Exclude: the new page's remaining English section copy ("Basic Information", "Template & Actions", "Design & Sync", "Upload Rich Menu Image", template modal copy) — a deliberate follow-up, NOT this change. One correction per plan; do not expand into a page-wide translation pass. Also excluded: status badge and header (separate plans), any backend change.

## Validation

- Product: An admin sees the same two Thai save actions on create and edit; no English remains on either save button in either busy or idle state.
- Interface: route `/admin/rich-menus/new` in idle and `isSaving` states; Thai strings fit the existing button widths at mobile width (verify no overflow — Thai glyphs are narrower than the English they replace, so risk is minimal, but check).
- System: `grep -rn "Save as Draft Only\|Save & Sync to LINE\|Processing..." frontend/app/admin/rich-menus/new/page.tsx` returns zero matches; the edit page file is untouched (`git diff --stat` shows only the new page + its test).
- Repository: from `frontend/`, `npx vitest run app/admin/rich-menus` → all suites green; `npm run lint` → no new warnings in touched files.

## Stop conditions

- Stop if product wants English retained (e.g. bilingual labels) — that contradicts the Thai-primary rule and needs a new decision, not a silent deviation.
- Stop if the new-page test file asserts English strings in a way that suggests other suites depend on them (report the coupling first).
- Stop if the draft-busy string choice ("กำลังบันทึก...") is rejected in review — escalate the single judgment call rather than inventing a third option.

## Design documentation

- After acceptance and validation: none — no design doc updates.
