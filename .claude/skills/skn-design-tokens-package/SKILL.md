---
name: skn-design-tokens-package
description: >
  Documents the @skn/design-tokens standalone NPM package located at design-tokens/
  in the project root — a reusable design system for sharing across SKN applications
  (skn-app, hr-ims, future projects).
  Use when asked to "use @skn/design-tokens", "integrate the design tokens package",
  "build the design tokens package", "use SidebarProvider", "use useSidebar hook from package",
  "apply admin-chat theme preset", "apply hr-ims theme preset", "apply hybrid theme preset",
  "use the package's useTheme", "publish design tokens", "install design tokens package",
  "list CSS animation classes", "what animations are available", "shimmer animation",
  "typing-dot animation", "pulse-ring animation", "blink-badge animation",
  "use SidebarProvider context", "share design system across projects",
  "ใช้ @skn/design-tokens", "integrate design token ข้ามโปรเจกต์", "build package design",
  "animation class มีอะไรบ้าง", "ใช้ preset theme".
  Do NOT use for: modifying the main project's globals.css tokens, changing the admin layout.tsx,
  or modifying existing frontend/components/ui components.
license: MIT
compatibility: >
  Standalone NPM package (design-tokens/ directory).
  Requires: React 18+ or 19+, Tailwind CSS 3+ or 4+, tsup for build.
  NOT yet integrated into frontend/ — must build and install separately.
metadata:
  author: SKN App Team
  version: 1.0.0
  project: skn-app
  category: frontend
  tags: [design-tokens, npm-package, sidebar, navbar, theme, animations, cross-project]
  related-skills:
    - skn-design-system
    - skn-ui-library
    - skn-app-shell
  documentation: ./references/design_tokens_package_reference.md
---

# skn-design-tokens-package

Standalone NPM package (`@skn/design-tokens`) that exports shared layout components,
design tokens, and CSS animation classes for use across SKN applications.

**Package location:** `design-tokens/` (project root — NOT inside `frontend/`)
**Status:** Untracked in git — NOT yet installed in frontend/. Build required before use.

---

## CRITICAL: Project-Specific Rules

