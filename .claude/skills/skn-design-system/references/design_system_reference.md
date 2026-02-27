# Design System — Reference

Sources: `frontend/docs/design-system-unified.md`, `frontend/docs/design-system-reference.md`,
`frontend/docs/design-system-scope-boundaries.md`, `frontend/docs/design-system-parity-matrix.md`,
`frontend/docs/design-system-compliance-checklist.md`, `frontend/docs/design-system-cookbook.md`,
`frontend/docs/live-chat-pattern-appendix.md`, `frontend/app/globals.css`

---

## Semantic Token Map (from `globals.css`)

### Surface / Background

| Tailwind Class | CSS Variable | Usage |
|---|---|---|
| `bg-bg` | `--color-bg` | Page background (gray-50 light, dark bg dark) |
| `bg-surface` | `--color-surface` | Card/panel background (white light, dark surface) |
| `bg-surface-elevated` | `--color-surface-elevated` | Raised cards, hover rows, modals |

### Text

| Tailwind Class | CSS Variable | Usage |
|---|---|---|
| `text-text-primary` | `--color-text-primary` | Main readable content |
| `text-text-secondary` | `--color-text-secondary` | Supporting metadata, labels |
| `text-text-tertiary` | `--color-text-tertiary` | Timestamps, captions, hints |

### Border

| Tailwind Class | CSS Variable | Usage |
|---|---|---|
| `border-border-default` | `--color-border-default` | Standard dividers, card borders |
| `border-border-subtle` | `--color-border-subtle` | Light separation lines |

### Brand (Purple — content area CTAs)

| Tailwind Class | Usage |
|---|---|
| `text-brand-500` / `bg-brand-500` | Medium brand |
| `text-brand-600` / `bg-brand-600` | Primary brand CTA |
| `hover:bg-brand-700` | Hover state for brand buttons |

### Status Colors

| Status | Badge Variant | Semantic Class |
|---|---|---|
| WAITING | `warning` | `text-warning`, `bg-warning` |
| ACTIVE | `success` | `text-success`, `bg-success` |
| CLOSED | `gray` | `text-text-secondary` |
| BOT / INFO | `info` | `text-info`, `bg-info` |
| URGENT / DANGER | `danger` | `text-danger`, `bg-danger` |

### Z-Index Scale

| Token | Value | Usage |
|---|---|---|
| `--z-base` | 0 | Base content |
| `--z-dropdown` | 100 | Menus, select popups |
| `--z-sticky` | 200 | Sticky headers |
| `--z-modal` | 1000 | Modal dialogs |
| `--z-tooltip` | 1100 | Tooltips |
| `--z-toast` | 1200 | Toast notifications |
| `--z-loading` | 1300 | Loading overlays |

---

## Scrollbar Utility Classes

All defined in `frontend/app/globals.css`. Applied as `overflow-y-auto [scrollbar-class]`.

| Class | Surface | Description |
|---|---|---|
| `scrollbar-sidebar` | Dark sidebar nav | Dark minimal style, matches sidebar gradient |
| `dark-scrollbar` | Dark containers/panels | Dark theme scrollbar |
| `chat-scrollbar` | Live chat message area | Chat-specific style |
| `scrollbar-thin` | Light/default areas | Default thin scrollbar |
| `no-scrollbar` | Anywhere (hidden) | Visually hidden but still scrollable |

**Requirements for all scrollbars:**
- No top/bottom arrow buttons (globally suppressed via `::-webkit-scrollbar-button` in base layer)
- Transparent tracks
- Rounded thumbs with subtle hover transition
- Theme-matched thumb contrast

---

## Typography Recipes

| Context | Class Recipe |
|---|---|
| Page title | `text-2xl font-bold tracking-tight thai-no-break` |
| Subtitle | `text-sm text-text-secondary thai-no-break` |
| Table metadata | `text-[10px] font-medium text-text-secondary` |
| Badge label | `text-[10px] font-semibold uppercase tracking-wide` |
| Chat timestamp | `text-[10px] text-text-tertiary` |
| Panel section title | `text-xs font-semibold uppercase tracking-wider text-text-secondary` |
| KPI value | `text-2xl font-bold text-text-primary` |
| KPI label | `text-xs text-text-secondary` |

**Thai Typography Rules:**
- `.thai-text` — applies Thai readability baseline (16px, 1.6 line-height)
- `.thai-no-break` — prevents bad word breaks on long Thai strings
- Never force uppercase on Thai content (`uppercase` class is for English only)
- No uppercase in table headers for Thai labels

