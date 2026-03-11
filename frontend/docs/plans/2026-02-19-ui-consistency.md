# UI Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all admin UI components and pages to use the project's semantic design tokens consistently, unify the accent color palette to `brand-*` (purple), and fix structural bugs across the full system.

**Architecture:** Three-tier fix: (1) shared UI components become token-compliant, (2) layout/admin components follow, (3) pages are spot-fixed. Token definitions in `globals.css` already have dark-mode variants so removing `dark:*` duplicates from components is safe and intentional.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (CSS-first `@theme`), CVA, TypeScript

---

## Background: Token Reference

The following semantic tokens are defined in `globals.css` and auto-generate Tailwind utilities. They handle dark mode automatically — no `dark:` needed when using them.

| Token utility | Light mode | Dark mode |
|---|---|---|
| `bg-surface` | `hsl(0 0% 100%)` | `hsl(217 33% 17%)` |
| `bg-bg` | `hsl(210 40% 98%)` | `hsl(222 47% 11%)` |
| `border-border-default` | `hsl(220 13% 91%)` | `hsl(217 19% 27%)` |
| `border-border-subtle` | `hsl(220 14% 96%)` | `hsl(215 28% 17%)` |
| `border-border-hover` | `hsl(216 12% 84%)` | `hsl(215 14% 34%)` |
| `text-text-primary` | `hsl(221 39% 11%)` | `hsl(210 20% 98%)` |
| `text-text-secondary` | `hsl(215 14% 34%)` | `hsl(216 12% 84%)` |
| `text-text-tertiary` | `hsl(218 11% 65%)` | `hsl(220 9% 46%)` |

**Key rule:** `Table.tsx` already uses these tokens correctly — use it as the reference implementation.

**Accent color rule:** All interactive elements (buttons, focus rings, links, icons) use `brand-*` (purple `hsl(262 83%`). Remove `blue-*` and `indigo-*` from interactive UI. `slate-*` does not exist in the design token set — replace all `slate-*` with equivalent `gray-*`.

**Sidebar exception:** The sidebar gradient (`from-slate-900 via-[#1e1b4b] to-[#172554]`) and nav active gradient (`from-blue-600 to-indigo-600`) are intentionally decorative — do NOT change them.

---

## Task 1: Fix Button.tsx

**Files:**
- Modify: `components/ui/Button.tsx`

**What to change:**

Line 150 — `rounded-inherit` is not a valid Tailwind class. Fix the loading overlay:
```tsx
// BEFORE
<span className="absolute inset-0 flex items-center justify-center bg-inherit rounded-inherit">

// AFTER
<span className="absolute inset-0 flex items-center justify-center bg-inherit rounded-xl">
```

**Step 1: Apply the fix**

In `components/ui/Button.tsx` line 150, change `rounded-inherit` to `rounded-xl`.

**Step 2: Verify lint passes**

```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```
Expected: No errors on Button.tsx

**Step 3: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add components/ui/Button.tsx && git commit -m "fix(ui): replace invalid rounded-inherit with rounded-xl in Button loading overlay"
```

---

## Task 2: Fix Card.tsx — Token Migration + Default Hover

**Files:**
- Modify: `components/ui/Card.tsx`

**What to change:**

In `cardVariants`, update all raw color pairs to semantic tokens. Also change the `defaultVariants.hover` from `'lift'` to `'none'` — all cards currently show `cursor-pointer` even when not interactive.

```tsx
// BEFORE
variant: {
  default: [
    'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700',
    'shadow-md shadow-gray-200/50 dark:shadow-none',
  ],
  elevated: [
    'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700',
    'shadow-lg shadow-gray-200/60 dark:shadow-none',
  ],
  glass: [
    'bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl backdrop-saturate-150',
    'border border-white/50 dark:border-gray-700/50',
    'shadow-lg shadow-gray-200/50 dark:shadow-none',
  ],
  outlined: [
    'bg-transparent border-2 border-gray-200 dark:border-gray-600',
  ],
  filled: [
    'bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700',
  ],
  gradient: [
    'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900',
    'border border-gray-100 dark:border-gray-700 shadow-md dark:shadow-none',
  ],
},
```

```tsx
// AFTER
variant: {
  default: [
    'bg-surface border border-border-default',
    'shadow-md shadow-gray-200/50 dark:shadow-none',
  ],
  elevated: [
    'bg-surface border border-border-default',
    'shadow-lg shadow-gray-200/60 dark:shadow-none',
  ],
  glass: [
    'bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl backdrop-saturate-150',
    'border border-white/50 dark:border-gray-700/50',
    'shadow-lg shadow-gray-200/50 dark:shadow-none',
  ],
  outlined: [
    'bg-transparent border-2 border-border-default',
  ],
  filled: [
    'bg-bg border border-border-subtle',
  ],
  gradient: [
    'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900',
    'border border-border-default shadow-md dark:shadow-none',
  ],
},
```

Also update sub-components:
```tsx
// CardHeader divider — BEFORE
divider && 'pb-5 border-b border-gray-100 dark:border-gray-700',
// AFTER
divider && 'pb-5 border-b border-border-default',

