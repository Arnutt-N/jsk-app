# Sidebar + Navbar Full Design System Alignment

**Date:** 2026-02-20
**Branch:** fix/ui-consistency (continue here) or new branch
**References:**
- `D:/genAI/hr-ims/src/layout/Sidebar.jsx` + `SidebarItem.jsx`
- `D:/genAI/skn-app/examples/admin-chat-system/components/admin-sidebar.tsx`
- `D:/genAI/skn-app/examples/admin-chat-system/app/globals.css`
- `D:/genAI/skn-app/examples/admin-chat-system/HR-IMS-STYLE-CHANGES.md`

---

## Goal

Bring `skn-app` admin layout (sidebar + navbar) into full alignment with the HR-IMS and admin-chat-system reference implementations. Extract a reusable `SidebarItem` component. Formalize sidebar and gradient tokens in `globals.css`.

---

## Section A — Token Layer (`globals.css`)

### New CSS variables (add to `:root` block)

```css
/* Sidebar tokens — matching admin-chat-system reference */
--sidebar-foreground: 213 31% 91%;
--sidebar-primary: 217 91% 60%;
--sidebar-muted: 215 20% 65%;
--gradient-active-from: 217 91% 60%;   /* blue-600 */
--gradient-active-to: 225 93% 65%;     /* indigo-600 */
```

Note: `--color-sidebar-bg: hsl(222 47% 11%)` already exists — no change.

### New utility classes (add to `@layer utilities` or custom section)

```css
/* HR-IMS gradient active state for sidebar nav items */
.gradient-active {
  background: linear-gradient(
    to right,
    hsl(var(--gradient-active-from)),
    hsl(var(--gradient-active-to))
  );
}

/* HR-IMS logo icon gradient */
.gradient-logo {
  background: linear-gradient(
    to bottom right,
    hsl(225 93% 65%),
    hsl(217 91% 60%)
  );
}
```

### Already correct (no change needed)

```css
.glass-navbar { ... }         /* light mode — correct */
.dark .glass-navbar { ... }   /* dark mode — correct */
.scrollbar-sidebar { ... }    /* already 5px equivalent */
```

---

## Section B — New Component: `SidebarItem.tsx`

**File:** `frontend/components/admin/SidebarItem.tsx`

### Props interface

```tsx
interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  isActive: boolean;
  isCollapsed: boolean;
  badge?: number;          // rose-500 pill, position shifts when collapsed
  isSubItem?: boolean;     // pl-11, text-sm, font-normal text
  hasSubMenu?: boolean;    // shows ChevronRight that rotates when expanded
  isExpanded?: boolean;    // controls chevron rotation state
  target?: string;         // for _blank links (Live Chat)
}
```

### Active state classes
```
bg-gradient-to-r from-blue-600 to-indigo-600
text-white
shadow-lg shadow-blue-900/40
rounded-xl p-3.5
```

### Inactive state classes
```
text-slate-400
hover:bg-white/5 hover:text-white
rounded-xl p-3.5
```

### Icon state
- Active: `text-white`
- Inactive: `text-slate-400 group-hover:text-blue-300`
- Size: `w-[22px] h-[22px]` (22px, matching HR-IMS reference)
- Sub-item: `w-[18px] h-[18px]`

### Badge
- Expanded: `absolute right-2 top-1/2 -translate-y-1/2`
- Collapsed: `absolute top-1 right-1`
- Style: `bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-rose-400 min-w-[1.25rem]`

### Collapsed tooltip
When `isCollapsed=true`, wrap in `<Tooltip content={label} side="right">` (uses existing Tooltip component at `components/ui/Tooltip.tsx`).

### Behavior
- Renders as `<Link href={href}>` with Next.js Link
- `target` prop forwarded for external links (Live Chat opens in new tab)
- Full width: `w-full flex items-center`

---

## Section C — Layout Changes (`admin/layout.tsx`)

### 1. Logo area height
```tsx
// BEFORE
<div className="relative z-10 h-16 flex items-center ...">
// AFTER
<div className="relative z-10 h-20 flex items-center ...">
```

