# PRP Plan: Rich-Menu New/Edit UI Parity (3 fixes)

## Metadata

- Complexity: Small (2 product files + 2 test files, presentation/copy only,
  zero API/backend/schema changes)
- Source PRD: `.claude/PRPs/prds/2026-10-09-rich-menu-ui-parity.prd.md`
  (requirements R1/R2/R3 map to Tasks 1/2/3 below; PRD §3 maps to
  NOT Building; PRD AC1–AC4 map to S1–S4)
- Branch: `feat/rich-menu-ui-parity` (to be created at implementation, based
  on `main@f8ecea0`)
- Working directory: ALL shell commands run from `frontend/` unless stated.
  (`cd frontend` first; every validation command below assumes it.)
- Installed versions (verified): next `16.1.1`, vitest `^2.1.9`, jsdom
  `^25.0.1`, eslint `^9`, typescript `^5`, lucide-react `^0.473.0` (SOURCE:
  `frontend/package.json:31,58,55,53,57,29`).

## Summary

Make the rich-menu edit page consistent with its same-task siblings in
3 units: (1) route the edit status badge through the shared
`menuStatusPill` resolver so SCHEDULED/MANUAL states stop reading SYNCED;
(2) route the edit header through the shared `PageHeader` owner with the
new page's icon-only back link; (3) relabel the new-page save buttons in
Thai to match the edit page. Each unit ships its own tests; one commit
per unit.

## UX Clarity

User-visible UI change (Thai-primary admin). Before/after per fix:

- R1 badge — before: a SCHEDULED menu reads "ตามเวลา" on
  `/admin/rich-menus` but "SYNCED" on its own edit page; a MANUAL hidden
  menu reads "ซ่อน" vs "SYNCED". After: edit badge shows the identical
  word, tone, and tooltip as the list pill for all 8 outcomes.
- R2 header — before: edit page tops a white boxed card
  (`bg-white p-4 rounded-xl shadow-sm border`) with a raw "← กลับ" text
  link; list/new use a chromeless `PageHeader` row. After: edit renders
  the same `PageHeader` structure (title "Edit Rich Menu", subtitle
  "แก้ไขเมนู: {name}", ArrowLeft back link right).
- R3 buttons — before: new page "Save as Draft Only" / "Save & Sync to
  LINE" (+ "Processing..." busy); edit page Thai equivalents. After: new
  page reads "บันทึกฉบับร่าง" / "บันทึกและซิงค์" (busy "กำลังบันทึก..." /
  "กำลังบันทึกและซิงค์..."), styling untouched.

## Files to Change

| # | File | Lines touched | What |
|---|------|---------------|------|
| 1 | `frontend/app/admin/rich-menus/[id]/edit/page.tsx` | :6 lucide import (+ArrowLeft), :13 lib import (+menuStatusPill), 368–379 header block replace, 406–434 badge block replace | R1 badge + R2 header (Tasks 1–2) |
| 2 | `frontend/app/admin/rich-menus/new/page.tsx` | 749, 761, 765 (3 string sites) | R3 Thai labels (Task 3) |
| 3 | `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx` | append 4 tests before final `});` (313-line file; helpers at :35–93) | R1 (3) + R2 (1) assertions |
| 4 | `frontend/app/admin/rich-menus/new/__tests__/page.test.tsx` | append 1 test before final `});` (44-line file; `renderPage` at :18–26) | R3 assertions |

## NOT Building

- No body-layout convergence (edit keeps its card/grid; new keeps its
  3-step wizard grid).
- No other copy translation ("Basic Information", "Template & Actions",
  "Design & Sync", template modal stay English — follow-up).
- No action-bar, area-action, template, sync, or publish logic changes.
- No backend/API/migration changes; no edits to
  `frontend/lib/rich-menu.ts` or `frontend/app/admin/components/PageHeader.tsx`.
- No new shared badge/header component (verbatim copy + pointer comment is
  the audited end state).
- No bilingual labels; Thai-primary per repo guidance.

## Patterns & Conventions (with sources)

- Test fixtures (edit suite): `editMenuFixture(overrides)` at
  `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx:35-61`
  (defaults: `status: 'DRAFT'`, `sync_status: 'SYNCED'`,
  `line_rich_menu_id: 'richmenu-live'`, `display_mode: 'ALWAYS'`; carries
  `display_mode/display_start_at/display_end_at` at :23-25, so SCHEDULED
  tests need overrides only — no fixture-shape change).
