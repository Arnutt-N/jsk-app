# PRD: Rich-Menu New/Edit UI Parity (3 fixes)

Date: 2026-10-09 · Branch: TBD at implementation (base `main@f8ecea0`) · Owner: Muse Code
Skills invoked: `improve-ui` (audit that produced the evidence + design plans
in `design-plans/2026-10-09-rich-menu-*`, merged via PR #245), `bundled:plan`
(planning discipline), `karpathy-guidelines` (baseline: surgical changes);
skill map: `.claude/docs/skill-collections-20260712.md`.

## 1. Background

The rich-menu create page (`/admin/rich-menus/new`) and edit page
(`/admin/rich-menus/[id]/edit`) perform the same authoring task (menu name →
area actions → image → display mode → save) but were built as two independent
screens. A UI audit (evidence + per-fix design plans in `design-plans/`,
merged to main in PR #245) proved three same-task contradictions between
them. This PRD turns those three audited findings into implementable
requirements. No behavior, API, or backend changes — presentation and copy
only, confined to the two pages and their suites.

## 2. Requirements

- **R1 — Edit-page status badge identical to the list page.** The "สถานะ"
  badge on the edit page must render through the shared `menuStatusPill`
  resolver (`frontend/lib/rich-menu.ts:75-106`) with the same tone map and
  markup as the list page (`frontend/app/admin/rich-menus/page.tsx:216-236`),
  so every state the list can show — ACTIVE, SYNC FAILED, รอซิงค์, ตามเวลา,
  หมดเวลา, ซ่อน, SYNCED, DRAFT — renders identically on the edit page. In
  particular a SCHEDULED menu must read ตามเวลา/หมดเวลา (not SYNCED) and a
  MANUAL hidden menu must read ซ่อน (not SYNCED). Predecessor evidence:
  `design-plans/2026-10-09-rich-menu-edit-status-pill.md`.
- **R2 — Edit-page header identical in structure to the new-page header.**
  The edit header must use the shared `PageHeader` owner
  (`frontend/app/admin/components/PageHeader.tsx:13-42`) with title
  "Edit Rich Menu", subtitle "แก้ไขเมนู: {name}", and the new page's
  icon-only back link (ArrowLeft → `/admin/rich-menus`,
  `frontend/app/admin/rich-menus/new/page.tsx:439-446`) in the action slot.
  Title text, subtitle text, and back destination are preserved verbatim;
  only the furniture changes. Predecessor evidence:
  `design-plans/2026-10-09-rich-menu-edit-page-header.md`.
- **R3 — New-page save buttons in Thai, matching the edit page.**
  `frontend/app/admin/rich-menus/new/page.tsx` buttons must read
  "บันทึกฉบับร่าง" (draft; busy "กำลังบันทึก...") and "บันทึกและซิงค์"
  (primary; busy "กำลังบันทึกและซิงค์..."), matching
  `frontend/app/admin/rich-menus/[id]/edit/page.tsx:688-701`. Styling,
  layout, icons, and disabled states stay byte-identical. Predecessor
  evidence: `design-plans/2026-10-09-rich-menu-new-save-buttons-th.md`.

## 3. Scope (NOT in this feature)

- Body-layout convergence between new and edit (different grids stay).
- The new page's remaining English section copy ("Basic Information",
  "Template & Actions", "Design & Sync", template modal) — deliberate
  follow-up.
- Action-bar logic (Sync/Set Active), area-actions logic, template picker.
- Any backend, API, migration, or shared-lib (`frontend/lib/rich-menu.ts`)
  change; no new shared component (the tone map is copied verbatim with a
  pointer comment, per the audited decision).

## 4. Acceptance criteria

- AC1 (R1): SCHEDULED / expired-SCHEDULED / MANUAL-hidden menus show
  ตามเวลา / หมดเวลา / ซ่อน on the edit page, pixel-consistent with the
  list pill; existing รอซิงค์/SYNC FAILED states unchanged.
- AC2 (R2): Edit header renders title + subtitle + ArrowLeft back link to
  `/admin/rich-menus`; no boxed card remains above the form.
- AC3 (R3): Both new-page buttons read Thai in idle and busy states; no
  English remains on either button.
- AC4: Full frontend unit suite + lint + production build green; no file
  outside the 2 pages + 2 suites touched.

## 5. Risks

- Low. All three changes are presentation/copy within two pages; the
  riskiest item (R1 tone-map copy drifting from the list page later) is
  mitigated by a pointer comment plus a grep parity check in the plan.
