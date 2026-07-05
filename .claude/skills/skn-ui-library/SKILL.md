---
name: skn-ui-library
description: >
  Reference for using the SKN App shared UI component library, admin components, and hooks.
  Use when asked to "add a button", "use the UI components", "use Badge/Card/Modal/Input/Select",
  "use AdminSearchFilterBar", "add a StatsCard", "use SidebarItem", "use PageHeader",
  "use useTheme", "use useSessionTimeout", "use useNotificationSound", "add loading state",
  "show skeleton loading", "create a confirmation modal", "ใช้ component Button/Badge/Card",
  "เพิ่ม StatsCard", "ใช้ Modal ยืนยัน", "ใช้ AdminSearchFilterBar".
  Do NOT use for creating new pages (skn-admin-component), live chat UI (skn-live-chat-frontend),
  or analytics charts (skn-analytics-frontend).
license: MIT
compatibility: >
  Claude Code with SKN App project.
  Requires: Next.js 16, React 19, TypeScript, Tailwind CSS v4, CVA, Lucide icons.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: frontend
  tags: [ui, components, hooks, button, card, modal, badge, skeleton, theme]
  related-skills:
    - skn-admin-component
    - skn-analytics-frontend
    - skn-live-chat-frontend
  documentation: ./references/ui_library_reference.md
---

# skn-ui-library

The SKN App frontend has a complete shared component library in `frontend/components/ui/`,
admin-specific shared components in `frontend/components/admin/`, dashboard components in
`frontend/app/admin/components/`, and custom hooks in `frontend/hooks/`. All primitives
follow CVA + cn() + forwardRef. This skill documents their exact APIs and variant names
so they can be used correctly without re-reading the source files.

---

## CRITICAL: Project-Specific Rules

1. **All primitive components use CVA + cn() + forwardRef — no raw HTML** — Always use
   the component variants, not raw `<button>`, `<input>`, or `<select>`. Pass `className`
   for one-off overrides, never inline styles:
   ```tsx
   // Correct:
   <Button variant="danger" size="sm" isLoading={loading}>Delete</Button>
   // Wrong:
   <button className="bg-red-500 text-white px-3 py-1">Delete</button>
   ```

2. **Button has 8 variants and 8 sizes — choose the right one** — Variant controls color,
   size controls dimensions. The `icon-*` sizes set fixed square dimensions (`h-8 w-8`
   through `h-12 w-12`) and have no padding:
   ```tsx
   // 8 variants: primary | secondary | outline | ghost | soft | danger | success | warning | link
   // 8 sizes:    xs | sm | md | lg | xl | icon-sm | icon | icon-lg
   <Button variant="primary" size="md">Save</Button>          // default filled brand
   <Button variant="ghost" size="icon"><TrashIcon /></Button>  // icon-only button
   <Button variant="outline" isLoading={saving} loadingText="Saving...">Save</Button>
   ```

3. **Input and Select use `state` prop for error/success — not className** — Pass
   `state="error"` or `state="success"` for validation styling. Use `errorMessage` for
   helper text under the field. `variant="filled"` is preferred for filter bars:
   ```tsx
   <Input
     state={errors.email ? 'error' : 'default'}
     errorMessage={errors.email}
     leftIcon={<Mail className="w-4 h-4" />}
     variant="filled"
   />
   ```

4. **Select takes `options` array — not `<option>` children** — The SKN Select component
   is a controlled wrapper around `<select>`. Pass `SelectOption[]`, not children:
   ```tsx
   // Correct:
   const statusOptions: SelectOption[] = [
     { value: '', label: 'All Status' },
     { value: 'active', label: 'Active' },
   ]
   <Select options={statusOptions} value={status} onChange={(e) => setStatus(e.target.value)} />
   // Wrong:
   <Select><option value="">All Status</option></Select>   // ← will not render
   ```

5. **Modal uses createPortal + locks body scroll — always check `isOpen` and `onClose`** —
   Modal manages `document.body.overflow` and `paddingRight` (scrollbar compensation).
   It listens for Escape key. Backdrop click closes unless `closeOnBackdropClick={false}`:
   ```tsx
   <Modal
     isOpen={showModal}
     onClose={() => setShowModal(false)}
     title="Confirm Action"
     maxWidth="md"   // sm | md | lg | xl | 2xl
   >
     {/* Modal body — scrollable if content is tall */}
   </Modal>
   ```