// CardTitle — BEFORE
gradient ? 'text-gradient' : 'text-gray-900 dark:text-gray-100',
// AFTER
gradient ? 'text-gradient' : 'text-text-primary',

// CardDescription — BEFORE
'text-gray-500 dark:text-gray-400'
// AFTER
'text-text-secondary'

// CardFooter divider — BEFORE
divider && 'pt-5 border-t border-gray-100 dark:border-gray-700 mt-5',
// AFTER
divider && 'pt-5 border-t border-border-default mt-5',
```

And change defaultVariants:
```tsx
// BEFORE
defaultVariants: {
  variant: 'default',
  radius: 'lg',
  hover: 'lift',
  padding: 'md',
},

// AFTER
defaultVariants: {
  variant: 'default',
  radius: 'lg',
  hover: 'none',
  padding: 'md',
},
```

**Step 1: Apply all changes to `components/ui/Card.tsx`**

**Step 2: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```

**Step 3: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add components/ui/Card.tsx && git commit -m "fix(ui): migrate Card to semantic tokens, remove cursor-pointer from non-hover default"
```

---

## Task 3: Fix Input.tsx and Select.tsx — Token Migration

**Files:**
- Modify: `components/ui/Input.tsx`
- Modify: `components/ui/Select.tsx`

**What to change in Input.tsx:**

```tsx
// Base classes — BEFORE
'w-full rounded-xl border bg-white dark:bg-gray-800',
'text-sm text-gray-900 dark:text-gray-100',
'placeholder:text-gray-400 dark:placeholder:text-gray-500',
'hover:border-gray-300 dark:hover:border-gray-500',
'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-900',

// Base classes — AFTER
'w-full rounded-xl border bg-surface',
'text-sm text-text-primary',
'placeholder:text-text-tertiary',
'hover:border-border-hover',
'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg',
```

```tsx
// outline variant — BEFORE
'border-gray-200 dark:border-gray-600',

// AFTER
'border-border-default',
```

```tsx
// Helper/error text — BEFORE
errorMessage ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'

// AFTER (danger-text is the WCAG-compliant token)
errorMessage ? 'text-danger-text dark:text-danger-light' : 'text-text-secondary'
```

**What to change in Select.tsx** (same pattern as Input.tsx):

```tsx
// Base classes — BEFORE
'w-full appearance-none rounded-xl border bg-white dark:bg-gray-800',
'text-sm text-gray-900 dark:text-gray-100',
'hover:border-gray-300 dark:hover:border-gray-500',
'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-900',

// Base classes — AFTER
'w-full appearance-none rounded-xl border bg-surface',
'text-sm text-text-primary',
'hover:border-border-hover',
'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg',
```

```tsx
// outline variant — BEFORE
'border-gray-200 dark:border-gray-600',
// AFTER
'border-border-default',
```

```tsx
// Chevron icon — BEFORE
<ChevronDown className="... text-gray-400 ..." />
// AFTER
<ChevronDown className="... text-text-tertiary ..." />
```

```tsx
// Helper/error text — BEFORE
errorMessage ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
// AFTER
errorMessage ? 'text-danger-text dark:text-danger-light' : 'text-text-secondary'
```

**Step 1: Apply changes to Input.tsx**

**Step 2: Apply changes to Select.tsx**

**Step 3: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```

**Step 4: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add components/ui/Input.tsx components/ui/Select.tsx && git commit -m "fix(ui): migrate Input and Select to semantic tokens"
```

---

## Task 4: Fix Alert.tsx — Use cn() utility

**Files:**
- Modify: `components/ui/Alert.tsx`

**What to change:**

The Alert currently uses string interpolation for class merging which breaks tailwind-merge.

```tsx
// BEFORE — top of file has no cn import, uses string interpolation
import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

