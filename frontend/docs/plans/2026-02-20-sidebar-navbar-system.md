# Sidebar + Navbar Design System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the skn-app admin sidebar and navbar with the HR-IMS + admin-chat-system reference design — h-20 heights, glass navbar, `gradient-active`/`gradient-logo` utilities, extracted `SidebarItem` component, and bottom collapse toggle.

**Architecture:** Three-tier fix matching the reference pattern: (1) tokens in `globals.css`, (2) new reusable `SidebarItem.tsx` component, (3) `admin/layout.tsx` consumes both. The sidebar gradient stays blue→indigo (decorative); brand purple tokens handle all content-layer interactive elements.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (CSS-first `@theme`), TypeScript, Lucide icons

---

## Task 1: Add Gradient + Sidebar Tokens to globals.css

**Files:**
- Modify: `app/globals.css` (lines 101–109 and 462–463)

**What to change:**

### Step 1: Add gradient CSS variables after existing sidebar tokens (~line 109)

Find this block in `:root` (lines 101–109):
```css
  /* Live Chat Sidebar (dark slate from example) */
  --color-sidebar-bg: hsl(222 47% 11%);
  --color-sidebar-fg: hsl(210 20% 98%);
  --color-sidebar-muted: hsl(215 14% 34%);
  --color-sidebar-accent: hsl(217 33% 17%);
  --color-sidebar-border: hsl(215 28% 17%);
  --color-sidebar-primary: hsl(217 91% 60%);
  --color-sidebar-primary-fg: hsl(0 0% 100%);
  --sidebar-primary-fg: hsl(0 0% 100%);
```

Add after `--sidebar-primary-fg` (after line 109):
```css
  /* Sidebar gradient active state (HR-IMS reference) */
  --gradient-active-from: 217 91% 60%;   /* blue-600 */
  --gradient-active-to: 225 93% 65%;     /* indigo-600 */
```

### Step 2: Add gradient utility classes after `.dark .glass-navbar` block (~line 463)

Find this section (lines 459–462):
```css
  .dark .glass-navbar {
    background: hsl(217 33% 17% / 0.8);
    border-bottom: 1px solid hsl(215 28% 17% / 0.8);
  }
```