6. **ModalAlert — use for all confirm/alert dialogs, not raw Modal** — `ModalAlert` wraps
   `Modal` with icon, typed variants, and button layout. The Cancel button only appears
   for `type='confirm'` or `type='warning'` when `onConfirm` is provided:
   ```tsx
   <ModalAlert
     isOpen={showDelete}
     onClose={() => setShowDelete(false)}
     type="confirm"    // success | error | warning | info | confirm
     title="Delete this record?"
     message="This action cannot be undone."
     confirmText="Delete"
     cancelText="Cancel"
     onConfirm={handleDelete}
     isLoading={deleting}
   />
   // type='success' or type='info' without onConfirm → single OK button
   ```

7. **Tooltip is a custom component — wrap in `<Tooltip content={...}>`** — The Tooltip is
   NOT Radix/shadcn. It's a custom component using `getBoundingClientRect` + `createPortal`.
   Pass `content` (string or ReactNode) as a prop, wrap children in it:
   ```tsx
   <Tooltip content="Delete this item" side="top" delay={200}>
     <Button variant="ghost" size="icon"><Trash2 /></Button>
   </Tooltip>
   // side: top | bottom | left | right
   // align: start | center | end
   ```

8. **AdminSearchFilterBar handles search + status + optional category in one component** —
   Pass `SelectOption[]` to `statusOptions`. Set `showCategory={false}` to hide the third
   dropdown. Category is optional; `onCategoryChange` and `categoryOptions` both required
   when `showCategory={true}` (default):
   ```tsx
   <AdminSearchFilterBar
     searchValue={search}
     onSearchChange={setSearch}
     searchPlaceholder="Search by name..."
     statusValue={status}
     onStatusChange={setStatus}
     statusOptions={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }]}
     showCategory={false}   // omit third dropdown
   />
   ```

9. **AdminTableHead expects `AdminTableHeadColumn[]` — label is `ReactNode`** — The column
   label can be text or JSX (e.g. with an icon). Align defaults to `'left'`:
   ```tsx
   const columns: AdminTableHeadColumn[] = [
     { key: 'name', label: 'Name', className: 'px-6 py-4' },
     { key: 'status', label: 'Status', align: 'center' },
     { key: 'actions', label: '', align: 'right', className: 'w-16' },
   ]
   <table><AdminTableHead columns={columns} /></table>
   ```

10. **SidebarItem requires `isActive` + `isCollapsed` props** — It renders a Next.js Link
    with `.gradient-active` class when active. When collapsed, wraps in Tooltip:
    ```tsx
    <SidebarItem
      icon={Users}          // Lucide component type (not JSX)
      label="Friends"
      href="/admin/friends"
      isActive={pathname === '/admin/friends'}
      isCollapsed={collapsed}
      badge={unreadCount}   // optional notification count
    />
    ```

11. **StatsCard `link` prop makes the entire card a Next.js Link** — Without `link`, it
    renders as a plain div. `color` must be one of 6 tokens that map to the icon gradient:
    ```tsx
    <StatsCard
      title="Total Requests"
      value={stats.total}
      icon={<FileText className="w-6 h-6" />}
      color="primary"    // primary | success | warning | danger | info | purple
      link="/admin/requests?status=PENDING"
      description="Service requests this month"
      trend={{ value: 12, isPositive: true }}  // optional % trend
    />
    ```

12. **PageHeader: children slot is for action buttons** — Children render right-aligned in
    a flex row. Always use semantic tokens; don't add raw background classes:
    ```tsx
    <PageHeader
      title="Service Requests"
      subtitle="Manage all incoming requests"
    >
      <Button onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>
        Add New
      </Button>
    </PageHeader>
    ```

13. **ChartsWrapper is a dynamic import bridge — all Recharts must use it** — Server
    components cannot render Recharts directly. Use ChartsWrapper (or follow its pattern
    of `dynamic(..., { ssr: false })`) when adding chart clients to server pages:
    ```tsx
    // In a server component:
    <ChartsWrapper statusData={statusData} monthlyData={monthlyData} />
    // Never: <BarChart data={...} /> directly in a server component
    ```

14. **`useTheme` — from `@/components/providers/ThemeProvider` (NOT a `hooks/` file)** —
    the standalone `hooks/useTheme.ts` was removed; theme state now lives entirely in
    `ThemeProvider`. localStorage key is `theme` (default), values `'light' | 'dark' | 'system'`.
    ```ts
    import { useTheme } from '@/components/providers/ThemeProvider'
    const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
    // theme: 'light' | 'dark' | 'system' (the raw preference)
    // resolvedTheme: 'light' | 'dark'    (what is actually applied — use THIS for UI state)
    // toggleTheme() flips from resolvedTheme, so it works even when theme === 'system'.
    // Applies via <html> class: root.classList.add(resolvedTheme). Must be inside <ThemeProvider>.
    ```