---

## Governance Rules Summary

### Never-Touch List

| File | Reason |
|---|---|
| `components/ui/Button.tsx` | 9 variants, richer than reference |
| `components/ui/Card.tsx` | 6 variants |
| `components/ui/Badge.tsx` | 7 variants, no forced uppercase |
| `components/ui/Toast.tsx` | Custom Zustand architecture |
| `components/ui/Modal.tsx` | Custom portal + scroll lock |
| `components/ui/ModalAlert.tsx` | 5 typed alert modes |
| `app/admin/layout.tsx` | Sidebar architecture contract |

### In Scope / Out of Scope

| In Scope | Out of Scope |
|---|---|
| New UI primitives in `components/ui` | Backend API behavior |
| Token additions in `globals.css` | WebSocket protocol changes |
| Live chat micro-pattern polish (visual) | Zustand store architecture |
| Documentation updates | shadcn generator replacement |
| | Tailwind v3 plugin migrations |
| | Sidebar architecture changes |

### Additive-First Rule

- Add variants to existing components (new CVA entry) — do NOT create shadow components
- Export through `components/ui/index.ts`
- No breaking import path changes

### Validation Gate (3 required checks)

1. `npm run lint` (targeted for touched files)
2. `tsc --noEmit` (type check, pre-existing blockers OK to track)
3. `npm run build` (or explicit blocker documentation)

Rollback trigger: regression in Button/Card/Badge/Modal/Toast OR `/admin/live-chat` core flow.

---

## Component Parity Matrix

### Adopted Components (do not replace)

| Component | Path | Notes |
|---|---|---|
| Button | `components/ui/Button.tsx` | 9 variants, keep current implementation |
| Card | `components/ui/Card.tsx` | 6 variants, keep current |
| Badge | `components/ui/Badge.tsx` | 7 variants, no uppercase |
| Toast | `components/ui/Toast.tsx` | Zustand architecture retained |
| Modal/ModalAlert | `components/ui/Modal.tsx`, `ModalAlert.tsx` | Keep current API |

### Available (In components/ui, NOT yet used in pages)

| Component | Path | Use When |
|---|---|---|
| Table | `components/ui/Table.tsx` | Admin data tables with rows/cells |
| Pagination | `components/ui/Pagination.tsx` | Page-numbered navigation |
| Textarea | `components/ui/Textarea.tsx` | Multi-line text input |
| Popover | `components/ui/Popover.tsx` | Date pickers, small floating panels |
| Form | `components/ui/Form.tsx` | React Hook Form (RHF) field wrappers |
| Accordion | `components/ui/Accordion.tsx` | Collapsible settings sections |
| Calendar | `components/ui/Calendar.tsx` | Date range selection |
| Sheet | `components/ui/Sheet.tsx` | Slide-in detail/settings panel |
| Chart | `components/ui/Chart.tsx` | Recharts wrapper (ChartContainer, ChartTooltip) |
| Command | `components/ui/Command.tsx` | Command palette / search overlay |

### Token Parity

| shadcn Token | JSK Equivalent | Status |
|---|---|---|
| `primary`/`primary-foreground` | `brand-500` / `white` | Adopted |
| `muted`/`muted-foreground` | `gray-100` / `text-text-secondary` | Adopted |
| `popover`/`popover-foreground` | `surface` / `text-text-primary` | Adopted |
| `input` | `border-border-default` | Adopted |
| `ring` | `brand-500` | Adopted |
| `chart-1..5` | `--chart-1..5` | Available, unused |
| `accent` | `--color-accent` | Available, unused |

---

## Layout Pattern Reference

### Sidebar

```
Background gradient: from-slate-900 via-[#1e1b4b] to-[#172554]
Active item:        .gradient-active  (blue-600 → indigo-600)
Logo icon:          .gradient-logo    (indigo → blue diagonal)
Height:             h-20 (80px) for logo area
Collapsed tooltip:  SidebarItem handles this automatically
Full-row hover:     SidebarItem handles this (never content-width)
```

### Navbar

```css
.glass-navbar  — backdrop-blur + semi-transparent bg + border-bottom
Height: h-20 (80px)
```

### Content Grid

```
16-24px gap between major blocks (gap-4, gap-6)
Rounded corners: xl (12px) for cards, 2xl (16px) for larger panels
KPI cards before dense tables/charts (KPI-first pattern)
```

