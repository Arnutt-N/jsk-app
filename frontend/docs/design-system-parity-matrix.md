# Design System Parity Matrix

Updated: 2026-02-15  
Source baseline: `research/common/ui-design-system-comparison-merged.md`

## 1. Component Parity

| Example Primitive / Pattern | Current JSK Path | Status | Notes |
|---|---|---|---|
| Button | `frontend/components/ui/Button.tsx` | Adopted (existing) | Keep current 9-variant implementation |
| Card | `frontend/components/ui/Card.tsx` | Adopted (existing) | Keep current 6-variant implementation |
| Badge | `frontend/components/ui/Badge.tsx` | Adopted (existing) | Keep current 7-variant implementation |
| Toast | `frontend/components/ui/Toast.tsx` | Adopted (existing) | Custom Zustand architecture retained |
| Dialog (generic) | `frontend/components/ui/Modal.tsx` | Adopted (equivalent) | Keep current API; use for forms, previews, custom content |
| AlertDialog (destructive confirm) | `frontend/components/ui/ConfirmDialog.tsx` | **Canonical** (since PR #54) | Use for ALL delete confirmations. `description` accepts `ReactNode` for bold names + red footnote. `ModalAlert.tsx` is deprecated for confirms — migrate remaining callers. |
| Table | `frontend/components/ui/Table.tsx` | Available (unused) | Available, not yet imported by any page |
| Pagination | `frontend/components/ui/Pagination.tsx` | Available (unused) | Available, not yet imported by any page |
| Textarea | `frontend/components/ui/Textarea.tsx` | Available (unused) | Available, not yet imported by any page |
| Popover | `frontend/components/ui/Popover.tsx` | Available (unused) | Available, not yet imported by any page |
| Form (RHF helpers) | `frontend/components/ui/Form.tsx` | Available (unused) | Available, not yet imported by any page |
| Accordion | `frontend/components/ui/Accordion.tsx` | Available (unused) | Available, not yet imported by any page |
| Calendar | `frontend/components/ui/Calendar.tsx` | Available (unused) | Available, not yet imported by any page |
| Sheet | `frontend/components/ui/Sheet.tsx` | Available (unused) | Available, not yet imported by any page |
| Chart wrappers | `frontend/components/ui/Chart.tsx` | Available (unused) | Available, not yet imported by any page |
| Command palette | `frontend/components/ui/Command.tsx` | Available (unused) | Available, not yet imported by any page |
| Sidebar pattern | `frontend/app/admin/layout.tsx` | Adopted (custom) | Inline architecture retained |

## 2. Token Parity

| Example Token Family | JSK Token | Status |
|---|---|---|
| `primary` / `primary-foreground` | `brand-500` / `white` | Adopted (mapped). `--color-primary` and `--color-primary-dark` are now aliases of `brand-500` / `brand-700` in `globals.css` so legacy `text-primary` / `bg-primary` / `from-primary` classes resolve correctly (fixed in PR #54 — previously they were no-ops, producing white-on-white icons). |
| `muted` / `muted-foreground` | `gray-100` / `text-text-secondary` | Adopted (mapped) |
| `popover` / `popover-foreground` | `surface` / `text-text-primary` | Adopted (mapped) |
| `input` | `border-border-default` | Adopted (mapped) |
| `ring` | `brand-500` | Adopted (mapped) |
| `chart-1..5` | `--chart-1..5`, `--color-chart-1..5` | Available (unused) |
| `accent` | `--color-accent` family | Available (unused) |
| `sidebar-primary-fg` | `--sidebar-primary-fg`, `--color-sidebar-primary-fg` | Available (unused) |

## 3. Live Chat Pattern Parity

| Example Pattern | JSK Path | Status | Notes |
|---|---|---|---|
| Bubble corner-cut | `frontend/app/admin/live-chat/_components/MessageBubble.tsx` | Adopted | Directional corner cut retained |
| Read receipts (`Check` / `CheckCheck`) | `frontend/app/admin/live-chat/_components/MessageBubble.tsx` | Adopted | Icon-based |
| Toast slide animation | `frontend/app/admin/live-chat/_components/NotificationToast.tsx` | Adopted | `toast-slide` |
| Notification vibration | `frontend/hooks/useNotificationSound.ts` | Adopted | `navigator.vibrate(200)` guarded |
| Status dot ring/position | `frontend/app/admin/live-chat/_components/ConversationItem.tsx`, `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | Adopted | Absolute + border ring |
| Dot size consistency (`h-3 w-3`) | `frontend/app/admin/live-chat/_components/ConversationList.tsx`, `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | Adopted | Standardized |

## 4. Deferred / Out-of-Scope

| Item | Status | Rationale |
|---|---|---|
| Full shadcn generator workflow | Deferred | Current custom CVA system is richer and already integrated |
| Tailwind v3 plugin conventions (`tailwindcss-animate`) | Out-of-scope | Project runs Tailwind v4 CSS-first model |
| Replacing existing `Button` / `Card` / `Badge` | Out-of-scope | Higher current feature richness |
| Backend/WebSocket protocol migration | Out-of-scope | UI-only migration boundary |