15. **`useSessionTimeout` — 30-min timeout, 5-min warning** — Pass an `onLogout` callback.
    Use `showWarning` to show a countdown UI; call `extendSession()` from the "Stay logged
    in" button in `SessionTimeoutWarning`:
    ```ts
    const { showWarning, remainingTime, extendSession } = useSessionTimeout(handleLogout)
    // remainingTime: countdown in seconds (starts at 300 when warning shows)
    // Activity events: mousemove, keypress, click, scroll, touchstart — all reset timer
    ```

16. **`useNotificationSound` — Web Audio API oscillator, no audio file** — The sound is
    a 800Hz sine wave lasting 0.3s, generated via `AudioContext` on demand. Storage key
    is `livechat_sound_enabled`. Errors are silently swallowed (blocked by browser):
    ```ts
    const { playNotification, setEnabled, isEnabled } = useNotificationSound()
    playNotification()         // plays beep if enabled
    setEnabled(false)          // persists to localStorage
    ```

17. **`LoadingSpinner` defaults to `fullPage={true}` — set `false` for inline use** —
    Default adds `min-h-[40vh]` to center vertically in large areas. Inline spinners need
    `fullPage={false}`:
    ```tsx
    <LoadingSpinner label="Loading..." />                      // full-height centered
    <LoadingSpinner size="sm" fullPage={false} />              // inline small spinner
    ```

18. **`Skeleton` composites — use pre-built patterns for page loading states** — The file
    exports three ready-made patterns for common loading states:
    ```tsx
    <SkeletonStats />                  // 4-column stats grid
    <SkeletonTable rows={8} />         // table with N rows
    <SkeletonCard lines={3} />         // card with avatar + lines
    ```

---

## Component Locations

```
frontend/components/ui/
├── Button.tsx           — Primary action component (CVA, 8 variants, 8 sizes)
├── Badge.tsx            — Status label pill (CVA, 7 variants, 3 appearances)
├── Card.tsx             — Content container (CVA, CardHeader/Title/Description/Content/Footer)
├── Input.tsx            — Text input (CVA, icons, error/helper text)
├── Select.tsx           — Dropdown (CVA, SelectOption[] options)
├── Modal.tsx            — Portal overlay (body scroll lock, ESC close)
├── ModalAlert.tsx       — Typed alert/confirm dialog (wraps Modal)
├── Tooltip.tsx          — Custom hover tooltip (createPortal, no Radix)
├── Skeleton.tsx         — Loading placeholders (SkeletonCard/Stats/Table)
├── LoadingSpinner.tsx   — Centered spinner (Loader2, fullPage prop)
├── ActionIconButton.tsx — Icon button with built-in Tooltip (5 color variants)
├── Avatar.tsx           — User avatar with AvatarGroup
├── Tabs.tsx             — Tab container + triggers + content
├── Switch.tsx           — Toggle switch
├── Checkbox.tsx         — Checkbox input
├── RadioGroup.tsx       — Radio buttons
├── Textarea.tsx         — Multi-line input
├── Progress.tsx         — Progress bar
├── Pagination.tsx       — Page navigation controls
├── Separator.tsx        — Horizontal/vertical divider
├── Alert.tsx            — Inline alert banner
├── Toast.tsx            — Transient notification (ToastProvider + useToast)
├── Popover.tsx          — Floating popover panel
├── DropdownMenu.tsx     — Dropdown menu with items
├── Accordion.tsx        — Collapsible sections
├── Sheet.tsx            — Slide-in panel (drawer)
├── Tabs.tsx             — Tabbed content
├── Calendar.tsx         — Date picker
├── Command.tsx          — Command palette (search + items)
├── Chart.tsx            — Recharts wrapper (ChartContainer/Tooltip/Legend)
└── index.ts             — Re-exports all components

frontend/components/admin/
├── AdminSearchFilterBar.tsx   — Search + status + optional category bar
├── AdminTableHead.tsx         — Sortable-ready table header (AdminTableHeadColumn[])
├── SidebarItem.tsx            — Nav link with active gradient, collapse, badge
├── ActionIconButton.tsx       — ← also in ui/ (duplicate)
├── AssignModal.tsx            — Operator assignment modal (fetches /admin/users)
├── BotStatusIndicator.tsx     — Chat mode (BOT/HUMAN) status dot
├── TypingIndicator.tsx        — Animated typing dots
├── CannedResponsePicker.tsx   — Shortcut-triggered quick-reply picker
├── ConversationActionMenu.tsx — Per-conversation action dropdown
├── CredentialForm.tsx         — Credential edit form
└── SessionTimeoutWarning.tsx  — Warning banner with countdown + extend button

frontend/app/admin/components/
├── PageHeader.tsx       — Page title + subtitle + action slot
├── StatsCard.tsx        — Metric card with icon, color, trend, optional link
├── ChartsWrapper.tsx    — dynamic() bridge for Recharts in server pages
└── DashboardCharts.tsx  — Actual Recharts chart components (client only)

frontend/hooks/
├── useSessionTimeout.ts     — 30-min inactivity logout with 5-min warning
├── useNotificationSound.ts  — Web Audio API beep (localStorage: livechat_sound_enabled)
├── useWebSocket.ts          — Generic WebSocket hook (used by analytics)
└── useLiveChatSocket.ts     — Live chat WebSocket (see skn-live-chat-frontend skill)
```