// In JSX:
<div
    className={`relative p-4 rounded-xl flex items-start gap-3 ${variants[variant]} ${className}`}
```

```tsx
// AFTER — add cn import, use cn()
import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// In JSX:
<div
    className={cn('relative p-4 rounded-xl flex items-start gap-3', variants[variant], className)}
```

**Step 1: Add `import { cn } from '@/lib/utils';` to Alert.tsx imports**

**Step 2: Replace the string interpolation in the JSX with `cn()`**

**Step 3: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```

**Step 4: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add components/ui/Alert.tsx && git commit -m "fix(ui): use cn() in Alert for proper class merging"
```

---

## Task 5: Fix ActionIconButton.tsx — brand-* accent

**Files:**
- Modify: `components/ui/ActionIconButton.tsx`

**What to change:**

The `default` variant uses `indigo-*` — replace with `brand-*`:

```tsx
// BEFORE
const variantStyles = {
    default: 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-500/10',
    ...
};
```

```tsx
// AFTER
const variantStyles = {
    default: 'text-brand-600 hover:bg-brand-50 hover:text-brand-700 dark:text-brand-400 dark:hover:bg-brand-500/10',
    ...
};
```

**Step 1: Apply change**

**Step 2: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```

**Step 3: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add components/ui/ActionIconButton.tsx && git commit -m "fix(ui): replace indigo accent with brand in ActionIconButton"
```

---

## Task 6: Fix admin/layout.tsx — brand-* accent + spinner color

**Files:**
- Modify: `app/admin/layout.tsx`

**What to change:**

### Loading spinner (AdminAuthGate component, ~line 40)
```tsx
// BEFORE
<div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />

// AFTER
<div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
```

### ThemeToggle component (~line 57-68)
```tsx
// BEFORE
'text-slate-400 hover:text-indigo-600 hover:bg-slate-50',
'dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-gray-800',
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50'

// AFTER
'text-text-tertiary hover:text-brand-600 hover:bg-gray-50',
'dark:hover:text-brand-400 dark:hover:bg-gray-800',
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50'
```

### Mobile menu button (~line 286)
```tsx
// BEFORE
'text-slate-600 dark:text-gray-400 hover:text-indigo-600 transition-colors'

// AFTER
'text-text-secondary dark:text-gray-400 hover:text-brand-600 transition-colors'
```

### Search bar focus ring (~line 292-299)
```tsx
// BEFORE
'focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900'

// AFTER
'focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-900'
```

### Notification button (~line 306-313)
```tsx
// BEFORE
'p-2.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-gray-700 transition-all relative'

// AFTER
'p-2.5 rounded-xl text-text-tertiary hover:text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all relative'
```

**Step 1: Apply all 5 changes in `app/admin/layout.tsx`**

**Step 2: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```

**Step 3: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add app/admin/layout.tsx && git commit -m "fix(ui): replace blue/indigo/slate accents with brand tokens in admin layout"
```

---

## Task 7: Fix PageHeader.tsx and StatsCard.tsx — Tokens + Accent

**Files:**
- Modify: `app/admin/components/PageHeader.tsx`
- Modify: `app/admin/components/StatsCard.tsx`

### PageHeader.tsx changes

```tsx
// BEFORE
'bg-white rounded-2xl p-5',
'border border-gray-100 shadow-sm',
'dark:bg-gray-800 dark:border-gray-700',
// title:
'text-2xl font-bold text-gray-800 tracking-tight thai-no-break dark:text-gray-100'
// subtitle:
'text-sm text-gray-400 mt-0.5 thai-no-break dark:text-gray-500'

// AFTER
'bg-surface rounded-2xl p-5',
'border border-border-default shadow-sm',
// title:
'text-2xl font-bold text-text-primary tracking-tight thai-no-break'
// subtitle:
'text-sm text-text-tertiary mt-0.5 thai-no-break'
// (no dark: needed — tokens handle it automatically)
```

### StatsCard.tsx changes

Container classes:
```tsx
// BEFORE
'bg-white rounded-2xl p-5',
'border border-gray-100',
'shadow-sm shadow-gray-200/50',
...
'dark:bg-gray-800 dark:border-gray-700 dark:shadow-none',
'dark:hover:border-gray-600'

