# UI Library — Reference

Sources:
- `frontend/components/ui/Button.tsx`
- `frontend/components/ui/Badge.tsx`
- `frontend/components/ui/Card.tsx`
- `frontend/components/ui/Input.tsx`
- `frontend/components/ui/Select.tsx`
- `frontend/components/ui/Modal.tsx`
- `frontend/components/ui/ModalAlert.tsx`
- `frontend/components/ui/Tooltip.tsx`
- `frontend/components/ui/Skeleton.tsx`
- `frontend/components/ui/LoadingSpinner.tsx`
- `frontend/components/ui/ActionIconButton.tsx`
- `frontend/components/admin/AdminSearchFilterBar.tsx`
- `frontend/components/admin/AdminTableHead.tsx`
- `frontend/components/admin/SidebarItem.tsx`
- `frontend/app/admin/components/PageHeader.tsx`
- `frontend/app/admin/components/StatsCard.tsx`
- `frontend/app/admin/components/ChartsWrapper.tsx`
- `frontend/components/providers/ThemeProvider.tsx` (exports `useTheme`)
- `frontend/hooks/useSessionTimeout.ts`
- `frontend/hooks/useNotificationSound.ts`

---

## Button

```tsx
import { Button } from '@/components/ui'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  isLoading?: boolean;        // Shows Loader2 spinner overlay
  loadingText?: string;       // Text inside spinner (optional)
  leftIcon?: React.ReactNode; // Icon before children
  rightIcon?: React.ReactNode;// Icon after children
  shine?: boolean;            // Shimmer effect (primary variant only)
  glow?: boolean;             // hover:shadow-glow
}
```

**Variants (via `variant` prop):**

| Value | Description |
|---|---|
| `primary` (default) | Brand gradient from-brand-500 to-brand-600, white text, shadow |
| `secondary` | bg-gray-100, border, gray text |
| `outline` | border-2 border-gray-200 → brand on hover |
| `ghost` | transparent, brand-500 text, bg-brand-50 on hover |
| `soft` | bg-brand-100, brand-700 text |
| `danger` | Red gradient, white text |
| `success` | Emerald gradient, white text |
| `warning` | Amber gradient, white text |
| `link` | Underline on hover, brand text |

**Sizes (via `size` prop):**

| Value | Height | Padding | Notes |
|---|---|---|---|
| `xs` | h-7 | px-2.5 | text-xs, rounded-lg |
| `sm` | h-9 | px-3.5 | text-sm |
| `md` (default) | h-10 | px-5 | text-sm |
| `lg` | h-12 | px-6 | text-base |
| `xl` | h-14 | px-8 | text-base |
| `icon-sm` | h-8 w-8 | p-0 | Square icon, rounded-lg |
| `icon` | h-10 w-10 | p-0 | Square icon |
| `icon-lg` | h-12 w-12 | p-0 | Square icon |

**Usage examples:**
```tsx
<Button>Save</Button>                                             // primary md
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="danger" isLoading={deleting}>Delete</Button>
<Button variant="ghost" size="icon"><Trash2 className="w-4 h-4" /></Button>
<Button leftIcon={<Plus className="w-4 h-4" />}>Add New</Button>
```

---

## Badge

```tsx
import { Badge } from '@/components/ui'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'gray' | 'outline';
  appearance?: 'filled' | 'outline' | 'soft';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  outline?: boolean; // Shorthand for appearance='outline'
}
```

**Note:** `variant='outline'` is a shorthand that sets `variant='gray'` + `appearance='outline'`.
To get colored outline, use `variant='danger' appearance='outline'`.

**Usage:**
```tsx
<Badge variant="success">Active</Badge>
<Badge variant="danger" size="sm">Error</Badge>
<Badge variant="info" appearance="outline">Processing</Badge>
// Direct color+text without CVA (used in some admin pages):
<span className="bg-success/12 text-success px-2 py-0.5 rounded-full text-xs">ACTIVE</span>
```

