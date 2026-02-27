---
name: skn-design-system
description: >
  Covers the JSK Admin frontend design system — governance rules, semantic token usage,
  Thai typography standards, layout patterns, component compliance, scrollbar utilities,
  and live chat visual patterns.
  Use when asked to "add a new admin page", "use semantic tokens", "fix token usage",
  "add scrollbar class", "Thai text style", "status color", "badge color for status",
  "sidebar gradient", "glass navbar", "live chat bubble", "status dot", "message bubble",
  "design system rules", "never touch list", "design compliance", "component parity",
  "what components are available", "add new UI primitive", "add design token",
  "table page recipe", "new list page", "focus-ring", "toast-slide", "thai-no-break",
  "thai-text", "z-index token",
  "ใช้ semantic token", "สี status", "หน้า admin ใหม่", "คลาส scrollbar",
  "ตัวอักษรภาษาไทย", "gradient sidebar", "bubble แชท", "dot สถานะ".
  Do NOT use for: adding new business logic, API endpoints, Zustand state changes,
  WebSocket protocol changes, or replacing existing Button/Card/Badge/Modal components.
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: Next.js 16, React 19, Tailwind CSS v4, frontend/app/globals.css.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: frontend
  tags: [design-system, tokens, tailwind, governance, thai-typography, scrollbar, live-chat-visual]
  related-skills:
    - skn-ui-library
    - skn-admin-component
    - skn-live-chat-frontend
    - skn-app-shell
  documentation: ./references/design_system_reference.md
---

# skn-design-system

Design system governance, semantic tokens, and visual standards for the JSK Admin frontend.

1. **Governance** — scope boundaries, never-touch list, additive-first rule, validation gate.

2. **Semantic tokens** — how to use `brand-*`, `text-*`, `border-*`, `surface`, status colors from `globals.css`.

3. **Thai typography** — `.thai-text`, `.thai-no-break`, mandatory rules for Thai content.

4. **Layout patterns** — sidebar (slate→indigo gradient), glass navbar, card grid, KPI-first layout.

5. **Scrollbar utilities** — 5 utility classes for different surfaces.

6. **Live chat visual standards** — bubble shapes, status dots, notification toast, picker rules.

7. **Component parity matrix** — what's available in `components/ui` but not yet used.

8. **New list page recipe** — standardized baseline for admin list/table pages.

---

## CRITICAL: Project-Specific Rules

1. **Never modify the 7 "never-touch" components without explicit planning** —
   These components are high-usage and already richer than reference equivalents:
   ```
   frontend/components/ui/Button.tsx
   frontend/components/ui/Card.tsx
   frontend/components/ui/Badge.tsx
   frontend/components/ui/Toast.tsx
   frontend/components/ui/Modal.tsx
   frontend/components/ui/ModalAlert.tsx
   frontend/app/admin/layout.tsx  ← sidebar architecture contract
   ```
   Layout.tsx visual theming updates (colors, gradients) ARE allowed when explicitly planned.
   Architecture changes (menu structure, routing) are NOT.

2. **Use semantic tokens — NEVER hardcode colors** —
   Wrong patterns that appear in old code (do not copy):
   ```tsx
   // WRONG:
   className="bg-white dark:bg-gray-800"      // bypasses surface token
   className="text-gray-500 dark:text-gray-400" // bypasses text token
   className="border-gray-200 dark:border-gray-700" // bypasses border token
   className="text-blue-600"                  // bypasses brand token

   // CORRECT:
   className="bg-surface"
   className="text-text-secondary"
   className="border-border-default"
   className="text-brand-600"
   ```

3. **Sidebar gradient is blue→indigo (NOT brand purple)** —
   The admin sidebar uses HR-IMS visual alignment:
   - Background: `from-slate-900 via-[#1e1b4b] to-[#172554]` (always dark)
   - Active item: `.gradient-active` CSS utility (blue-600 → indigo-600)
   - Logo icon: `.gradient-logo` CSS utility (indigo → blue diagonal)
   Brand purple (`brand-*`) is for content area CTAs and accent elements, not sidebar.

