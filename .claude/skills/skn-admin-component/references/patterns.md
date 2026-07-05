# SKN App Frontend — Admin Component Patterns Reference

Real code snippets extracted from the live codebase for building admin components.

---

## Zustand State Management

### Reading from Store (Selector Pattern — prevents unnecessary re-renders)

```typescript
import { useLiveChatStore } from '@/_store/liveChatStore';

// Single selector — only re-renders when THIS value changes
const messages = useLiveChatStore((s) => s.messages);
const selectedId = useLiveChatStore((s) => s.selectedId);

// Multiple selectors — separate lines is more efficient than destructuring
const addNotification = useLiveChatStore((s) => s.addNotification);
const removeNotification = useLiveChatStore((s) => s.removeNotification);
```

### Zustand Actions (in callbacks and closures)

```typescript
// SAFE in closures: use getState() instead of hook value
const { addMessage, setConversations } = useLiveChatStore.getState();

// In event handlers where stale closure is a risk:
const handleEvent = useCallback(() => {
  const { messages } = useLiveChatStore.getState();  // Always fresh
  // process messages...
}, []); // Empty deps — no stale closure
```

### Toast Notifications via Zustand

```typescript
const addNotification = useLiveChatStore((s) => s.addNotification);
const removeNotification = useLiveChatStore((s) => s.removeNotification);

// Show a toast
addNotification({
  type: 'success',  // 'success' | 'error' | 'warning' | 'info'
  title: 'Saved',
  message: 'Changes have been saved successfully.',
});

// Auto-dismiss handled by NotificationToast component (5000ms default)
// Manual dismiss:
removeNotification(notificationId);
```

---

## Data Fetching Patterns

### Standard Fetch with Filters

```typescript
const fetchItems = useCallback(async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams();
    if (statusFilter) params.append('status', statusFilter);
    if (categoryFilter) params.append('category', categoryFilter);
    if (debouncedSearch) params.append('search', debouncedSearch);

    const res = await fetch(`${API_BASE}/admin/items?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setItems(await res.json());
  } catch (err) {
    console.error('fetchItems failed:', err);
  } finally {
    setLoading(false);
  }
}, [API_BASE, statusFilter, categoryFilter, debouncedSearch]);
```

### Debounced Search (500ms — project standard)

```typescript
const [search, setSearch] = useState('');
const [debouncedSearch, setDebouncedSearch] = useState('');

useEffect(() => {
  const timer = setTimeout(() => setDebouncedSearch(search), 500);
  return () => clearTimeout(timer);  // Cancel on next keystroke
}, [search]);
```

### Fetch on Modal Open

```typescript
useEffect(() => {
  if (isOpen) {
    void fetchAgents();
  }
}, [isOpen, fetchAgents]);
```

### CRUD Mutations

```typescript
// CREATE
const res = await fetch(`${API_BASE}/admin/items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData),
});

// UPDATE (partial)
const res = await fetch(`${API_BASE}/admin/items/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(changedFields),
});

// DELETE
const res = await fetch(`${API_BASE}/admin/items/${id}`, {
  method: 'DELETE',
});
// No body — 204 No Content response
```

---

## Delete Confirmation Modal

```typescript
// ConfirmDeleteModal.tsx
interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  loading?: boolean;
}