1. **Package is at `design-tokens/` NOT in `frontend/`** —
   The package source lives in `D:\genAI\jsk-app\design-tokens\` (project root).
   The main frontend at `frontend/` does NOT import from this package yet.
   Build output goes to `design-tokens/dist/`.

2. **`SidebarItem.icon` is `React.ReactNode` here — NOT `ComponentType`** —
   This is different from the main project's `components/admin/SidebarItem.tsx`:
   ```tsx
   // Package (@skn/design-tokens) — pass rendered JSX:
   <SidebarItem icon={<LayoutDashboard size={22} />} label="Dashboard" />

   // Main project (components/admin/SidebarItem.tsx) — pass component type:
   <SidebarItem icon={LayoutDashboard} label="Dashboard" />
   ```

3. **`useTheme` localStorage key is `'skn-design-tokens-theme'` — NOT `'jsk-admin-theme'`** —
   The main project's `useTheme` hook uses key `'jsk-admin-theme'`.
   This package's `useTheme` uses key `'skn-design-tokens-theme'`.
   They are completely separate — importing from different files.

4. **Build required before use** —
   The `dist/` directory is gitignored. Must run:
   ```bash
   cd design-tokens
   npm install
   npm run build  # outputs dist/index.js, dist/index.mjs, dist/index.d.ts
   ```
   Then install into target project via local path or npm registry.

5. **SidebarProvider must wrap both Sidebar and Navbar** —
   `useSidebar()` throws if used outside `<SidebarProvider>`.
   The provider manages `isCollapsed` + `config` state.

6. **Sidebar auto-collapses below `lg` breakpoint (1024px)** —
   Uses CSS `fixed lg:static` — sidebar is absolutely positioned on mobile.
   On desktop (lg+) it becomes part of the normal flow.

7. **CSS animation classes are defined in `design-tokens/css/globals.css`** —
   When the package is installed, import: `import '@skn/design-tokens/css/globals.css'`
   If NOT using the package, these same classes exist in `frontend/app/globals.css`.

8. **No authentication or business logic in package components** —
   `Sidebar` and `Navbar` are pure layout/UI components.
   Authentication, route guards, and menu item permissions must be handled by the consumer app.

---

## Package Overview

```
design-tokens/
├── src/index.ts          ← Main exports
├── components/
│   ├── Sidebar/
│   │   ├── Sidebar.tsx       ← Main sidebar component
│   │   ├── SidebarItem.tsx   ← Individual nav item (used by Sidebar)
│   │   ├── SidebarContext.tsx ← Provider + useSidebar hook
│   │   └── index.ts
│   └── Navbar/
│       ├── Navbar.tsx
│       └── index.ts
├── hooks/
│   └── useTheme.ts       ← Theme config + preset switching
├── tokens/
│   └── colors.json       ← Tokens Studio format (HSL values)
├── css/
│   └── globals.css       ← All CSS custom properties + animation classes
├── lib/utils.ts          ← cn() utility (clsx + tailwind-merge)
├── tsup.config.ts        ← Build config (CJS + ESM + .d.ts)
└── package.json          ← name: "@skn/design-tokens", version: "1.0.0"
```

**Exports from `src/index.ts`:**
- `Sidebar`, `defaultSections` (type: `SidebarNavSection[]`)
- `SidebarItem`
- `SidebarProvider`, `useSidebar`, `SidebarContext`, `defaultSidebarConfig`
- Types: `SidebarProps`, `SidebarNavSection`, `SidebarNavItem`, `SidebarConfig`, `SidebarStyle`, `SidebarSize`, `NavbarHeight`
- `Navbar`, `defaultNavbarConfig`
- Types: `NavbarProps`, `NavbarConfig`, `NavbarStyle`
- `useTheme` + types: `UseThemeReturn`, `ThemeConfig`, `ThemePreset`
- `cn` (utility)

---

## Step 1 — Build the Package

```bash
# From project root:
cd design-tokens
npm install    # installs tsup, vitest, etc.
npm run build  # outputs to dist/

# Or watch mode during development:
npm run dev
```

Build outputs (via tsup):
- `dist/index.js` — CommonJS
- `dist/index.mjs` — ESM
- `dist/index.d.ts` — TypeScript declarations

---

## Step 2 — Install Into Target Project

**Option A: Local path (development):**
```bash
cd frontend
npm install ../design-tokens  # installs from local directory
```

**Option B: Published npm package:**
```bash
npm install @skn/design-tokens
```

**Option C: npm link (symlink):**
```bash
cd design-tokens && npm link
cd frontend && npm link @skn/design-tokens
```

---

## Step 3 — Integration (Next.js App Router)

```tsx
// frontend/app/layout.tsx
import '@skn/design-tokens/css/globals.css'  // import CSS tokens + animations
import { SidebarProvider } from '@skn/design-tokens'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <SidebarProvider config={{ style: 'gradient', size: 'wide', navbarHeight: 'tall' }}>
          {children}
        </SidebarProvider>
      </body>
    </html>
  )
}
```

**Apply theme preset instead of manual config:**
```tsx
// In a client component:
import { useTheme } from '@skn/design-tokens'

function ThemeSetup() {
  const { applyPreset } = useTheme()

  // Apply preset on mount:
  useEffect(() => {
    applyPreset('hr-ims')  // or 'admin-chat' or 'hybrid'
  }, [])
  // ...
}
```

---

## Step 4 — Use Sidebar and Navbar

```tsx
'use client'
import { Sidebar, Navbar, useSidebar } from '@skn/design-tokens'
import { useState } from 'react'

// Define navigation sections:
const navSections = [
  {
    title: 'หลัก',
    items: [
      { icon: <LayoutDashboard size={22} />, label: 'หน้าหลัก', id: 'home' },
      { icon: <MessageSquare size={22} />, label: 'Live Chat', id: 'live-chat', count: 3 },
    ],
  },
  {
    title: 'การจัดการ',
    items: [
      { icon: <FileText size={22} />, label: 'คำร้อง', id: 'requests', count: 5 },
      { icon: <Settings size={22} />, label: 'ตั้งค่า', id: 'settings' },
    ],
  },
]