// AFTER
'bg-surface rounded-2xl p-5',
'border border-border-default',
'shadow-sm shadow-gray-200/50 dark:shadow-none',
...
'hover:border-border-hover'
```

Title and description text:
```tsx
// BEFORE
<p className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider dark:text-gray-400">
<p className="text-2xl font-bold text-gray-900 mt-0.5 tracking-tight dark:text-gray-100">
<p className="text-gray-400 text-xs dark:text-gray-500">{description}</p>
<span className="text-gray-400 text-xs dark:text-gray-500">vs last month</span>

// AFTER
<p className="text-text-tertiary text-[11px] font-semibold uppercase tracking-wider">
<p className="text-2xl font-bold text-text-primary mt-0.5 tracking-tight">
<p className="text-text-tertiary text-xs">{description}</p>
<span className="text-text-tertiary text-xs">vs last month</span>
```

Primary color icon bg (fix `blue-*` → `brand-*`):
```tsx
// colorMap — BEFORE
primary: {
  iconBg: 'bg-gradient-to-br from-blue-100 to-blue-50',
  text: 'text-blue-600',
  glow: 'group-hover:shadow-blue-500/20',
},

// AFTER
primary: {
  iconBg: 'bg-gradient-to-br from-brand-100 to-brand-50',
  text: 'text-brand-600',
  glow: 'group-hover:shadow-brand-500/20',
},
```

(The `info` color can keep `blue-*` since info semantically IS blue. `primary` should be brand/purple.)

**Step 1: Apply PageHeader.tsx changes**

**Step 2: Apply StatsCard.tsx changes**

**Step 3: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```

**Step 4: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add app/admin/components/PageHeader.tsx app/admin/components/StatsCard.tsx && git commit -m "fix(ui): migrate PageHeader/StatsCard to semantic tokens, primary → brand color"
```

---

## Task 8: Fix analytics/page.tsx — Full Consistency Overhaul

**Files:**
- Modify: `app/admin/analytics/page.tsx`

This page was built by a different agent and has the most drift. Changes:

### 8a: Add PageHeader import and replace raw header div

At the top of the file, add import:
```tsx
import PageHeader from '@/app/admin/components/PageHeader';
```

Replace the raw header:
```tsx
// BEFORE
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">Live Analytics Dashboard</h1>
  <div className="flex items-center gap-4">
    ...
  </div>
</div>

// AFTER
<PageHeader title="Live Analytics Dashboard">
  <div className="flex items-center gap-4">
    ...
  </div>
</PageHeader>
```

### 8b: Replace slate-* with gray-* or semantic tokens

Find all `slate-` occurrences and replace:
- `text-slate-400` → `text-text-tertiary`
- `bg-slate-100` → `bg-gray-100 dark:bg-gray-700`
- `hover:bg-slate-50` → `hover:bg-gray-50 dark:hover:bg-gray-700/50`
- `bg-slate-50` → `bg-gray-50 dark:bg-gray-800`

In the operator table rows specifically:
```tsx
// BEFORE
className={`border-b cursor-pointer hover:bg-slate-50 ${selectedOperator === op.operator_id ? "bg-slate-100" : ""}`}

// AFTER
className={cn(
  'border-b border-border-default cursor-pointer transition-colors',
  'hover:bg-gray-50 dark:hover:bg-gray-700/50',
  selectedOperator === op.operator_id
    ? 'bg-brand-50 dark:bg-brand-900/20'
    : ''
)}
```

Add `import { cn } from '@/lib/utils';` to imports if not already present.

### 8c: Fix TrendBadge component colors

```tsx
// BEFORE
const cls = positive ? "text-emerald-600" : "text-rose-600";

// AFTER
const cls = positive ? "text-success-text" : "text-danger-text";

// Also fix the fallback:
// BEFORE
<span className="text-xs text-slate-400">vs yesterday</span>
// AFTER
<span className="text-xs text-text-tertiary">vs yesterday</span>
```

### 8d: Fix hardcoded chart colors

Define semantic color constants at the top of the component (after imports):
```tsx
// Semantic chart colors matching design tokens
const CHART_BRAND = 'hsl(262 83% 58%)';   // --color-brand-600
const CHART_SUCCESS = 'hsl(142 71% 45%)'; // --color-success
const CHART_BRAND_RGB = '124, 58, 237';   // brand-600 for rgba heatmap
```

Replace in charts:
```tsx
// LineChart — BEFORE
<Line ... stroke="#2563eb" ... />
// AFTER
<Line ... stroke={CHART_BRAND} ... />

