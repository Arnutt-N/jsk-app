# Plan: Admin UI Consistency Batch (2026-10-23)

## Phases (each ends with tests green before next starts)
1. **Shared bits** — extend `DateRangePicker` with `this-year` preset; confirm `ActionIconButton` variants cover eye/toggle needs. Tests: existing ui suites.
2. **Row actions** — users view-link; files edit+toggle (backend check first); canned view+toggle (backend check first); rich-menus view modal; reply-objects view+toggle+skn→jsk fix.
3. **Filters** — audit DateRangePicker + dropdown-or-text decision; friends DateRangePicker; clear buttons on reports/audit/friends (+bookings keeps its own).
4. **Buttons/views** — chat-histories refresh restyle; reply-objects grid/list toggle; reply new-template (pending decision); bookings color (pending decision); image-resize AVIF/SVG accept.
5. **Reference pages** — design-system inventory refresh; dashboard (pending decision).
6. **Verify** — `tsc`, affected vitest suites, lint, push, babysit CI (fix-ci, get-pr-comments), Thai summary + phone checklist.

## Files (expected)
- `frontend/components/ui/DateRangePicker.tsx` (+preset)
- `frontend/app/admin/{users,files,canned-responses,rich-menus,reply-objects}/page.tsx`
- `frontend/app/admin/{audit,friends,reports,chat-histories,bookings,image-resize}/page.tsx`
- `frontend/app/admin/design-system/page.tsx`, `frontend/app/admin/page.tsx`
- tests next to each touched page.

## Risks
- Toggles need backend `is_active`/rename support → check first; if missing, scope toggle out and note follow-up (no schema change in this batch).
- Audit dropdowns need distinct-values endpoint → fallback to text inputs + clear.
- Reply new-template as full page ≈ 1 new route + form move; modal enlarge ≈ 1-file change.

## Validation (per phase)
`npx tsc --noEmit` + `npx vitest run <touched dirs>` green; final: full unit suite + `gh pr checks --watch`.
