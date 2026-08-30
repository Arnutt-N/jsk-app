# PRD/PRP: Edit-page Area Overlay — Proportional Number Size

**Created:** 2026-08-31
**Branch:** `fix/rich-menu-edit-overlay-proportional`
**Follow-up to:** PR #216 (user smoke: fixed size matched the create page, but the edit preview is much wider, so the numbers look small *relative to the image*)
**Type:** Cosmetic follow-up (className-only)

---

## Problem

PR #216 set the edit-page overlay numbers to `text-3xl` to match the create
page. But the two pages render the preview at very different widths: the
create page's preview column is ~⅓ of a `max-w-6xl` grid (~400 px) while the
edit page's preview column is ~½ of the form card (~600–800 px). A fixed
30 px number looks proportional on a 400 px image and undersized on an 800 px
one. The user asks for **สัดส่วน (proportional)** sizing — the number should
scale with the rendered preview box, not be a constant.

## Fix

`frontend/app/admin/rich-menus/[id]/edit/page.tsx` — on the preview
container (`<div onClick={fileInputRef…}` wrapper) add `@container` so the
box is a query container; on the overlay number `<div>` replace `text-3xl`
with `text-[10cqw]` (10% of the preview's rendered width, ≈ 40–80 px at
600–800 px; matches the create page's 30 px ≈ 7.5% of 400 px feel, slightly
larger for legibility). Tailwind v4 supports arbitrary container-query
lengths natively.

No logic/data/layout change; the marker text stays `i + 1`.

## Why `cqw` and not a resize observer / fixed larger size

- Fixed larger (`text-5xl`) re-breaks the moment the admin opens the page on
  a wide monitor or a narrow one — the exact complaint recurs.
- A JS ResizeObserver adds state/effects for a pure-CSS problem.
- `cqw` is the standard CSS primitive for exactly this ("% of container
  width"), already available in this Tailwind version, and degrades to
  nothing (font stays inherited… acceptable) only on browsers without
  container queries (all evergreen browsers have them since 2023).

## Acceptance Criteria

- AC-1: The overlay numbers scale with the preview box size (source uses
  `@container` on the preview wrapper and `text-[10cqw]` on the marker).
- AC-2: No other behavior changes; existing 10 rich-menu vitest tests stay
  green.

## Validation

- `npx vitest run app/admin/rich-menus` (10 green)
- eslint on the changed file; CI runs lint/build/e2e on the PR.

## Ship

Single commit, PR, merge per `git_workflow`.