- Fetch mock: `routeFetch(routes)` at `:79-84` keyed by `"METHOD url"`
  (preferred over `mockResolvedValueOnce` chains — see the flakiness note
  at :73-78); URL constants `MENU_URL` (`/api/v1/admin/rich-menus/1`) and
  `ALIASES_URL` at :70-71.
- Render: `renderPage(fetchMock)` at `:86-93` (stubs global fetch, wraps
  `<ToastProvider>`); new-page suite equivalent at
  `frontend/app/admin/rich-menus/new/__tests__/page.test.tsx:18-26`.
- Badge assertion pattern (mirror): `:123`
  `await waitFor(() => expect(screen.getByText('SYNC FAILED')).toBeInTheDocument());`
- Link assertion pattern (mirror): `:186`
  `expect(screen.getByRole('link', { name: 'ยกเลิก' })).toBeInTheDocument();`
- Suite setup: `// @vitest-environment jsdom` + `next/navigation` mock at
  edit-test :1-12 (new-test :1-10); `next/link` is NOT mocked, so it
  renders a real `<a href>` (href assertions reliable).
- Naming: UI copy in Thai (Thai-primary); test names follow
  `'shows X when Y'` (e.g. :113, :151).
- Error-handling: N/A — none of the three changes adds branches that
  throw or reject (pure render/copy swaps; the only guard, `menu &&`, is
  a null-render guard, not error handling). No new pattern needed.
- Logging: N/A — no `logger` calls added (these components log only
  fetch failures, untouched here). No new pattern needed.
- Dependencies used (all pre-installed, no install step):
  `PageHeader` from `@/app/admin/components/PageHeader` (SOURCE: used by
  list page at `frontend/app/admin/rich-menus/page.tsx:7`);
  `menuStatusPill` from `@/lib/rich-menu` (SOURCE: defined at
  `frontend/lib/rich-menu.ts:75`, consumed by list page at `:217`);
  `ArrowLeft` from `lucide-react` (SOURCE: used by new page at
  `frontend/app/admin/rich-menus/new/page.tsx:5`).

## Step-by-Step Tasks

### Task 0 — Capture the pre-change baseline (evidence, no commit)

- ACTION: Run the rich-menus suites once; record green baseline so any
  post-change failure is attributable to this work.
- IMPLEMENT: from `frontend/`:
  `npx vitest run app/admin/rich-menus --reporter=basic`
- MIRROR: baseline-first convention from the repo's prior test-plan PRP
  (SOURCE: `.claude/PRPs/plans/2026-10-05-flaky-frontend-timeouts.plan.md:50-63`).
- VALIDATE: all 3 suites (list, new, edit) green; note the test count.
- GOTCHA: Run BEFORE any edit — a green run only proves the tree it ran on.

### Task 1 — Edit badge via shared menuStatusPill (R1)

- ACTION: Replace the edit page's hand-rolled status ternaries with
  `menuStatusPill(menu)` rendered exactly like the list pill; add 3 tests
  for the newly visible states.
- IMPLEMENT in `frontend/app/admin/rich-menus/[id]/edit/page.tsx`:
  1. Line 13: extend the `@/lib/rich-menu` import with `menuStatusPill`
     (current: `canPublish, ensureRichMenuImage, needsResync,
     parseSyncResult, RichMenuDisplayMode, RichMenuSyncStatus`).
  2. Above the component (module scope, after imports), add the tone map
     copied VERBATIM from the list page (SOURCE:
     `frontend/app/admin/rich-menus/page.tsx:218-227`) with this pointer
     comment on top:
     `// Verbatim copy of the list page pillTone map (rich-menus/page.tsx) —`
     `// keep identical; menuStatusPill is the ONE resolver for both pages.`
     Map (8 entries): active → emerald classes; error → red; pending →
     amber; scheduled → indigo; inactive → slate; hidden → slate; synced →
     brand; draft → amber (copy each full class string from :218-227 —
     do not retype from memory).
  3. Delete lines 411–434 (the hand-rolled `<span>` + nested ternaries +
     status dot), keeping the `<label>สถานะ</label>` wrapper at 406–407,
     and render in its place:
     `{menu && (() => { const pill = menuStatusPill(menu); return ( <span title={pill.title} className={\`px-2.5 py-1 text-[10px] font-bold rounded-full border ${pillTone[pill.tone]}\`}>{pill.label}</span> ); })()}`