---

## Card

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass' | 'outlined' | 'filled' | 'gradient';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: 'none' | 'lift' | 'glow' | 'border' | 'scale';
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  glass?: boolean; // Shorthand for variant='glass'
}

// CardHeader: divider?: boolean (adds pb-5 border-b)
// CardTitle: gradient?: boolean (adds text-gradient CSS class)
// CardFooter: divider?: boolean, align?: 'start'|'center'|'end'|'between'
```

**Usage:**
```tsx
// Basic card
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Subtitle text</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>

// Glass card (used in AdminSearchFilterBar)
<Card glass className="border-none shadow-sm">
  <CardContent className="p-4">...</CardContent>
</Card>

// Elevated card with hover lift
<Card variant="elevated" hover="lift" padding="lg">...</Card>
```

---

## Input

```tsx
import { Input } from '@/components/ui'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: 'outline' | 'filled' | 'flushed';
  size?: 'sm' | 'md' | 'lg';
  state?: 'default' | 'error' | 'success';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  errorMessage?: string;   // Shown below input in red
  helperText?: string;     // Shown below input in gray
}
```

**Usage:**
```tsx
<Input
  placeholder="Search..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  leftIcon={<Search className="w-4 h-4" />}
  variant="filled"
/>

<Input
  type="password"
  state={errors.token ? 'error' : 'default'}
  errorMessage={errors.token}
  placeholder="Channel Access Token"
/>
```

---

## Select

```tsx
import { Select, type SelectOption } from '@/components/ui'

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];   // Required — not children
  variant?: 'outline' | 'filled';
  size?: 'sm' | 'md' | 'lg';
  state?: 'default' | 'error' | 'success';
  placeholder?: string;    // Adds disabled first option
  leftIcon?: React.ReactNode;
  errorMessage?: string;
  helperText?: string;
}
```

**Usage:**
```tsx
const statusOptions: SelectOption[] = [
  { value: '', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
]

<Select
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  options={statusOptions}
  variant="filled"
/>
```

---

## Modal

```tsx
import { Modal } from '@/components/ui'

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';  // default: 'md'
  showCloseButton?: boolean;                         // default: true
  closeOnBackdropClick?: boolean;                    // default: true
}
```

**Behavior:**
- Uses `createPortal` to `document.body`
- Locks `document.body.overflow` and adds `paddingRight` to compensate for scrollbar
- Listens for `Escape` key to close
- `max-h-[90vh]` with `overflow-y-auto` body (scrolls inside)

**Usage:**
```tsx
const [showModal, setShowModal] = useState(false)

<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Edit Settings"
  maxWidth="lg"
>
  <div className="space-y-4">
    {/* form fields */}
    <div className="flex justify-end gap-3 mt-6">
      <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </div>
  </div>
</Modal>
```

---

## ModalAlert

```tsx
import { ModalAlert, type AlertType } from '@/components/ui'

type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface ModalAlertProps {
  isOpen: boolean;
  onClose: () => void;
  type?: AlertType;        // default: 'info'
  title: string;
  message: React.ReactNode;
  onConfirm?: () => void;  // If absent, OK button calls onClose
  confirmText?: string;    // default: 'OK'
  cancelText?: string;     // default: 'Cancel'
  isLoading?: boolean;     // Shows spinner on confirm button
}
```

**Cancel button logic:**
- Appears ONLY when `type='confirm'` OR `type='warning'` AND `onConfirm` is provided
- `isLoading=true` prevents closing the modal via onClose while processing

**Button variants by type:**
| Type | Confirm Button Variant |
|---|---|
| `success` | `success` |
| `error` | `danger` |
| `warning` | `warning` |
| `confirm` | `primary` |
| `info` | `primary` |

---

## Tooltip

```tsx
import { Tooltip } from '@/components/ui'

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';  // default: 'top'
  align?: 'start' | 'center' | 'end';            // default: 'center'
  delay?: number;                                 // ms before showing, default: 200
}
```

**Implementation notes:**
- Uses `getBoundingClientRect` + `createPortal` to `document.body`
- Portal element uses `fixed` positioning computed from trigger bounds
- Repositions on window scroll/resize
- `delay=0` makes it appear immediately on hover

```tsx
<Tooltip content="View details" side="right">
  <ActionIconButton icon={<Eye className="w-4 h-4" />} label="View" />