### 2. Navbar `<header>` — height + glass class
```tsx
// BEFORE
className={cn(
  'sticky top-0 z-40 h-16',
  'flex items-center justify-between',
  'bg-white/80 dark:bg-gray-800/80 backdrop-blur-md',
  'border-b border-slate-200/60 dark:border-gray-700/60',
  'px-6 md:px-8'
)}

// AFTER
className={cn(
  'sticky top-0 z-40 h-20',
  'flex items-center justify-between',
  'glass-navbar',           // replaces all manual bg/border classes
  'px-6 md:px-8'
)}
```

### 3. Profile footer
```tsx
// BEFORE
<div className="relative z-10 p-3 border-t border-white/10 bg-black/10 backdrop-blur-sm">
// AFTER
<div className="relative z-10 p-3 border-t border-white/10 bg-slate-800/50">
```

### 4. Bottom collapse toggle (new addition)
Add below the profile footer, outside the `<nav>`:
```tsx
<button
  onClick={toggleSidebar}
  className="relative z-10 flex h-10 items-center justify-center border-t border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-colors w-full"
  aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
>
  {isSidebarCollapsed
    ? <ChevronRight className="h-4 w-4" />
    : <ChevronLeft className="h-4 w-4" />}
</button>
```

Remove the existing collapse button from inside the logo area (keep the logo link, remove the ChevronLeft button that wraps the logo row).

### 5. Nav items — use SidebarItem component
Replace the inline `<Link className={cn(...)}>` block inside the `group.items.map()` with:
```tsx
<SidebarItem
  icon={item.icon}
  label={item.name}
  href={item.href}
  isActive={isActive}
  isCollapsed={isSidebarCollapsed}
  target={item.openInNewTab ? '_blank' : undefined}
/>
```

Remove the old `navLink` variable and surrounding Tooltip wrapping (Tooltip is now inside SidebarItem).

### 6. Avatar ring fix
```tsx
// BEFORE
className="ring-2 ring-blue-500/40 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
// AFTER
className="ring-2 ring-indigo-500/20 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
```

### 7. Header search text tokens
```tsx
// BEFORE
className="bg-transparent text-sm text-slate-800 dark:text-gray-200 placeholder:text-slate-400 ..."
// AFTER
className="bg-transparent text-sm text-text-primary placeholder:text-text-tertiary ..."
```

---

## Files Changed

| File | Type | Change |
|---|---|---|
| `frontend/app/globals.css` | modify | Add sidebar tokens + gradient-active/logo utilities |
| `frontend/components/admin/SidebarItem.tsx` | **create** | New reusable nav item component |
| `frontend/app/admin/layout.tsx` | modify | h-20, glass-navbar, SidebarItem, footer, ring, search |

---

## Constraints

- **Sidebar gradient stays blue→indigo** (decorative, not brand purple). This is intentional per the UI migration plan.
- **Brand purple (`brand-*`) stays for content** — buttons, focus rings, interactive elements.
- **No dark mode tokens in sidebar** — sidebar is always dark regardless of theme (same as HR-IMS).
- **Live Chat nav item** opens in new tab (`target="_blank"`) — behavior preserved.
- **Analytics page** is at `/admin/analytics` — not in the current menu, not added.

---

## Success Criteria

- [ ] Sidebar logo area is 80px tall (h-20)
- [ ] Navbar header is 80px tall (h-20)
- [ ] Navbar uses `.glass-navbar` class (no manual bg/border)
- [ ] Active nav item shows blue→indigo gradient + shadow
- [ ] Collapsed sidebar shows icon-only + tooltip on hover
- [ ] Bottom collapse strip present (ChevronLeft / ChevronRight)
- [ ] Profile footer is `bg-slate-800/50`
- [ ] Avatar ring uses `ring-indigo-500/20`
- [ ] `gradient-active` and `gradient-logo` classes available in CSS
- [ ] Lint passes, TypeScript clean, build succeeds