- MIRROR: list-page exemplar (SOURCE:
  `frontend/app/admin/rich-menus/page.tsx:216-236`) — same IIFE shape,
  same span, same map; the `menu &&` guard is required because `menu` is
  nullable before fetch completes.
- VALIDATE (from `frontend/`):
  `npx vitest run app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`
  green, including the 3 new tests below; existing 'รอซิงค์' assertions
  (:160, :172) still pass unchanged.
- GOTCHA:
  - G1.1: The status-dot span is REMOVED (the list pill has no dot) —
    identical presentation is the requirement, not dot preservation.
  - G1.2: `pendingResync` (line 363) STAYS — it still drives the action
    bar below the badge.
  - G1.3: Do NOT touch `frontend/lib/rich-menu.ts` (resolver is correct;
    only its consumer changes).
- Test code — append inside the top-level `describe`, before the final
  `});` of
  `frontend/app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`
  (313 lines; uses `editMenuFixture` :35, `routeFetch` :79, `renderPage`
  :86, `MENU_URL`/`ALIASES_URL` :70-71 — all already in file, no new
  imports):
  `it('shows ตามเวลา badge for a scheduled menu', async () => { const menu = editMenuFixture({ display_mode: 'SCHEDULED', display_start_at: '2026-11-01T00:00:00+07:00', display_end_at: '2026-11-30T23:59:59+07:00' }); const fetchMock = routeFetch({ ['GET ' + MENU_URL]: menu, ['GET ' + ALIASES_URL]: [] }); renderPage(fetchMock); await waitFor(() => expect(screen.getByText('ตามเวลา')).toBeInTheDocument()); });`
  `it('shows หมดเวลา badge for an expired scheduled menu', async () => { const menu = editMenuFixture({ display_mode: 'SCHEDULED', status: 'INACTIVE', display_start_at: '2026-09-01T00:00:00+07:00', display_end_at: '2026-09-30T23:59:59+07:00' }); ...same fetch/render...; await waitFor(() => expect(screen.getByText('หมดเวลา')).toBeInTheDocument()); });`
  `it('shows ซ่อน badge for a hidden manual menu', async () => { const menu = editMenuFixture({ display_mode: 'MANUAL' }); ...same fetch/render...; await waitFor(() => expect(screen.getByText('ซ่อน')).toBeInTheDocument()); });`
  (`getByText` uses full-string match, so 'ซ่อน' never collides with the
  'ซ่อน (เตรียมใช้งาน)' radio label, and 'ตามเวลา' never collides with
  'ตามช่วงเวลา'.)
- Commit: `fix(rich-menu): edit badge via shared menuStatusPill`.

### Task 2 — Edit header via shared PageHeader (R2)

- ACTION: Replace the edit page's boxed header card with `PageHeader`
  mirroring the new page's back-navigation header; add 1 header test.
  Pre-resolved grep (verified 2026-10-09): ZERO assertions in the edit
  suite reference the old header (no 'กลับ', 'Edit Rich Menu', or
  back-link matches) — so no existing test needs updating.
- IMPLEMENT in `frontend/app/admin/rich-menus/[id]/edit/page.tsx`:
  1. Line 6: extend `import { Loader2 } from 'lucide-react'` to
     `import { ArrowLeft, Loader2 } from 'lucide-react'`.
  2. Add `import PageHeader from '@/app/admin/components/PageHeader';`
     (alias form per SOURCE: list `page.tsx:7`). (`Link` is already
     imported at line 4 — do not re-import.)
  3. Delete the header card `<div className="flex justify-between
     items-center bg-white p-4 rounded-xl shadow-sm border
     border-slate-100">` block (lines 368–379, incl. `<h1>` and the
     "← กลับ" link) and render in its place:
     `<PageHeader title="Edit Rich Menu" subtitle={menu ? \`แก้ไขเมนู: ${menu.name}\` : undefined} className="mb-8"> <Link href="/admin/rich-menus" aria-label="กลับ" className="p-2 rounded-xl hover:bg-surface-hover transition-colors"> <ArrowLeft className="w-5 h-5 text-text-secondary" /> </Link> </PageHeader>`
     (`mb-8` matches the new page header per SOURCE: `new/page.tsx:439`;
     the outer container keeps its existing `space-y-6`.)