// BarChart — BEFORE
<Bar dataKey="value" fill="#16a34a" />
// AFTER
<Bar dataKey="value" fill={CHART_SUCCESS} />

// Heatmap — BEFORE
style={{ backgroundColor: `rgba(37, 99, 235, ${intensity})` }}
// AFTER
style={{ backgroundColor: `rgba(${CHART_BRAND_RGB}, ${intensity})` }}
```

Also fix heatmap loading skeletons:
```tsx
// BEFORE
<div key={idx} className="h-32 rounded-xl border bg-slate-100 animate-pulse" />
// AFTER
<div key={idx} className="h-32 rounded-xl border border-border-default bg-gray-100 dark:bg-gray-700 animate-pulse" />
```

### 8e: Replace raw operator table with Table components

Add imports:
```tsx
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/Table';
```

Replace the raw `<table>` block:
```tsx
// BEFORE
<table className="w-full">
  <thead>
    <tr className="border-b">
      <th className="text-left py-3 px-4 font-medium">Operator</th>
      ...
    </tr>
  </thead>
  <tbody>
    {operators.map((op) => (
      <tr key={op.operator_id} className={`border-b cursor-pointer hover:bg-slate-50 ...`}>
        <td className="py-3 px-4">{op.operator_name}</td>
        ...
      </tr>
    ))}
  </tbody>
</table>