4. **Additive-first rule — add new primitives, don't replace existing ones** —
   When a component doesn't have a needed variant, add it:
   ```tsx
   // CORRECT: extend the existing component
   // In Button.tsx, add a new variant to the CVA config
   // Export it through components/ui/index.ts

   // WRONG: create a parallel MyButton.tsx that shadows Button
   ```
   Do not introduce breaking import path changes. Always export through `index.ts`.

5. **Thai typography is mandatory for dense UI blocks** —
   All admin pages must apply Thai readability utilities:
   ```tsx
   // Page container:
   <div className="thai-text">

   // Important titles/labels that must not wrap at bad breaks:
   <h1 className="thai-no-break">ระบบจัดการคำร้อง</h1>

   // Never force uppercase for Thai text:
   // WRONG: className="uppercase"
   // RIGHT: only uppercase for English badge labels (text-[10px])
   ```

6. **Validation gate — 3 checks before any design system change is "done"** —
   Every migration phase must pass:
   - `npm run lint` (targeted for touched files)
   - `tsc --noEmit` (type check — known pre-existing blockers can be tracked)
   - `npm run build` (or explicit blocker documentation)
   Rollback trigger: ANY regression in Button/Card/Badge/Modal/Toast or `/admin/live-chat` core flow.

7. **Status colors follow semantic language — not arbitrary colors** —
   ```
   WAITING   → variant="warning"  → bg-warning / text-warning
   ACTIVE    → variant="success"  → bg-success / text-success
   CLOSED    → variant="gray"     → bg-gray / text-text-secondary
   BOT/INFO  → variant="info"     → bg-info / text-info
   URGENT    → variant="danger"   → bg-danger / text-danger
   ```
   Applies to Badge variants, status dots, and inline status indicators.

8. **Live chat visual boundaries — visual polish only, no behavior changes** —
   In `frontend/app/admin/live-chat/_components/*`:
   - Allowed: bubble shape, message timestamp style, status dot size/position, toast animation
   - NOT allowed: message routing logic, WebSocket event contract, session state changes
   The business behavior in live chat is feature-team owned, not design-system owned.

---

## File Structure

```
frontend/
├── app/
│   ├── globals.css               ← ALL semantic tokens defined here
│   └── admin/
│       └── design-system/        ← Live preview page at /admin/design-system
│           └── page.tsx
├── components/
│   └── ui/
│       ├── index.ts              ← Export all new primitives here
│       ├── Button.tsx            ← NEVER TOUCH (9 variants, rich implementation)
│       ├── Card.tsx              ← NEVER TOUCH (6 variants)
│       ├── Badge.tsx             ← NEVER TOUCH (7 variants)
│       ├── Toast.tsx             ← NEVER TOUCH (Zustand architecture)
│       ├── Modal.tsx             ← NEVER TOUCH
│       ├── ModalAlert.tsx        ← NEVER TOUCH
│       ├── Table.tsx             ← Available, not yet used in pages
│       ├── Pagination.tsx        ← Available, not yet used in pages
│       ├── Textarea.tsx          ← Available, not yet used in pages
│       ├── Popover.tsx           ← Available, not yet used in pages
│       ├── Form.tsx              ← Available (RHF helpers), not yet used
│       ├── Accordion.tsx         ← Available, not yet used
│       ├── Calendar.tsx          ← Available, not yet used
│       ├── Sheet.tsx             ← Available, not yet used
│       ├── Chart.tsx             ← Available (Recharts wrappers), not yet used
│       └── Command.tsx           ← Available (Command palette), not yet used
└── docs/
    ├── design-system-unified.md          ← Single source of truth
    ├── design-system-reference.md        ← Visual direction + scrollbar standards
    ├── design-system-scope-boundaries.md ← Governance rules
    ├── design-system-compliance-checklist.md ← Page audit checklist
    ├── design-system-parity-matrix.md    ← Component coverage map
    ├── design-system-cookbook.md         ← Code recipes for common patterns
    └── live-chat-pattern-appendix.md     ← Live chat visual spec
```

---

## Step 1 — Use Semantic Tokens Correctly