</Tooltip>
```

---

## Skeleton

```tsx
import { Skeleton, SkeletonCard, SkeletonStats, SkeletonTable } from '@/components/ui'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
}

// Pre-built composites:
<SkeletonStats />                    // 4-column grid of icon+text+value cards
<SkeletonTable rows={5} />           // Table with header + N rows
<SkeletonCard lines={3} />           // Card with avatar + N text lines
```

---

## LoadingSpinner

```tsx
import { LoadingSpinner } from '@/components/ui'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';   // default: 'md'
  label?: string;                // Text below spinner
  className?: string;
  fullPage?: boolean;            // default: true (adds min-h-[40vh])
}
```

**Size mapping:**
| Size | Icon | Text |
|---|---|---|
| `sm` | h-5 w-5 | text-xs |
| `md` | h-8 w-8 | text-sm |
| `lg` | h-12 w-12 | text-base |

```tsx
// Page loading
if (loading) return <LoadingSpinner label="Loading requests..." />

// Inline spinner (e.g. inside a table cell or button area)
<LoadingSpinner size="sm" fullPage={false} />
```

---

## ActionIconButton

```tsx
import { ActionIconButton } from '@/components/admin'

interface ActionIconButtonProps {
  icon: React.ReactNode;
  label: string;          // Used for both Tooltip and aria-label
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'muted';
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
}
```

**Variant colors:**
| Value | Text | Hover bg |
|---|---|---|
| `default` | brand-600 | brand-50 |
| `warning` | amber-600 | amber-50 |
| `danger` | red-500 | red-50 |
| `success` | emerald-600 | emerald-50 |
| `muted` | gray-400 | gray-100 |

```tsx
// Table row actions
<div className="flex items-center gap-1">
  <ActionIconButton icon={<Eye className="w-4 h-4" />} label="View" />
  <ActionIconButton icon={<Edit2 className="w-4 h-4" />} label="Edit" />
  <ActionIconButton icon={<Trash2 className="w-4 h-4" />} label="Delete" variant="danger" />
</div>
```

---

## AdminSearchFilterBar

```tsx
import { AdminSearchFilterBar } from '@/components/admin'

interface AdminSearchFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusValue: string;
  onStatusChange: (value: string) => void;
  categoryValue?: string;
  onCategoryChange?: (value: string) => void;
  searchPlaceholder: string;
  statusOptions: SelectOption[];
  categoryOptions?: SelectOption[];
  showCategory?: boolean;  // default: true
}
```

**Grid layout:**
- `showCategory=true`: 4 columns (search spans 2, status 1, category 1)
- `showCategory=false`: 3 columns (search spans 2, status 1)

---

## AdminTableHead

```tsx
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin'

export interface AdminTableHeadColumn {
  key: string;
  label: React.ReactNode;       // Can be JSX with icons
  align?: 'left' | 'center' | 'right';  // default: 'left'
  className?: string;
}

interface AdminTableHeadProps {
  columns: AdminTableHeadColumn[];
  rowClassName?: string;
}
```

**Renders:** `<thead>` with `bg-slate-50 border-b border-slate-100` styling.

```tsx
<table className="w-full">
  <AdminTableHead columns={[
    { key: 'name', label: 'Name', className: 'px-6 py-4' },
    { key: 'status', label: 'Status', align: 'center' },
    { key: 'date', label: 'Created', align: 'right' },
    { key: 'actions', label: '', className: 'w-20' },
  ]} />
  <tbody>
    {/* rows */}
  </tbody>