function Layout() {
  const { toggleSidebar } = useSidebar()  // must be inside SidebarProvider
  const [activeTab, setActiveTab] = useState('home')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sections={navSections}
        user={{
          name: 'ผู้ดูแลระบบ',
          role: 'admin',
          avatar: '/avatar.jpg',
        }}
        onLogout={() => console.log('logout')}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Navbar
          title="หน้าหลัก"
          onToggleSidebar={toggleSidebar}
          config={{
            height: 'tall',         // 'compact' | 'tall'
            style: 'glass',         // 'glass' | 'solid'
            showSearch: true,
            showNotifications: true,
            notificationCount: 3,
          }}
        />
        <div className="flex-1 overflow-y-auto p-6">
          {/* content */}
        </div>
      </main>
    </div>
  )
}
```

---

## Step 5 — Theme Presets

| Preset | Sidebar Style | Sidebar Size | Navbar Height | Use Case |
|--------|---|---|---|---|
| `admin-chat` | solid (dark navy) | compact (220px) | compact (64px) | Admin-Chat-System style |
| `hr-ims` | gradient (slate→indigo) | wide (288px) | tall (80px) | HR-IMS style |
| `hybrid` | gradient | compact (220px) | compact (64px) | Modern look |

```tsx
import { useTheme } from '@skn/design-tokens'

const { applyPreset, setSidebarStyle, setSidebarSize, setNavbarHeight } = useTheme()

// Apply full preset:
applyPreset('hr-ims')

// Or configure individually:
setSidebarStyle('gradient')   // 'solid' | 'gradient'
setSidebarSize('wide')        // 'compact' | 'wide'
setNavbarHeight('tall')       // 'compact' | 'tall'
```

**localStorage key:** `'skn-design-tokens-theme'` (persists theme choice across page loads)

---

## CSS Animation Classes

These classes are defined in `css/globals.css` (and also in main project's `globals.css`):

| Class | Duration | Loop | Effect |
|-------|---|---|---|
| `msg-in` | 300ms | once | Message slide in from left (incoming bubble) |
| `msg-out` | 300ms | once | Message slide in from right (outgoing bubble) |
| `fade-in` | 300ms | once | Content fade with upward motion |
| `scale-in` | 200ms | once | Popup scale from 0.95 to 1.0 |
| `toast-slide` | 400ms | once | Toast notification slide from right |
| `blink-badge` | 1s | infinite | Badge opacity pulse |
| `typing-dot` | 1.4s | infinite | Bouncing typing indicator dot |
| `pulse-ring` | 1.5s | infinite | Expanding ring (video call) |
| `shimmer` | 1.5s | infinite | Loading skeleton sweep |

**Usage:**
```tsx
<div className="msg-in">Incoming message</div>
<div className="msg-out">Outgoing message</div>
<div className="fade-in">Content with entrance</div>
<div className="scale-in">Dropdown / popup</div>
<div className="toast-slide">Toast notification</div>
<span className="blink-badge">3</span>
<div className="typing-dot" style="--i: 0" />  {/* with delay */}
<div className="shimmer" />   {/* loading skeleton */}
```

**Animation durations:**
- micro: 200ms (scale-in, button feedback)
- fast: 300ms (fade-in, msg-in/out)
- normal: 400ms (toast-slide)
- slow: 1.5s (typing-dot, shimmer, pulse-ring)

---

## SidebarConfig Type Reference

```ts
interface SidebarConfig {
  style: 'solid' | 'gradient'     // 'solid' = dark navy bg; 'gradient' = slate→indigo gradient
  size: 'compact' | 'wide'        // compact: collapsed 68px, expanded 220px; wide: 80px, 288px
  navbarHeight: 'compact' | 'tall' // compact: 64px (h-16); tall: 80px (h-20)
  showSectionLabels: boolean       // show "Main", "Management" etc. labels above items
  showBadges: boolean              // show notification count badges on items
}

