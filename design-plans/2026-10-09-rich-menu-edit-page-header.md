# Edit page header uses the shared PageHeader owner

Written against: 1a16815 (branch fix/rich-menu-image-403)

## Evidence chain

- Surface: `/admin/rich-menus/[id]/edit` — the header block in `frontend/app/admin/rich-menus/[id]/edit/page.tsx:368-379` (white boxed card `bg-white p-4 rounded-xl shadow-sm border` with a raw "← กลับ" link).
- Problem: The edit header is hand-drawn and visually contradicts its same-task siblings: the list page (`frontend/app/admin/rich-menus/page.tsx:142-155`) and the create page (`frontend/app/admin/rich-menus/new/page.tsx:439-446`) both render the shared `PageHeader` owner (chromeless flex row, `text-text-primary` title, action slot on the right). The edit page is the only one of the three with a boxed card header and a text "← กลับ" link, so navigating list → edit visibly changes the page furniture for no task reason.
- Design evidence: `frontend/app/admin/components/PageHeader.tsx:13-42` — the governing header owner with `title` / `subtitle` / `children` (action slot) props. Exemplars: list page header (title + subtitle + Buttons in slot) and, closest sibling for a back-navigation header, the new page header (`new/page.tsx:439-446`: `<PageHeader title="New Rich Menu">` with an icon-only back `<Link>` rendering `<ArrowLeft>`).
- Owner: `frontend/app/admin/components/PageHeader.tsx`.
- Scope and affected surfaces: `frontend/app/admin/rich-menus/[id]/edit/page.tsx` (header block only) and its test `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`.
- Uncertainty: none.

## Design decision

Replace the edit page's boxed header `<div>` with the shared `PageHeader`, mirroring the new page's back-navigation header exactly: title "Edit Rich Menu", subtitle showing the edited menu's name, and the same icon-only back `<Link>` (ArrowLeft) in the action slot. This resolves the root problem (a one-off header implementation) by routing all three rich-menu pages through the single header owner. Title and menu-name subtitle text are preserved verbatim; only the furniture changes.

## Reuse

- `PageHeader` from `@/app/admin/components/PageHeader` (note: the new page imports it via the relative path `../../components/PageHeader` at `new/page.tsx:7`; the edit page lives one level deeper, so the equivalent relative import is `../../../components/PageHeader` — or use the `@/app/...` alias exactly as the list page does at `page.tsx:7`. Either is acceptable; prefer the alias form for clarity).
- `ArrowLeft` from `lucide-react` (already a project dependency; the new page imports it at `new/page.tsx:5`).
- Exemplar: `frontend/app/admin/rich-menus/new/page.tsx:439-446` — copy the back-Link markup verbatim (`p-2 rounded-xl hover:bg-surface-hover transition-colors` + `<ArrowLeft className="w-5 h-5 text-text-secondary" />`), adding only `aria-label="กลับ"` for accessibility (the new page lacks it; this is a strict improvement, not a visual deviation).

If a new primitive is required: none — the existing system fully expresses the decision.

## Changes

1. `frontend/app/admin/rich-menus/[id]/edit/page.tsx`
   - Change: Delete the header card `<div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">` block (lines 368-379, including the `<h1>` and the "← กลับ" link). Replace it with:
     `<PageHeader title="Edit Rich Menu" subtitle={menu ? \`แก้ไขเมนู: ${menu.name}\` : undefined} className="mb-8">` + the exemplar back-Link as its child + `</PageHeader>`. The `mb-8` matches the new page's header spacing (`new/page.tsx:439`); the outer container keeps its existing `space-y-6` (do not restyle the page body to match the new page's `max-w-6xl` — body layout convergence is out of scope).
   - Preserve: The exact title text "Edit Rich Menu", the subtitle text pattern "แก้ไขเมนู: {name}", the back destination `/admin/rich-menus`, and everything below the header (form card, area actions, action bar untouched).
   - Verify: The edit page top renders a chromeless title row identical in structure to the new page's header; clicking the arrow returns to `/admin/rich-menus`; no white card remains above the form.
2. `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`
   - Change: Update only assertions that target the removed markup (the "← กลับ" link text, if asserted — grep first). Add/keep one assertion that the back link points to `/admin/rich-menus` (query by `aria-label="กลับ"` or role+href). Follow existing fixture patterns; do not restructure the file.
   - Preserve: All other tests unchanged.
   - Verify: The edit-page suite passes.

## Scope

- Inherit: the edit page header only.
- Verify: `PageHeader` itself (untouched — confirm no prop changes were needed) and the list + new pages (untouched, visual regression check only).
- Exclude: form-card styling, body max-width/layout convergence between new and edit, status badge (separate plan), save-button copy (separate plan), and any backend change.

## Validation

- Product: An admin moving list → new → edit sees one consistent header pattern (title + optional subtitle + right-side actions), with back navigation in the same place on new and edit.
- Interface: routes `/admin/rich-menus/[id]/edit` at desktop and mobile widths (PageHeader stacks title/actions on small screens per its `flex-col sm:flex-row`); long Thai menu names truncate with ellipsis per PageHeader's `truncate` (verify with a 60+ char name — must not push the back button off-screen).
- System: `grep -rn "PageHeader" frontend/app/admin/rich-menus --include=page.tsx` shows all three pages (list, new, edit) importing the shared owner; no `bg-white p-4 rounded-xl` header card remains in the edit page.
- Repository: from `frontend/`, `npx vitest run app/admin/rich-menus` → all suites green; `npm run lint` → no new warnings in touched files.

## Stop conditions

- Stop if `PageHeader`'s props changed since this plan was written (re-resolve against `frontend/app/admin/components/PageHeader.tsx`).
- Stop if product wants the edit header to carry extra actions (e.g. Sync in the header) — that widens scope beyond parity and needs a new decision.
- Stop if the edit test suite asserts layout classes of the old card that turn out to be load-bearing for other tests (report, don't silently delete).

## Design documentation

- After acceptance and validation: none — no design doc updates.