- MIRROR: new-page back-Link markup verbatim (SOURCE:
  `frontend/app/admin/rich-menus/new/page.tsx:439-446`, classes at
  :442-444) plus `aria-label="กลับ"` (strict accessibility addition, no
  visual change — the new page lacks it).
- VALIDATE (from `frontend/`):
  `npx vitest run app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx`
  green, including the new header test below; full existing suite
  unchanged and green.
- GOTCHA:
  - G2.1: Do NOT restyle the page body to `max-w-6xl` (body-layout
    convergence is explicitly out of scope).
  - G2.2: `subtitle` takes `undefined` (not `''`) when `menu` is null so
    PageHeader omits the `<p>` (SOURCE: `PageHeader.tsx:31-35`
    conditional render).
- Test code — append inside the top-level `describe`, before the final
  `});` (same file as Task 1; `screen.findByRole` needs no new import):
  `it('renders the shared header with a back link to the list', async () => { const fetchMock = routeFetch({ ['GET ' + MENU_URL]: editMenuFixture(), ['GET ' + ALIASES_URL]: [] }); renderPage(fetchMock); const backLink = await screen.findByRole('link', { name: 'กลับ' }); expect(backLink).toBeInTheDocument(); expect(backLink.getAttribute('href')).toBe('/admin/rich-menus'); expect(screen.getByText('Edit Rich Menu')).toBeInTheDocument(); });`
  (Accessible name 'กลับ' comes from `aria-label`; distinct from the
  'ยกเลิก' link at :186. `next/link` is unmocked in this suite
  (:9-12 mock only `next/navigation`), so `href` renders for real.)
- Commit: `fix(rich-menu): edit header via shared PageHeader`.

### Task 3 — New-page save buttons in Thai (R3)

- ACTION: Relabel the two new-page save buttons (idle + busy) with the
  edit page's Thai strings; add label assertions.
- IMPLEMENT in `frontend/app/admin/rich-menus/new/page.tsx` — exactly
  these 3 string-site replacements, nothing else:
  1. Line 749 `{isSaving ? 'Processing...' : 'Save as Draft Only'}` →
     `{isSaving ? 'กำลังบันทึก...' : 'บันทึกฉบับร่าง'}`
  2. Line 761 `Processing...` (primary busy) → `กำลังบันทึกและซิงค์...`
     (verbatim per SOURCE: edit `page.tsx:698`)
  3. Line 765 `Save & Sync to LINE` → `บันทึกและซิงค์` (verbatim per
     SOURCE: edit `page.tsx:701`)
- MIRROR: edit-page exemplar strings (SOURCE:
  `frontend/app/admin/rich-menus/[id]/edit/page.tsx:688,698,701`). The
  draft-busy 'กำลังบันทึก...' has no verbatim exemplar (the edit draft
  button only disables); it is the plan's single judgment call — see
  G3.1 — and follows the primary busy pattern.
- VALIDATE (from `frontend/`):
  `npx vitest run app/admin/rich-menus/new/__tests__/page.test.tsx`
  green, including the new assertions below.
- GOTCHA:
  - G3.1: If review rejects 'กำลังบันทึก...', escalate — do NOT invent a
    third option and do NOT change the edit page to match (edit is the
    exemplar, new follows).
  - G3.2: No className/markup/handler edits — `git diff --stat` for this
    task must show the page file with string-only changes.
- Test code — append inside the `describe`, before the final `});` of
  `frontend/app/admin/rich-menus/new/__tests__/page.test.tsx` (44 lines;
  uses `renderPage()` at :18-26, already in file, no new imports):
  `it('labels the save buttons in Thai like the edit page', () => { renderPage(); expect(screen.getByRole('button', { name: 'บันทึกฉบับร่าง' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'บันทึกและซิงค์' })).toBeInTheDocument(); });`
  (Verified 2026-10-09: the file contains no English-string assertions
  today, so this is purely additive. The primary button's svg icon
  contributes no accessible-name text.)
- Commit: `fix(rich-menu): Thai save-button labels on new page`.

Publish order: Task 1 → Task 2 → Task 3 (one commit each; Tasks 1–2 share
the edit page file but touch disjoint line spans — badge 406–434 vs
header 368–379 — so no hunk conflicts).

## Validation Commands (all exist — verified in `frontend/package.json`)

