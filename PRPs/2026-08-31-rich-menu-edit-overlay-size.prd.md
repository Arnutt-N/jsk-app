# PRD/PRP: Edit-page Area Overlay Number Size — Match Create Page

**Created:** 2026-08-31
**Branch:** `fix/rich-menu-edit-overlay-size`
**Follow-up to:** PR #215 (user smoke — the edit-page overlay numbers are barely visible)
**Type:** Cosmetic follow-up (single-line class change)

---

## Problem

The edit page's area overlay numbers use `text-sm` (14px) while the create
page uses `text-3xl` (30px) over the same kind of image — the user reports
the edit-page numbers are "ตัวเล็กมาก แทบจะไม่เห็น" and inconsistent with the
create page's clear affordance.

## Fix

`frontend/app/admin/rich-menus/[id]/edit/page.tsx` overlay box class:
`text-sm` → `text-3xl` and `bg-black/25` → `bg-black/20` (matches the
create page's `bg-black bg-opacity-20` look exactly). No logic, data, or
layout change.

## Acceptance Criteria

- AC-1: Overlay numbers render at the same visual scale as the create
  page (`text-3xl` class present in the edit page source).
- AC-2: No other behavior changes; existing edit-page tests still pass
  (the tests assert the numbered markers exist, not their font size).

## Validation

- `npx vitest run app/admin/rich-menus` (10 tests must stay green)
- eslint + tsc unaffected (class-only change); `next build` not re-run for
  a class swap — CI runs it on the PR.

## Ship

Single commit, PR, merge per `git_workflow`.