// AFTER
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Operator</TableHead>
      <TableHead className="text-center">Sessions</TableHead>
      <TableHead className="text-center">Avg First Response</TableHead>
      <TableHead className="text-center">Avg Resolution</TableHead>
      <TableHead className="text-center">Avg Queue Wait</TableHead>
      <TableHead className="text-center">Availability</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {operators.map((op) => (
      <TableRow
        key={op.operator_id}
        className={cn(
          'cursor-pointer',
          selectedOperator === op.operator_id
            ? 'bg-brand-50 dark:bg-brand-900/20'
            : ''
        )}
        onClick={() => setSelectedOperator(op.operator_id)}
      >
        <TableCell>{op.operator_name}</TableCell>
        <TableCell className="text-center">{op.total_sessions}</TableCell>
        <TableCell className="text-center">{formatDuration(op.avg_first_response_seconds)}</TableCell>
        <TableCell className="text-center">{formatDuration(op.avg_resolution_seconds)}</TableCell>
        <TableCell className="text-center">{formatDuration(op.avg_queue_wait_seconds)}</TableCell>
        <TableCell className="text-center">{op.availability_percent.toFixed(1)}%</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 8f: Fix "no operator data" empty state

```tsx
// BEFORE
<div className="text-center py-8 text-slate-400">No operator data available.</div>
// AFTER
<div className="text-center py-8 text-text-tertiary">No operator data available.</div>
```

### 8g: Fix last-updated timestamp

```tsx
// BEFORE
<p className="text-xs text-slate-400 text-right">
// AFTER
<p className="text-xs text-text-tertiary text-right">
```

### 8h: Fix latency percentiles card

```tsx
// BEFORE
<p className="text-sm text-slate-400">P50: ...
// AFTER
<p className="text-sm text-text-secondary">P50: ...
```

**Step 1: Apply 8a — PageHeader**

**Step 2: Apply 8b — slate-* replacements**

**Step 3: Apply 8c — TrendBadge colors**

**Step 4: Apply 8d — chart color constants**

**Step 5: Apply 8e — Table component**

**Step 6: Apply 8f, 8g, 8h — remaining text fixes**

**Step 7: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -10
```

**Step 8: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add app/admin/analytics/page.tsx && git commit -m "fix(ui): overhaul analytics page — PageHeader, Table component, brand tokens, no hardcoded hex"
```

---

## Task 9: Fix requests/page.tsx — Replace Raw Inputs With Components

**Files:**
- Modify: `app/admin/requests/page.tsx`

The filter bar uses a raw `<input>` and two raw `<select>` elements. Replace with `<Input>` and `<Select>` components.

### 9a: Add Select import

The file already imports `Input` indirectly through CardContent. Add:
```tsx
import { Select } from '@/components/ui/Select';
```
(Input is already exported from components/ui — check if already imported; if not, add it too.)

### 9b: Replace raw search input

```tsx
// BEFORE
<div className="relative col-span-1 md:col-span-2">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
    type="text"
    placeholder="ค้นหาชื่อ, เบอร์โทรศัพท์ หรือรายละเอียด..."
    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
  />
</div>

// AFTER
<div className="col-span-1 md:col-span-2">
  <Input
    type="text"
    placeholder="ค้นหาชื่อ, เบอร์โทรศัพท์ หรือรายละเอียด..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    leftIcon={<Search className="w-4 h-4" />}
  />
</div>
```

### 9c: Replace raw status select

```tsx
// BEFORE
<select
    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none cursor-pointer dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
    value={filter.status}
    onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
>
    <option value="">ทุกสถานะ</option>
    <option value="pending">รอรับเรื่อง</option>
    <option value="in_progress">กำลังดำเนินการ</option>
    <option value="completed">ดำเนินการแล้ว</option>
    <option value="rejected">ปฏิเสธ</option>
</select>

// AFTER
<Select
    value={filter.status}
    onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
    options={[
        { value: '', label: 'ทุกสถานะ' },
        { value: 'pending', label: 'รอรับเรื่อง' },
        { value: 'in_progress', label: 'กำลังดำเนินการ' },
        { value: 'completed', label: 'ดำเนินการแล้ว' },
        { value: 'rejected', label: 'ปฏิเสธ' },
    ]}
/>
```

### 9d: Replace raw category select

```tsx
// BEFORE
<select
    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none cursor-pointer dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
    value={filter.category}
    onChange={(e) => setFilter(prev => ({ ...prev, category: e.target.value }))}
>
    <option value="">ทุกหมวดหมู่</option>
    <option value="กองทุนยุติธรรม">กองทุนยุติธรรม</option>
    <option value="รับเรื่องราวร้องทุกข์">รับเรื่องราวร้องทุกข์</option>
    <option value="เงินเยียวยาเหยื่ออาชญากรรม">เงินเยียวยาเหยื่ออาชญากรรม</option>
</select>

// AFTER
<Select
    value={filter.category}
    onChange={(e) => setFilter(prev => ({ ...prev, category: e.target.value }))}
    options={[
        { value: '', label: 'ทุกหมวดหมู่' },
        { value: 'กองทุนยุติธรรม', label: 'กองทุนยุติธรรม' },
        { value: 'รับเรื่องราวร้องทุกข์', label: 'รับเรื่องราวร้องทุกข์' },
        { value: 'เงินเยียวยาเหยื่ออาชญากรรม', label: 'เงินเยียวยาเหยื่ออาชญากรรม' },
    ]}
/>
```

**Step 1: Add `Select` import**

**Step 2: Replace raw search input with `<Input>`**

**Step 3: Replace raw status select with `<Select>`**

**Step 4: Replace raw category select with `<Select>`**

**Step 5: Run lint**
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -10
```

**Step 6: Commit**
```bash
cd /d/genAI/skn-app/frontend && git add app/admin/requests/page.tsx && git commit -m "fix(ui): replace raw input/select with Input/Select components in requests filter"
```

---

## Task 10: Final Verification

**Step 1: Full lint check**
```bash
cd /d/genAI/skn-app/frontend && npm run lint 2>&1 | tail -20
```
Expected: No errors

**Step 2: TypeScript check**
```bash
cd /d/genAI/skn-app/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors

**Step 3: Build check**
```bash
cd /d/genAI/skn-app/frontend && npm run build 2>&1 | tail -20
```
Expected: Build succeeds

**Step 4: Visual spot-check checklist**
- [ ] Dashboard page: KPI cards use `bg-surface`, no visible `bg-white` flash on dark mode
- [ ] Requests page: Filter inputs use `<Input>` and `<Select>` components
- [ ] Analytics page: Has `PageHeader`, table uses design system, charts show brand purple
- [ ] Sidebar: Decorative gradient still dark/indigo (unchanged)
- [ ] Header: Theme toggle, notification, search ring all use purple brand color
- [ ] Dark mode: Toggle theme and verify all surfaces change correctly

**Step 5: Final commit if any cleanup needed**
```bash
cd /d/genAI/skn-app/frontend && git add -p && git commit -m "fix(ui): final cleanup from UI consistency audit"
```