---

## Live Chat Pattern Spec

### Message Bubble Shapes

| Type | Classes |
|---|---|
| Base | `rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm` |
| Outgoing | + `rounded-tr-sm bg-brand-600 text-white` |
| Incoming | + `rounded-tl-sm bg-gray-100 text-text-primary` |
| Bot | + `rounded-tr-sm bg-gray-200 text-text-primary` |
| Entrance (incoming) | `msg-in` |
| Entrance (outgoing) | `msg-out` |

### Message Status Icons

| State | Icon | Notes |
|---|---|---|
| Pending | `RefreshCw` + `animate-spin` | Spinner |
| Failed | `AlertCircle` + retry action | |
| Delivered | `Check` | Lucide |
| Read | `CheckCheck` | Lucide |

Timestamp style: `text-[10px] text-text-tertiary`

### Status Dot Standard

```tsx
<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-{state}" />
```

| State | Class |
|---|---|
| Online / Active | `bg-online` |
| Waiting / Away | `bg-away` |
| Offline / Closed | `bg-offline` |

**Always `h-3 w-3` — never deviate.**

### Notification Toast Spec

```
Container:    rounded-xl border border-border-default bg-surface shadow-xl
Live region:  aria-live="polite"
Animation:    toast-slide (not fade-only)
Auto-dismiss: 5 seconds
Sound:        Web Audio beep
Vibration:    navigator.vibrate(200) when supported
```

### Picker Rules

- One picker open at a time (emoji / sticker / canned response)
- Opens above message input with scale-in entrance
- ESC closes; selection returns focus to input

---

## Cookbook Recipes

### Action Row

```tsx
<div className="flex items-center justify-between gap-3">
  <h2 className="text-lg font-semibold text-text-primary">Section title</h2>
  <div className="flex items-center gap-2">
    <Button variant="secondary" size="sm">Cancel</Button>
    <Button variant="primary" size="sm">Save</Button>
  </div>
</div>
```

### RHF Form Field

```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField control={form.control} name="email" render={({ field }) => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl><Input {...field} placeholder="user@example.com" /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  </form>
</Form>
```

### Popover + Calendar Date Picker

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">Select date</Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar mode="single" selected={date} onSelect={setDate} />
  </PopoverContent>
</Popover>
```

### Chart Container

```tsx
<ChartContainer className="h-64" config={{ messages: { label: 'Messages', color: 'hsl(var(--chart-1))' } }}>
  <LineChart data={data}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="name" />
    <Line dataKey="messages" stroke="var(--color-messages)" strokeWidth={2} />
    <ChartTooltip content={<ChartTooltipContent />} />
  </LineChart>
</ChartContainer>
```

---

## Compliance Checklist — Per Page

When adding or auditing a new admin page:

- [ ] Root wrapper has `thai-text`
- [ ] Page title / subtitle has `thai-no-break`
- [ ] No forced uppercase on Thai content
- [ ] No `bg-white dark:*` / `bg-gray-*` — using `bg-surface`
- [ ] No `text-gray-*` — using `text-text-*`
- [ ] No `text-blue-*` / `text-indigo-*` in content — using `text-brand-*`
- [ ] Status badges use semantic variant (not hardcoded color)
- [ ] Scrollable areas have correct scrollbar class
- [ ] Table headers use `AdminTableHead` (or consistent `text-xs font-medium`)
- [ ] Search/filter uses `AdminSearchFilterBar`
- [ ] `focus-ring` on primary action buttons and icon buttons
- [ ] Lint + tsc + build pass

---

## Known Gaps

| ID | Gap | Location | Severity |
|---|---|---|---|
| GAP-1 | `Table.tsx`, `Pagination.tsx`, `Form.tsx`, `Sheet.tsx`, `Accordion.tsx` etc. available but not adopted by any page | `components/ui/` | Low |
| GAP-2 | `/admin/design-system` preview page may not show new primitives after addition | `app/admin/design-system/page.tsx` | Low |
| GAP-3 | `chart-1..5` chart tokens defined but not mapped in any component | `globals.css` | Low |
| GAP-4 | Sidebar theming for live-chat uses same gradient as admin — shared CSS — no per-surface override | `globals.css` | Info |
| GAP-5 | `focus-ring` adoption not complete across all admin icon buttons and row actions | `app/admin/**` | Low |