</table>
```

---

## SidebarItem

```tsx
import { SidebarItem } from '@/components/admin'

interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;  // Lucide component TYPE (not JSX)
  label: string;
  href: string;
  isActive: boolean;
  isCollapsed: boolean;
  badge?: number;          // Red notification count (hidden if 0 or undefined)
  isSubItem?: boolean;     // Adds pl-11, smaller icon (18px vs 22px)
  hasSubMenu?: boolean;    // Shows ChevronRight that rotates when expanded
  isExpanded?: boolean;    // Controls ChevronRight rotation
  target?: string;         // Link target (e.g. '_blank')
}
```

**Active state:** Uses `.gradient-active` CSS class (defined in `app/globals.css`) —
`from-blue-600 to-indigo-600` gradient, white text, blue shadow.

**Collapsed state:** Wraps in `<Tooltip content={label} side="right">`.

```tsx
import { MessageSquare } from 'lucide-react'

<SidebarItem
  icon={MessageSquare}           // Component type, not <MessageSquare />
  label="Live Chat"
  href="/admin/live-chat"
  isActive={pathname.startsWith('/admin/live-chat')}
  isCollapsed={collapsed}
  badge={waitingSessions}        // Shows count badge if > 0
/>
```

---

## PageHeader

```tsx
// frontend/app/admin/components/PageHeader.tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;  // Renders right-aligned action buttons
  className?: string;
}
```

**Styling:** `bg-surface rounded-2xl p-5 border border-border-default shadow-sm` — uses semantic tokens.

```tsx
import PageHeader from '@/app/admin/components/PageHeader'

<PageHeader
  title="Service Requests"
  subtitle="Manage all service requests"
>
  <Button variant="secondary" onClick={refresh} leftIcon={<RefreshCw className="w-4 h-4" />}>
    Refresh
  </Button>
  <Button onClick={handleNew} leftIcon={<Plus className="w-4 h-4" />}>
    New Request
  </Button>
</PageHeader>
```

---

## StatsCard

```tsx
// frontend/app/admin/components/StatsCard.tsx
interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;   // JSX, not component type
  color: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  link?: string;           // Makes card a Next.js Link
  description?: string;    // Shown below value
  trend?: {
    value: number;         // Percentage number (e.g. 12 for 12%)
    isPositive: boolean;   // Green arrow up vs red arrow down
  };
}
```

**Color to gradient mapping:**
| Color | Icon bg gradient | Text color |
|---|---|---|
| `primary` | from-brand-100 to-brand-50 | brand-600 |
| `success` | from-green-100 to-green-50 | green-600 |
| `warning` | from-amber-100 to-amber-50 | amber-600 |
| `danger` | from-red-100 to-red-50 | red-600 |
| `info` | from-blue-100 to-blue-50 | blue-600 |
| `purple` | from-indigo-100 to-indigo-50 | indigo-600 |

```tsx
import StatsCard from '@/app/admin/components/StatsCard'

<div className="grid grid-cols-1 md:grid-cols-4 gap-5">
  <StatsCard
    title="Pending"
    value={stats.pending}
    icon={<Clock className="w-6 h-6" />}
    color="warning"
    link="/admin/requests?status=PENDING"
  />
  <StatsCard
    title="Completed"
    value={stats.completed}
    icon={<CheckCircle className="w-6 h-6" />}
    color="success"
    trend={{ value: 8, isPositive: true }}
  />
