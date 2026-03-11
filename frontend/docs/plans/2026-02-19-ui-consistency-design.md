# UI Consistency Design — SKN Admin Panel
**Date:** 2026-02-19
**Scope:** Full system audit — components, pages, design tokens
**Approach:** Component Layer Fix + Targeted Page Spot-Fixes (Approach B)

---

## Problem

The project has a richly-defined Tailwind v4 `@theme` design token system in `globals.css` (50+ semantic tokens covering colors, typography, shadows, animation). However, the vast majority of UI components and pages **bypass these tokens entirely**, using raw `gray-*` + `dark:gray-*` pairs instead.

This creates three compounding problems:
1. **Dark mode is duplicated** — every component manually handles dark mode instead of tokens doing it automatically
2. **Three competing accent palettes** — `brand-*` (purple), `blue-*`, and `indigo-*` used interchangeably across the system
3. **Analytics page built in isolation** — uses `slate-*` colors, hardcoded hex in charts, raw `<table>` instead of design system components

`Table.tsx` is the **only** component that correctly uses semantic tokens. It is the target pattern.

---

## Design Decisions

### 1. Semantic Token Mapping

All components will use the project's semantic tokens:

| Raw pattern | Semantic token |
|---|---|
| `bg-white dark:bg-gray-800` | `bg-surface` |
| `bg-gray-50 dark:bg-gray-900` | `bg-bg` |
| `border-gray-100 dark:border-gray-700` | `border-border-default` |
| `border-gray-200 dark:border-gray-600` | `border-border-default` |
| `text-gray-900 dark:text-gray-100` | `text-text-primary` |
| `text-gray-600 dark:text-gray-300` | `text-text-secondary` |
| `text-gray-400 dark:text-gray-500` | `text-text-tertiary` |
| `text-gray-500 dark:text-gray-400` | `text-text-secondary` |

### 2. Accent Color Consolidation

All interactive elements use `brand-*` (purple `hsl(262 83%)`). No `blue-*` or `indigo-*` in interactive UI elements outside the sidebar gradient background.

| Old | New |
|---|---|
| `text-indigo-600 hover:text-indigo-700` | `text-brand-600 hover:text-brand-700` |
| `border-blue-500 border-t-transparent` (spinner) | `border-brand-500 border-t-transparent` |
| `ring-blue-500/50` (focus) | `ring-brand-500/50` |
| `text-emerald-600 / text-rose-600` (trend) | `text-success-text / text-danger-text` |
| Chart stroke `#2563eb` | `hsl(var(--color-brand-500))` → use CSS var |
| Chart fill `#16a34a` | `hsl(var(--color-success))` |
| Heatmap `rgba(37,99,235,...)` | brand-500 with opacity |

### 3. Bug Fixes

- **`rounded-inherit` in Button.tsx:150** — not a valid Tailwind class. Replace with `rounded-xl` (matches button base radius)
- **Card `hover: 'lift'` default** — removes `cursor-pointer` from non-interactive cards by changing default to `hover: 'none'`
- **Alert.tsx** — replace string interpolation with `cn()` for proper class merging
- **PageHeader.tsx subtitle** — fix `dark:text-gray-500` (more muted in dark) to `dark:text-gray-400`

### 4. Page Structure Standardization

- **Analytics page** — add `PageHeader` component (consistent with all other pages), replace raw `<table>` with `<Table>/<TableRow>/<TableHead>/<TableCell>` components, replace `slate-*` with `gray-*` or semantic tokens
- **Requests page** — replace raw `<input>` and `<select>` with `<Input>` and `<Select>` components

---

## Files to Modify

### Tier 1 — Shared UI Components (highest leverage)
1. `components/ui/Button.tsx` — token migration, `rounded-inherit` fix
2. `components/ui/Card.tsx` — token migration, default hover fix
3. `components/ui/Input.tsx` — token migration
4. `components/ui/Alert.tsx` — `cn()` fix, already uses semantic text tokens
5. `components/ui/ActionIconButton.tsx` — `indigo-*` → `brand-*`
6. `components/ui/Badge.tsx` — minor dark mode token cleanup

### Tier 2 — Layout & Shared Admin Components
7. `app/admin/layout.tsx` — spinner `blue-500` → `brand-500`, ThemeToggle `indigo-*` → `brand-*`, notification dot ring fix
8. `app/admin/components/PageHeader.tsx` — subtitle dark contrast fix, token migration
9. `app/admin/components/StatsCard.tsx` — `blue-*` → `brand-*` for primary/info, token migration

### Tier 3 — Pages
10. `app/admin/analytics/page.tsx` — add PageHeader, `<Table>` components, `slate-*` → `gray-*`, chart colors → CSS vars, TrendBadge colors → semantic
11. `app/admin/requests/page.tsx` — replace raw `<input>/<select>` with components

---

## Success Criteria

- No component uses `bg-white dark:bg-gray-800` pattern — all use `bg-surface`
- No component uses `border-gray-100 dark:border-gray-700` — all use `border-border-default`
- No `blue-*` or `indigo-*` in interactive UI outside sidebar gradient
- No `slate-*` colors outside sidebar
- No hardcoded hex colors in chart components
- Analytics page uses `PageHeader` and `<Table>` components
- Requests filter uses `<Input>` and `<Select>` components
- `rounded-inherit` replaced with valid class

---

## Out of Scope

- Sidebar gradient background colors (decorative, intentionally dark)
- Live chat page (separate layout, separate codebase section)
- LIFF mini-app pages
- ComingSoon placeholder pages