Add immediately after it:
```css

  /* HR-IMS gradient active nav item */
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

### Step 3: Run lint
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```
Expected: No errors (CSS changes don't affect ESLint)

### Step 4: Commit
```bash
cd /d/genAI/skn-app/frontend && git add app/globals.css && git commit -m "fix(ui): add gradient-active/gradient-logo utilities and sidebar gradient tokens"
```

---

## Task 2: Create SidebarItem.tsx Component

**Files:**
- Create: `components/admin/SidebarItem.tsx`

**What to build:**

A single reusable nav link component matching HR-IMS `SidebarItem.jsx` and `admin-chat-system/components/admin-sidebar.tsx`.

### Step 1: Check components/admin/ directory exists
```bash
ls /d/genAI/skn-app/frontend/components/admin/ | head -5
```
If directory doesn't exist: `mkdir -p /d/genAI/skn-app/frontend/components/admin/`

### Step 2: Create the file

`components/admin/SidebarItem.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  isActive: boolean;
  isCollapsed: boolean;
  badge?: number;
  isSubItem?: boolean;
  hasSubMenu?: boolean;
  isExpanded?: boolean;
  target?: string;
}

export function SidebarItem({
  icon: Icon,
  label,
  href,
  isActive,
  isCollapsed,
  badge,
  isSubItem = false,
  hasSubMenu = false,
  isExpanded = false,
  target,
}: SidebarItemProps) {
  const link = (
    <Link
      href={href}
      target={target}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center w-full rounded-xl p-3.5',
        'transition-all duration-300 my-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
        isActive
          ? 'gradient-active text-white shadow-lg shadow-blue-900/40'
          : 'text-slate-400 hover:bg-white/5 hover:text-white',
        isSubItem && 'pl-11'
      )}
    >
      {/* Icon */}
      <Icon
        className={cn(
          'flex-shrink-0 transition-colors',
          isSubItem ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]',
          isCollapsed && 'mx-auto',
          isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-300'
        )}
        aria-hidden="true"
      />

      {/* Label + chevron (hidden when collapsed) */}
      {!isCollapsed && (
        <div className="flex flex-1 items-center justify-between ml-4 overflow-hidden">
          <span
            className={cn(
              'font-medium tracking-wide whitespace-nowrap text-sm',
              isSubItem && 'font-normal text-slate-300'
            )}
          >
            {label}
          </span>
          {hasSubMenu && (
            <ChevronRight
              className={cn(
                'h-4 w-4 text-slate-400 transition-transform duration-300',
                isExpanded && 'rotate-90'
              )}
            />
          )}
        </div>
      )}

      {/* Badge */}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            'absolute bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5',
            'rounded-md shadow-md border border-rose-400 min-w-[1.25rem] text-center',
            isCollapsed ? 'top-1 right-1' : 'right-2 top-1/2 -translate-y-1/2'
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );

  // When collapsed, wrap in tooltip so label is still discoverable
  if (isCollapsed) {
    return (
      <Tooltip content={label} side="right">
        {link}
      </Tooltip>
    );
  }

  return link;
}

export default SidebarItem;
```

### Step 3: Run lint
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -5
```
Expected: No errors

### Step 4: Run TypeScript check
```bash
cd /d/genAI/skn-app/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors

### Step 5: Commit
```bash
cd /d/genAI/skn-app/frontend && git add components/admin/SidebarItem.tsx && git commit -m "feat(ui): add SidebarItem component — HR-IMS nav item pattern"
```

---

## Task 3: Refactor admin/layout.tsx

**Files:**
- Modify: `app/admin/layout.tsx`

This task applies 7 changes. Read the current file first, then apply each change in order.

### Step 1: Add SidebarItem import

Find the existing imports block at the top. After `import { Avatar } from '@/components/ui/Avatar';`, add:
```tsx
import SidebarItem from '@/components/admin/SidebarItem';
```

### Step 2: Fix logo area height — h-16 → h-20

Find (line 166):
```tsx
            <div className="relative z-10 h-16 flex items-center justify-center px-4 border-b border-white/10">
```
Change to:
```tsx
            <div className="relative z-10 h-20 flex items-center justify-center px-4 border-b border-white/10">
```

### Step 3: Remove collapse button from logo area; keep logo link clean

The logo area currently has two states: collapsed (button with "JS") and expanded (logo link + ChevronLeft button). Replace the entire logo area content with a simpler version — collapse is now handled by the bottom strip (Step 6):

```tsx
            {/* Sidebar Logo */}
            <div className="relative z-10 h-20 flex items-center justify-center px-4 border-b border-white/10">
              {isSidebarCollapsed ? (
                <div className="w-10 h-10 rounded-2xl gradient-logo flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10">
                  JS
                </div>
              ) : (
                <Link href="/admin" className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-2xl gradient-logo flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10 flex-shrink-0">
                    JS
                  </div>
                  <div className="flex-1">
                    <h1 className="text-white font-bold text-xl bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-wide leading-tight">
                      JSK
                    </h1>
                    <p className="text-[10px] text-slate-500 tracking-widest uppercase">Admin</p>
                  </div>
                </Link>
              )}
            </div>
```

### Step 4: Replace inline nav link with SidebarItem component

Find the `{group.items.map((item) => {` block (lines 207–248). Replace the entire inner content:

```tsx
                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = activeItem ? item.href === activeItem.href : pathname === item.href;
                      return (
                        <li key={item.name}>
                          <SidebarItem
                            icon={item.icon}
                            label={item.name}
                            href={item.href}
                            isActive={isActive}
                            isCollapsed={isSidebarCollapsed}
                            target={item.openInNewTab ? '_blank' : undefined}
                          />
                        </li>
                      );
                    })}
                  </ul>
```

This removes the `navLink` variable, the manual `Tooltip` wrapper, and the `<div className="w-full">` wrapper — all now handled inside `SidebarItem`.

### Step 5: Fix profile footer background

Find (line 254):
```tsx
            <div className="relative z-10 p-3 border-t border-white/10 bg-black/10 backdrop-blur-sm">
```
Change to:
```tsx
            <div className="relative z-10 p-3 border-t border-white/10 bg-slate-800/50">
```

### Step 6: Add bottom collapse toggle strip

After the closing `</div>` of the profile footer (after line 267, before `</aside>`), add:
```tsx
            {/* Bottom collapse toggle — HR-IMS style */}
            <button
              onClick={toggleSidebar}
              className="relative z-10 flex h-10 w-full items-center justify-center border-t border-white/10 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed
                ? <ChevronRight className="h-4 w-4" />
                : <ChevronLeft className="h-4 w-4" />}
            </button>
```

### Step 7: Fix navbar header — h-16 → h-20, use glass-navbar class

Find the `<header>` block (lines 276–282):
```tsx
            <header className={cn(
              'sticky top-0 z-40 h-16',
              'flex items-center justify-between',
              'bg-white/80 dark:bg-gray-800/80 backdrop-blur-md',
              'border-b border-slate-200/60 dark:border-gray-700/60',
              'px-6 md:px-8'
            )}>
```
Replace with:
```tsx
            <header className={cn(
              'sticky top-0 z-40 h-20',
              'flex items-center justify-between',
              'glass-navbar',
              'px-6 md:px-8'
            )}>
```

### Step 8: Fix header search text tokens (line 297)

Find:
```tsx
                    className="bg-transparent text-sm text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none w-full"
```
Replace:
```tsx
                    className="bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none w-full"
```

### Step 9: Fix avatar ring (line ~322)

Find:
```tsx
                  className="ring-2 ring-blue-500/40 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
```
Replace:
```tsx
                  className="ring-2 ring-indigo-500/20 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
```

### Step 10: Run lint
```bash
cd /d/genAI/skn-app/frontend && npm run lint -- --max-warnings=0 2>&1 | tail -10
```
Expected: No errors. If there are unused import errors (e.g. `Tooltip` was only used in the inline nav block), remove those imports.

### Step 11: Run TypeScript check
```bash
cd /d/genAI/skn-app/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors

### Step 12: Commit
```bash
cd /d/genAI/skn-app/frontend && git add app/admin/layout.tsx && git commit -m "fix(ui): align sidebar+navbar with HR-IMS reference — h-20, glass-navbar, SidebarItem, bottom toggle"
```

---

## Task 4: Final Verification

**Files:** none (read-only verification)

### Step 1: Full lint
```bash
cd /d/genAI/skn-app/frontend && npm run lint 2>&1 | tail -5
```
Expected: No errors, no warnings

### Step 2: TypeScript
```bash
cd /d/genAI/skn-app/frontend && npx tsc --noEmit 2>&1 | head -10
```
Expected: No output (zero errors)

### Step 3: Build
```bash
cd /d/genAI/skn-app/frontend && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

### Step 4: Visual checklist
- [ ] Sidebar logo area is 80px tall
- [ ] Navbar header is 80px tall
- [ ] Navbar uses glass effect (white/80 with blur) — NOT solid gray
- [ ] Dark mode: navbar uses `hsl(217 33% 17% / 0.8)` (token), not `bg-gray-800`
- [ ] Active nav item shows blue→indigo gradient + deep shadow
- [ ] Collapsed sidebar: icon only, tooltip on hover, no label
- [ ] Bottom collapse strip: full-width, ChevronLeft/Right toggles correctly
- [ ] Profile footer is `bg-slate-800/50` (no longer semi-transparent with blur)
- [ ] Logo icon uses `gradient-logo` (indigo→blue gradient, not solid blue-600)
- [ ] Avatar ring is lighter (`ring-indigo-500/20`)
- [ ] Header search text uses semantic tokens (no hardcoded slate colors)