---

## Quick Variant Reference

### Button variants
| Variant | Appearance |
|---|---|
| `primary` | Brand gradient (blue→indigo), white text, shadow |
| `secondary` | Gray bg, border, text-gray |
| `outline` | Transparent bg, gray border → brand on hover |
| `ghost` | Transparent, brand text, brand-50 on hover |
| `soft` | brand-100 bg, brand-700 text |
| `danger` | Red gradient, white text |
| `success` | Green gradient, white text |
| `warning` | Amber gradient, white text |
| `link` | Underline on hover, brand text |

### Badge variants
| Variant | Bg | Text |
|---|---|---|
| `primary` | brand-100 | brand-700 |
| `secondary` | gray-100 | gray-700 |
| `success` | green-100 | green-700 |
| `warning` | amber-100 | amber-700 |
| `danger` | red-100 | red-700 |
| `info` | blue-100 | blue-700 |
| `gray` | gray-100 | gray-600 |
| `outline` | transparent | gray-600, border |

### Card variants
| Variant | Description |
|---|---|
| `default` | bg-surface + border-default + shadow-md |
| `elevated` | Same + shadow-lg |
| `glass` | bg-white/70 backdrop-blur, border-white/50 |
| `outlined` | transparent bg, border-2 |
| `filled` | bg-bg (darker surface) |
| `gradient` | white→gray-50 gradient |

### StatsCard colors
| Color | Icon bg | Text |
|---|---|---|
| `primary` | brand-100→brand-50 | brand-600 |
| `success` | green-100→green-50 | green-600 |
| `warning` | amber-100→amber-50 | amber-600 |
| `danger` | red-100→red-50 | red-600 |
| `info` | blue-100→blue-50 | blue-600 |
| `purple` | indigo-100→indigo-50 | indigo-600 |

---

## Common Patterns

### Page loading skeleton
```tsx
if (isLoading) return <SkeletonStats />
// or for tables:
if (isLoading) return <SkeletonTable rows={5} />
```

### Confirm delete dialog
```tsx
const [showConfirm, setShowConfirm] = useState(false)
const [deleting, setDeleting] = useState(false)

<ModalAlert
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  type="confirm"
  title="Delete this item?"
  message="This cannot be undone."
  confirmText="Delete"
  onConfirm={async () => {
    setDeleting(true)
    await deleteItem()
    setDeleting(false)
    setShowConfirm(false)
  }}
  isLoading={deleting}
/>
```

### Icon-only action buttons in a table row
```tsx
// Use ActionIconButton — auto wraps in Tooltip
<ActionIconButton
  icon={<Edit2 className="w-4 h-4" />}
  label="Edit"
  variant="default"
  onClick={() => setEditing(item.id)}
/>
<ActionIconButton
  icon={<Trash2 className="w-4 h-4" />}
  label="Delete"
  variant="danger"
  onClick={() => setShowConfirm(true)}
/>
```

---

## Quality Checklist

Before finishing, verify:
- [ ] Components imported from `@/components/ui` or `@/components/admin` (not relative paths)
- [ ] Button `variant` and `size` chosen from documented options (not custom className replacements)
- [ ] Select receives `options: SelectOption[]` not children
- [ ] Modal paired with state: `isOpen={showX}` / `onClose={() => setShowX(false)}`
- [ ] ModalAlert used for confirm/alert dialogs (not raw Modal + custom buttons)
- [ ] `state="error"` + `errorMessage` used on Input for form validation
- [ ] `AdminTableHead` receives `AdminTableHeadColumn[]` (not `<th>` elements)
- [ ] `StatsCard` color is one of: primary / success / warning / danger / info / purple
- [ ] Charts in server pages go through `ChartsWrapper` or a `dynamic(..., {ssr:false})` wrapper
- [ ] `LoadingSpinner` has `fullPage={false}` when used inline
- [ ] Skeleton composites (`SkeletonStats/Table/Card`) used for page loading states

## Additional Resources

For full props tables, variant listings, and interface definitions —
see `references/ui_library_reference.md`.