export function ConfirmDeleteModal({
  isOpen, onClose, onConfirm, itemName, loading = false
}: ConfirmDeleteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Delete" maxWidth="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-text-primary">
            Are you sure you want to delete <strong>"{itemName}"</strong>? This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={loading}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

---

## Status Badge Variants

```typescript
// Flexible status badge for any domain status
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    INACTIVE:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    PENDING:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    IN_PROGRESS:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    REJECTED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    WAITING:      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    CLOSED:       'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      styles[status] ?? 'bg-gray-100 text-gray-600'
    )}>
      {status}
    </span>
  );
}
```

---

## Table Skeleton (Loading State)

```typescript
function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border-default">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div
                className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// Usage:
<table>
  <thead>...</thead>
  {loading ? <TableSkeleton rows={5} cols={4} /> : <tbody>...</tbody>}
</table>
```

---

## Form Validation Helpers

```typescript
// Simple field-level validation
function validateForm(data: FormData): Partial<Record<keyof FormData, string>> {
  const errors: Partial<Record<keyof FormData, string>> = {};
  if (!data.title?.trim()) errors.title = 'Title is required';
  if (data.title && data.title.length > 255) errors.title = 'Title must be under 255 characters';
  if (!data.email?.includes('@')) errors.email = 'Invalid email address';
  return errors;
}

// Usage in submit handler:
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const errs = validateForm(formData);
  if (Object.keys(errs).length > 0) {
    setErrors(errs);
    return;  // Don't submit — show inline errors
  }
  // ... fetch
};
```

---

## Thai Date Formatting

```typescript
// Thai locale date
const thaiDate = new Date(item.created_at).toLocaleDateString('th-TH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
// Output: "22 กุมภาพันธ์ 2569"

// Short format
const shortDate = new Date(item.created_at).toLocaleDateString('th-TH');
// Output: "22/2/2569"

// Relative time helper
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString('th-TH');
}
```

---

## Animation Utilities (from globals.css)

```typescript
// Available animation classes:
'animate-fade-in-up'    // Fade + slide up (400ms) — for page load
'animate-scale-in'      // Scale from 96% to 100% (300ms) — for modals
'animate-fade-in'       // Simple fade (200ms) — for dropdowns
'animate-spin'          // Continuous spin — for loading spinners
'animate-pulse'         // Opacity pulse — for skeleton loading
'animate-shake'         // Horizontal shake — for error states (on Input)
'msg-in'               // Slide from left — for incoming chat messages
'msg-out'              // Slide from right — for outgoing chat messages

// Page entry animation:
<div className="p-6 space-y-6 animate-fade-in-up">
  {/* Page content */}
</div>

// Modal animation:
<div className="animate-scale-in">
  {/* Modal content */}
</div>
```

---

## Icon Pattern (Lucide React)

```typescript
import { Search, Plus, Edit2, Trash2, ChevronRight, X, Check, AlertTriangle } from 'lucide-react';

// Icon as component type (for SidebarItem and similar):
interface Props {
  icon: React.ComponentType<{ className?: string }>;
}
function Component({ icon: Icon }: Props) {
  return <Icon className="w-5 h-5 text-text-secondary" />;
}

// Icon in button (left/right icon via Button component):
<Button leftIcon={<Plus className="w-4 h-4" />} variant="primary">
  Add Item
</Button>

// Icon standalone:
<Search className="w-4 h-4 text-text-tertiary" />
```

---

## Responsive Sidebar Layout (from layout.tsx)

```typescript
// Auto-collapse sidebar at < 1024px
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

useEffect(() => {
  const handleResize = () => {
    setIsSidebarCollapsed(window.innerWidth < 1024);
  };
  handleResize();
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

// Sidebar width transition
<aside className={cn(
  'fixed left-0 top-0 z-50 h-full',
  'transition-all duration-300 ease-in-out',
  isSidebarCollapsed ? 'w-20' : 'w-64',
)}>

// Main content offset
<main className={cn(
  'transition-all duration-300 ease-in-out',
  isSidebarCollapsed ? 'ml-20' : 'ml-64',
)}>
```

---

## Accessibility Patterns

```typescript
// ARIA for icon-only buttons
<button aria-label="Delete item" className="p-2 rounded-lg hover:bg-red-50">
  <Trash2 className="w-4 h-4 text-danger" />
</button>

// Role for dropdown menus
<div role="menu" aria-label="Row actions" className="absolute right-0 bg-white shadow-lg rounded-xl">
  <button role="menuitem" onClick={handleEdit}>Edit</button>
  <button role="menuitem" onClick={handleDelete}>Delete</button>
</div>

// Focus ring (always visible on keyboard, hidden on mouse)
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
```

---

## File Reference Map

```
frontend/
├── app/
│   ├── globals.css                          ← Semantic tokens, animation classes, glass utilities
│   └── admin/
│       ├── layout.tsx                       ← Sidebar, navbar, responsive collapse, SidebarItem usage
│       ├── requests/page.tsx                ← Full CRUD page: filters, table, modals
│       └── settings/page.tsx                ← Settings with CredentialForm pattern
├── components/
│   ├── ui/
│   │   ├── Button.tsx                       ← CVA variants, forwardRef, loading state, icon support
│   │   ├── Card.tsx                         ← Composite (Card+Header+Title+Content+Footer), glass variant
│   │   ├── Input.tsx                        ← CVA, icon overlay, error/success state, helper text
│   │   └── Modal.tsx                        ← Portal, scroll lock, Escape key, backdrop click
│   └── admin/
│       ├── SidebarItem.tsx                  ← Active gradient, collapsed tooltip, badge, sub-menu
│       ├── NotificationToast.tsx            ← Toast via Zustand addNotification
│       └── ChatModeToggle.tsx               ← Toggle with icon switch pattern
├── hooks/
│   └── useLiveChatSocket.ts                 ← WebSocket hook pattern reference
│   (theme: components/providers/ThemeProvider.tsx — exports useTheme, key 'theme')
├── _store/
│   └── liveChatStore.ts                     ← Zustand store: state + actions + devtools + selectors
└── lib/
    └── utils.ts                             ← cn() = clsx + tailwind-merge
```