</div>
```

---

## ChartsWrapper

```tsx
// frontend/app/admin/components/ChartsWrapper.tsx
interface ChartsWrapperProps {
  statusData: Array<{ name: string; value: number }>;
  monthlyData: Array<{ month: string; count: number }>;
}
```

**Purpose:** Wraps `DashboardCharts` with `dynamic(..., { ssr: false })` so Recharts
can be used in server components. Shows a pulsing skeleton while loading.

**Pattern for custom charts in server pages:**
```tsx
// In a server component — use dynamic import:
const MyChart = dynamic(() => import('./_components/MyChart'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-slate-50 animate-pulse rounded-xl" />
})
```

---

## useTheme

```ts
// frontend/components/providers/ThemeProvider.tsx  (hooks/useTheme.ts was removed)
import { useTheme } from '@/components/providers/ThemeProvider'
const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
// Returns:
// theme: 'light' | 'dark' | 'system'  — the raw stored preference
// resolvedTheme: 'light' | 'dark'      — the applied theme (use for UI/icon state)
// setTheme: (t) => void                — set explicit preference, persists
// toggleTheme: () => void              — flips from resolvedTheme (works even when theme==='system')

// localStorage key: 'theme' (default; ThemeProvider storageKey prop)
// Applies: root.classList.add(resolvedTheme) on <html>
// Must be rendered inside <ThemeProvider> (throws otherwise).
```

---

## useSessionTimeout

```ts
// frontend/hooks/useSessionTimeout.ts
const { showWarning, remainingTime, extendSession } = useSessionTimeout(onLogout)

// Parameters:
// onLogout: () => void — called when session expires

// Returns:
// showWarning: boolean — true when < 5 minutes remain
// remainingTime: number — countdown in seconds (starts at 300)
// extendSession: () => void — resets all timers

// Constants:
const INACTIVITY_TIMEOUT = 30 * 60 * 1000  // 30 minutes
const WARNING_BEFORE     =  5 * 60 * 1000  //  5 minutes warning

// Activity events that reset timer:
// mousemove, keypress, click, scroll, touchstart
// Note: timer only resets if showWarning is false (user must click extendSession)
```

**Usage with SessionTimeoutWarning:**
```tsx
function AdminLayout() {
  const { logout } = useAuth()
  const { showWarning, remainingTime, extendSession } = useSessionTimeout(logout)

  return (
    <>
      {showWarning && (
        <SessionTimeoutWarning
          remainingTime={remainingTime}
          onExtend={extendSession}
          onLogout={logout}
        />
      )}
      {/* rest of layout */}
    </>
  )
}
```

---

## useNotificationSound

```ts
// frontend/hooks/useNotificationSound.ts
const { playNotification, setEnabled, isEnabled } = useNotificationSound()

// playNotification(): void
//   → Creates AudioContext, 800Hz sine oscillator, 0.3s with exponential decay
//   → Also calls navigator.vibrate(200) on mobile if supported
//   → Silent fail if AudioContext blocked by browser
//   → Only plays if enabled (checked via enabledRef)

// setEnabled(enabled: boolean): void
//   → Persists to localStorage key: 'livechat_sound_enabled'

// isEnabled(): boolean
//   → Returns current enabled state from ref

// Default: enabled=true (unless localStorage has 'false')
```

---

## Known Gaps

| ID | Gap | Component | Severity | Fix |
|---|---|---|---|---|
| GAP-1 | RESOLVED — `useTheme` moved to `components/providers/ThemeProvider` (no more `mounted`; SSR-safe via `useSyncExternalStore` for the prefers-color-scheme query) | ThemeProvider | — | n/a |
| GAP-2 | `Modal` `createPortal` guard checks `typeof document === 'undefined'` but Next.js 'use client' components may still SSR — safe in practice | Modal | Low | Ensure Modal is only rendered in client components |
| GAP-3 | `useNotificationSound` creates a new `AudioContext` on every call — browsers limit AudioContext count | useNotificationSound | Low | Cache AudioContext in a ref |
| GAP-4 | `Toast` / `useToast` component is exported but not used anywhere in the admin pages — admin uses Zustand notification store instead | Toast | Low | Consolidate to one notification system |
| GAP-5 | `AdminSearchFilterBar` is hardcoded to 3 or 4 columns — no support for more dropdowns | AdminSearchFilterBar | Low | Accept arbitrary filter slots |