```tsx
// ✅ Surface and background tokens:
className="bg-surface"           // card/panel background (light: white, dark: dark surface)
className="bg-bg"                // page background (light: gray-50, dark: dark bg)
className="bg-surface-elevated"  // raised cards, modals

// ✅ Text tokens:
className="text-text-primary"    // main readable text
className="text-text-secondary"  // supporting / metadata
className="text-text-tertiary"   // timestamps, captions, hints

// ✅ Border tokens:
className="border-border-default"  // standard dividers
className="border-border-subtle"   // lighter separation

// ✅ Brand accent (purple — for content area CTAs):
className="text-brand-500"
className="bg-brand-600"
className="hover:bg-brand-700"

// ✅ Status colors:
className="text-success"   // or bg-success, border-success
className="text-warning"
className="text-danger"
className="text-info"

// ✅ Shadow tokens:
className="shadow-sm"   // cards, inputs
className="shadow-md"   // dropdowns, tooltips
className="shadow-xl"   // modals, panels
```

---

## Step 2 — Scrollbar Utilities

Apply the correct scrollbar class based on surface context:

```tsx
// Dark sidebar navigation area:
className="overflow-y-auto scrollbar-sidebar"

// Dark container or panel (e.g., dark theme notification area):
className="overflow-y-auto dark-scrollbar"

// Live chat message area:
className="overflow-y-auto chat-scrollbar"

// Light/default scrollable area (most admin content):
className="overflow-y-auto scrollbar-thin"

// Visually hidden scrollbar (still scrollable):
className="overflow-y-auto no-scrollbar"
```

All scrollbar classes are defined in `frontend/app/globals.css`:
- No top/bottom arrow buttons (globally suppressed via `::-webkit-scrollbar-button`)
- Transparent tracks with rounded thumbs
- Theme-matched thumb contrast

---

## Step 3 — Thai Typography

```tsx
// Page wrapper (always add thai-text to admin page root):
<div className="thai-text">

// Title that must not word-break at bad breakpoints:
<h1 className="text-2xl font-bold tracking-tight thai-no-break">
  ระบบจัดการคำร้อง
</h1>

// Subtitle:
<p className="text-sm text-text-secondary thai-no-break">
  จัดการคำร้องขอรับบริการทั้งหมด
</p>

// Table header row — never uppercase Thai:
// WRONG: className="text-xs uppercase"
// RIGHT:
className="text-xs font-medium text-text-secondary"

// KPI value and label:
<div>
  <div className="text-2xl font-bold text-text-primary">42</div>
  <div className="text-xs text-text-secondary">คำร้องรอดำเนินการ</div>
</div>
```

---

## Step 4 — New List Page Recipe

Use this baseline for ALL new admin list/table pages:

```tsx
// 1. Page wrapper with Thai readability:
<div className="thai-text space-y-6 p-6">

  // 2. Header block:
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight thai-no-break">
        ชื่อหน้า
      </h1>
      <p className="text-sm text-text-secondary thai-no-break">
        คำอธิบายสั้น
      </p>
    </div>
    <Button variant="primary" size="sm" className="focus-ring">
      + เพิ่มใหม่
    </Button>
  </div>

  // 3. Search/filter bar (use shared component):
  <AdminSearchFilterBar
    searchValue={search}
    onSearchChange={setSearch}
    filters={[
      {
        label: "สถานะ",
        value: statusFilter,
        onChange: setStatusFilter,
        options: STATUS_OPTIONS,  // SelectOption[]
      },
    ]}
    showCategory={false}
  />

  // 4. Table (use AdminTableHead for consistent columns):
  <div className="rounded-xl border border-border-default bg-surface shadow-sm">
    <table className="w-full">
      <AdminTableHead
        columns={[
          { key: "name", label: "ชื่อ", align: "left" },
          { key: "status", label: "สถานะ", align: "center" },
          { key: "created_at", label: "วันที่", align: "right" },
          { key: "actions", label: "", align: "center" },
        ]}
      />
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-t border-border-subtle hover:bg-surface-elevated">
            <td className="px-4 py-3 text-sm text-text-primary">{item.name}</td>
            <td className="px-4 py-3 text-center">
              <Badge variant={STATUS_MAP[item.status]}>{item.status}</Badge>
            </td>
            <td className="px-4 py-3 text-right text-xs text-text-tertiary">
              {new Date(item.created_at).toLocaleDateString("th-TH")}
            </td>
            <td className="px-4 py-3 text-center">
              <button className="focus-ring rounded-md p-1 hover:bg-surface-elevated">
                <Ellipsis className="h-4 w-4 text-text-secondary" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

---

## Step 5 — Live Chat Visual Patterns

### Message Bubble

```tsx
// Base bubble shape (all bubbles):
className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm"