// Default config (admin-chat style):
const defaultSidebarConfig = {
  style: 'solid',
  size: 'compact',
  navbarHeight: 'compact',
  showSectionLabels: true,
  showBadges: true,
}
```

**Sidebar widths:**
- `compact` collapsed: 68px | expanded: 220px
- `wide` (HR-IMS) collapsed: 80px | expanded: 288px

---

## NavbarConfig Type Reference

```ts
interface NavbarConfig {
  height: 'compact' | 'tall'   // compact: 64px; tall: 80px
  style: 'glass' | 'solid'     // glass: backdrop-blur; solid: flat bg
  showSearch?: boolean          // show search input (default: false)
  showNotifications?: boolean   // show bell icon (default: true)
  notificationCount?: number    // badge count
}
```

---

## useSidebar Hook

```tsx
const { config, isCollapsed, toggleSidebar, setConfig } = useSidebar()

// config: SidebarConfig (current settings)
// isCollapsed: boolean (current collapse state)
// toggleSidebar(): void (toggle expand/collapse)
// setConfig(partial: Partial<SidebarConfig>): void (update config)

// Example: programmatic collapse
const handleResize = () => {
  if (window.innerWidth < 1024) {
    setConfig({ size: 'compact' })
  }
}
```

**Error if used outside provider:**
```
"useSidebar must be used within a SidebarProvider"
```

---

## Color Token Reference (HSL Values)

```css
/* Gradient active item (both preset styles): */
--gradient-active-from: 217 91% 60%;   /* blue-600 */
--gradient-active-to:   225 93% 65%;   /* indigo-600 */
--gradient-logo-from:   225 93% 65%;   /* indigo-500 */
--gradient-logo-to:     217 91% 60%;   /* blue-600 */

/* Sidebar (solid style): */
--sidebar-background: 222 47% 11%;     /* dark navy */
--sidebar-primary:    217 91% 60%;     /* active item (solid) */

/* Status presence: */
--online:  142 71% 45%;   /* green */
--away:    38  92% 50%;   /* amber */
--busy:    0   84% 60%;   /* red */
--offline: 220 10% 46%;   /* gray */

/* Chart colors: */
--chart-1: 217 91% 60%;   /* blue */
--chart-2: 162 72% 45%;   /* teal */
--chart-3: 38  92% 50%;   /* orange */
```

---

## Common Issues

### Package not building — "tsup: command not found"
**Cause:** `npm install` not run in `design-tokens/` directory.
**Fix:** `cd design-tokens && npm install && npm run build`

### `useSidebar` throws "must be used within SidebarProvider"
**Cause:** Calling `useSidebar()` in a component that's not inside `<SidebarProvider>`.
**Fix:** Wrap the entire layout (or at least the component tree) with `<SidebarProvider>`.

### Sidebar icon type error — "Property 'icon' does not match"
**Cause:** Passing `ComponentType` (e.g., `LayoutDashboard`) instead of `React.ReactNode`.
**Fix:** Render the icon: `icon={<LayoutDashboard size={22} />}` (not `icon={LayoutDashboard}`)

### Theme not persisting
**Cause:** `useTheme` reads from localStorage key `'skn-design-tokens-theme'`.
If localStorage is cleared or blocked, defaults are used.
**Fix:** This is expected behavior — the hook falls back to `defaultTheme` silently.

### CSS animations not working
**Cause:** Package CSS not imported.
**Fix:** Add `import '@skn/design-tokens/css/globals.css'` to app entry point.
Alternative: The same animation classes exist in `frontend/app/globals.css` if using the main project.

---

## Additional Resources

See `references/design_tokens_package_reference.md` for:
- Complete color token table (all HSL values)
- Full animation keyframe details
- SidebarNavItem interface (with subItems support)
- Navbar config defaults
- Known gaps and limitations