| Purpose | Command (from `frontend/`) |
|---|---|
| Focused suites | `npx vitest run app/admin/rich-menus` (vitest `^2.1.9` installed) |
| Full unit suite | `npm run test:unit` (= `vitest run`, no shard/worker flags in CI) |
| Lint touched files | `npx eslint app/admin/rich-menus/[id]/edit/page.tsx app/admin/rich-menus/new/page.tsx app/admin/rich-menus/[id]/edit/__tests__/page.test.tsx app/admin/rich-menus/new/__tests__/page.test.tsx` (flat config in repo) |
| Production build gate | `npm run build` (= `next build`, package.json:7) — run once at the end; presentation-only change must keep it green |
| Diff-scope proof (from REPO ROOT — overrides the `frontend/` default) | `git diff main...HEAD --stat` → exactly the 4 files in Files to Change; `git diff main...HEAD -- frontend/lib/rich-menu.ts frontend/app/admin/components/PageHeader.tsx` → empty |

## Testing Strategy + Edge-Case Checklist

New assertions (4 in edit suite + 1 in new suite) plus untouched
regressions; every item is input → expected:

- [ ] SCHEDULED/DRAFT/synced menu → edit badge `getByText('ตามเวลา')`
  (indigo tone, same as list)
- [ ] SCHEDULED/INACTIVE menu → badge `getByText('หมดเวลา')`
- [ ] MANUAL/DRAFT/synced menu → badge `getByText('ซ่อน')`
- [ ] PENDING-edits menu → badge still `getByText('รอซิงค์')`
  (regression — existing assertions :160, :172 untouched)
- [ ] FAILED menu → `getByText('SYNC FAILED')` with `last_sync_error`
  tooltip (regression — :113-127 untouched)
- [ ] `title` attr present on error/scheduled pills (from `pill.title`)
- [ ] Back link `getByRole('link', { name: 'กลับ' })` → href
  `/admin/rich-menus`; `getByText('Edit Rich Menu')` present
- [ ] No `bg-white p-4 rounded-xl` header card remains on the edit page
  (`grep -rn "PageHeader" frontend/app/admin/rich-menus --include=page.tsx`
  shows list + new + edit on the shared owner)
- [ ] 60+ char Thai menu name truncates with ellipsis, back button stays
  visible (mobile width — PageHeader `truncate` behavior)
- [ ] New-page buttons read บันทึกฉบับร่าง / บันทึกและซิงค์ idle;
  กำลังบันทึก... / กำลังบันทึกและซิงค์... while saving
- [ ] `grep -rn "Save as Draft Only\|Save & Sync to LINE\|Processing..." frontend/app/admin/rich-menus/new/page.tsx` → zero matches
- [ ] Thai glyphs fit button widths at mobile width (narrower than the
  English they replace — verify no overflow)
- [ ] Edit page file untouched by Task 3 (`git diff --stat` shows only
  the new page + its test for that commit)

## Acceptance Criteria

- S1 (PRD R1/AC1): The 3 new badge tests pass; list and edit show the
  identical pill word/tone/tooltip for all 8 outcomes.
- S2 (PRD R2/AC2): The header test passes; edit header structure matches
  the new-page header (title + subtitle + ArrowLeft back link).
- S3 (PRD R3/AC3): The button-label test passes; zero English remains on
  either new-page save button in idle or busy state.
- S4 (PRD AC4): `npm run test:unit` green, `npx eslint` clean on the 4
  touched files, `npm run build` green, CI green on the PR; diff-scope
  proof passes (exactly 4 files).

## Risks

- RISK-1: The verbatim-copied tone map can drift if the list page's map
  changes later. Mitigation: pointer comment naming the list page as
  source of truth + the Task-1 VALIDATE grep (`PageHeader`-style parity
  check) re-runnable any time; extraction into a shared helper was
  deliberately rejected (two call sites sharing one resolver is the
  audited end state).
- RISK-2: `menuStatusPill` signature/tone-set drift since planning.
  Mitigation: Task-1 VALIDATE runs the real suite (a drifted tone key
  renders `undefined` class → visible failure); stop and re-resolve
  against `frontend/lib/rich-menu.ts` instead of copying stale.
- RISK-3: Thai accessible-name matching (`name: 'กลับ'`, button names).
  Mitigation: names verified unique in their pages (full-string match
  semantics — 'ซ่อน' ≠ 'ซ่อน (เตรียมใช้งาน)', 'ตามเวลา' ≠ 'ตามช่วงเวลา');
  `aria-label` is the standardTesting-Library name source.