// Outgoing (operator → user):
className="rounded-tr-sm bg-brand-600 text-white"    // corner-cut top-right

// Incoming (user → operator):
className="rounded-tl-sm bg-gray-100 text-text-primary"  // corner-cut top-left

// Bot message:
className="rounded-tr-sm bg-gray-200 text-text-primary"

// Animation classes:
className="msg-in"   // incoming message entrance
className="msg-out"  // outgoing message entrance
```

### Status Dot

```tsx
// Standard size (always h-3 w-3 — never deviate):
<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-online" />

// State colors:
bg-online    // online, active session
bg-away      // waiting, away
bg-offline   // offline, closed
```

### Notification Toast

```tsx
// Container:
<div
  role="alert"
  aria-live="polite"
  className="rounded-xl border border-border-default bg-surface shadow-xl"
>
// Animation: toast-slide (not fade-only)
// Auto-dismiss: 5 seconds
// On notification: Web Audio beep + navigator.vibrate(200) when supported
```

### Picker Rules

- Only ONE picker open at a time (emoji / sticker / canned response)
- Picker opens ABOVE message input with scale-in entrance animation
- ESC closes picker; selection returns focus to input

---

## Z-Index Scale

Use these CSS tokens instead of arbitrary numbers:

```css
--z-base:     0
--z-dropdown: 100
--z-sticky:   200
--z-modal:    1000
--z-tooltip:  1100
--z-toast:    1200
--z-loading:  1300
```

---

## Common Issues

### Token not applying — component still shows raw gray
**Cause:** The token name is wrong or the `globals.css` token isn't loaded.
**Fix:** Check `frontend/app/globals.css` for the exact CSS variable name. Tailwind v4 maps
`bg-surface` to `var(--color-surface)` automatically when defined as `@theme`.

### Thai text wrapping at awkward points
**Cause:** Missing `.thai-no-break` on title/label elements.
**Fix:** Add `thai-no-break` class to the container or specific element.

### Sidebar active item not full-width
**Cause:** Using a content-width container instead of full-row link.
**Fix:** Use `SidebarItem` from `components/admin/SidebarItem.tsx` — it handles active state,
full-row hover, and collapsed tooltip automatically.

### Scrollbar shows arrow buttons (Chrome/Edge)
**Cause:** Missing scrollbar utility class or overriding global suppression.
**Fix:** Add correct scrollbar class (`scrollbar-thin`, `scrollbar-sidebar`, etc.).
The base layer in `globals.css` suppresses `::-webkit-scrollbar-button` globally.

### Status badge showing wrong color
**Cause:** Using a hardcoded color class instead of semantic variant.
**Fix:** Map status string to Badge variant: `waiting→warning`, `active→success`,
`closed→gray`, `bot→info`, `urgent→danger`.

---

## Quality Checklist

When adding or modifying admin frontend components:
- [ ] No hardcoded `bg-white dark:bg-gray-800` — use `bg-surface`
- [ ] No raw `text-gray-500 dark:*` — use `text-text-secondary`
- [ ] No `text-blue-*` or `text-indigo-*` in content area — use `text-brand-*`
- [ ] Page root has `thai-text` class
- [ ] Dense labels use `thai-no-break`
- [ ] No forced uppercase on Thai text
- [ ] Status colors use semantic variants (warning/success/danger/info/gray)
- [ ] Scrollable areas have correct scrollbar utility class
- [ ] New UI primitives exported through `components/ui/index.ts`
- [ ] Never-touch list components NOT modified
- [ ] Validation gate passed: lint + tsc + build

## Additional Resources

See `references/design_system_reference.md` for:
- Complete semantic token map from globals.css
- Full scrollbar class definitions
- Component parity matrix (available but unused components)
- Typography recipe table
- Z-index token scale
- Live chat pattern checklist
- Known gaps
