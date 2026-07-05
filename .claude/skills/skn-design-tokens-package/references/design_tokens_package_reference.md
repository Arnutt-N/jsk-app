# @skn/design-tokens Package — Reference

Source: `design-tokens/` (project root, untracked in git as of 2026-02-28)
Package: `@skn/design-tokens` v1.0.0

---

## Package.json Summary

```json
{
  "name": "@skn/design-tokens",
  "version": "1.0.0",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "style": "css/globals.css",
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "tailwindcss": "^3.0.0 || ^4.0.0"
  },
  "dependencies": {
    "lucide-react": "^0.468.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  }
}
```

Build scripts:
- `npm run build` — tsup CJS+ESM+dts (one-time)
- `npm run dev` — tsup watch mode
- `npm run lint` — eslint src
- `npm run test` — vitest

---

## Full Exports from src/index.ts

```ts
// Components
export { Sidebar, defaultSections }
export { SidebarItem }
export { SidebarProvider, useSidebar, SidebarContext, defaultSidebarConfig }
export { Navbar, defaultNavbarConfig }

// Hooks
export { useTheme }

// Utilities
export { cn }

// Types
export type {
  SidebarProps, SidebarNavSection, SidebarNavItem,
  SidebarConfig, SidebarStyle, SidebarSize, NavbarHeight,
  NavbarProps, NavbarConfig, NavbarStyle,
  UseThemeReturn, ThemeConfig, ThemePreset,
}
```

---

## SidebarNavItem Interface (with SubItems)

```ts
interface SidebarNavItem {
  icon: React.ReactNode        // RENDERED JSX — NOT ComponentType
  label: string                // Display text
  id: string                   // Unique identifier for active state matching
  count?: number               // Notification badge count
  hasSubMenu?: boolean         // Show chevron icon
  isExpanded?: boolean         // Sub-menu open state
  subItems?: SidebarNavItem[]  // Nested items
}
```

Sub-menu expansion example:
```tsx
{
  icon: <Package size={22} />,
  label: 'Inventory',
  id: 'inventory',
  hasSubMenu: true,
  isExpanded: isInventoryExpanded,
  subItems: [
    { icon: <Box size={18} />, label: 'All Items', id: 'inventory-all' },
    { icon: <Box size={18} />, label: 'Consumables', id: 'inventory-consumable' },
  ],
}
```

Note: Sub-menu expansion state (`isExpanded`) must be managed by the parent component.
The `Sidebar` component accepts `isInventoryExpanded` + `onInventoryToggle` props for this purpose.

---

## SidebarProvider API

```tsx
<SidebarProvider
  config={{                          // Partial<SidebarConfig>
    style: 'gradient',               // 'solid' | 'gradient'
    size: 'wide',                    // 'compact' | 'wide'
    navbarHeight: 'tall',            // 'compact' | 'tall'
    showSectionLabels: true,
    showBadges: true,
  }}
  defaultCollapsed={false}           // initial collapse state
>
  {children}
</SidebarProvider>
```

`useSidebar()` returns: `{ config, isCollapsed, toggleSidebar, setConfig }`

---

## NavbarConfig Defaults

```ts
const defaultNavbarConfig: NavbarConfig = {
  height: 'compact',       // 64px
  style: 'glass',          // backdrop-blur
  showSearch: false,
  showNotifications: true,
  notificationCount: 0,
}
```

Navbar `rightContent?: React.ReactNode` — slot for custom content on the right side.

---

## Theme Preset Configuration Details

```ts
presets = {
  'admin-chat': {
    sidebar: { style: 'solid', size: 'compact', navbarHeight: 'compact', ... },
    navbar:  { height: 'compact', style: 'solid' },
  },
  'hr-ims': {
    sidebar: { style: 'gradient', size: 'wide', navbarHeight: 'tall', ... },
    navbar:  { height: 'tall', style: 'glass' },
  },
  'hybrid': {
    sidebar: { style: 'gradient', size: 'compact', navbarHeight: 'compact', ... },
    navbar:  { height: 'compact', style: 'glass' },
  },
}
```

`applyPreset()` does a deep merge with `prev` state (preserves unset fields).

---

## useTheme Hook — Full API

```ts
const {
  theme,               // ThemeConfig (current)
  setSidebarStyle,     // (style: 'solid' | 'gradient') => void
  setSidebarSize,      // (size: 'compact' | 'wide') => void
  setNavbarHeight,     // (height: 'compact' | 'tall') => void
  setNavbarStyle,      // (style: 'glass' | 'solid') => void
  toggleDarkMode,      // () => void — adds/removes 'dark' class on documentElement
  toggleAnimations,    // () => void — toggles theme.animations flag
  resetTheme,          // () => void — resets to defaultTheme + clears localStorage
  applyPreset,         // (preset: 'admin-chat' | 'hr-ims' | 'hybrid') => void
} = useTheme()
```

**localStorage key:** `'skn-design-tokens-theme'`
**Dark mode:** applies `document.documentElement.classList.add('dark')` on theme.darkMode=true
**SSR safe:** lazy init reads localStorage only on client (typeof window !== 'undefined' check)

---

## Complete Color Token Table

All values are HSL format: `H S% L%`

### Core Colors

| Token Name | HSL Value | Usage |
|---|---|---|
| primary | `217 91% 60%` | Primary brand blue (button, links) |
| primaryForeground | `0 0% 100%` | Text on primary |
| accent | `162 72% 45%` | Teal accent |
| destructive | `0 84% 60%` | Error / danger red |
| background | `220 20% 97%` | Page background (light gray) |
| foreground | `220 20% 10%` | Primary text |
| card | `0 0% 100%` | Card surfaces (white) |
| muted | `220 14% 94%` | Muted backgrounds |
| mutedForeground | `220 10% 46%` | Secondary/subtle text |
| border | `220 13% 90%` | Default border |
| ring | `217 91% 60%` | Focus ring |

### Sidebar Tokens

| Token Name | HSL Value | Usage |
|---|---|---|
| sidebar.background | `222 47% 11%` | Dark navy sidebar bg |
| sidebar.foreground | `213 31% 91%` | Sidebar text |
| sidebar.primary | `217 91% 60%` | Active item (solid style) |
| sidebar.accent | `215 28% 17%` | Hover/subtle sidebar bg |
| sidebar.muted | `215 20% 65%` | Inactive sidebar text |
| sidebar.border | `215 28% 17%` | Sidebar borders |

### Gradient Tokens (HR-IMS style)

| Token Name | HSL Value | Usage |
|---|---|---|
| gradient.active_from | `217 91% 60%` | Active nav gradient start (blue-600) |
| gradient.active_to | `225 93% 65%` | Active nav gradient end (indigo-600) |
| gradient.logo_from | `225 93% 65%` | Logo gradient start (indigo-500) |
| gradient.logo_to | `217 91% 60%` | Logo gradient end (blue-600) |

### Status Colors

| Token Name | HSL Value | Usage |
|---|---|---|
| status.online | `142 71% 45%` | Online/active (green) |
| status.away | `38 92% 50%` | Away/waiting (amber) |
| status.busy | `0 84% 60%` | Busy (red) |
| status.offline | `220 10% 46%` | Offline/closed (gray) |

### Chart Colors

| Token | HSL Value | Usage |
|---|---|---|
| chart-1 | `217 91% 60%` | Primary (blue) |
| chart-2 | `162 72% 45%` | Secondary (teal) |
| chart-3 | `38 92% 50%` | Tertiary (orange/amber) |
| chart-4 | `215 28% 17%` | Quaternary (dark) |
| chart-5 | `213 31% 91%` | Quinary (light) |

---

## Animation Keyframes Reference

| Class | Keyframes | Duration | Curve |
|---|---|---|---|
| `msg-in` | `translateX(-20px) opacity:0` → identity | 300ms | ease-out |
| `msg-out` | `translateX(20px) opacity:0` → identity | 300ms | ease-out |
| `fade-in` | `translateY(10px) opacity:0` → identity | 300ms | ease-out |
| `scale-in` | `scale(0.95) opacity:0` → identity | 200ms | ease-out |
| `toast-slide` | `translateX(100%) opacity:0` → identity | 400ms | ease-out |
| `blink-badge` | `opacity:1` → `opacity:0.4` → `opacity:1` | 1s | ease-in-out, infinite |
| `typing-dot` | `translateY(0)` → `translateY(-4px)` → `translateY(0)` | 1.4s | ease-in-out, infinite |
| `pulse-ring` | `scale(1) opacity:0.7` → `scale(1.5) opacity:0` | 1.5s | ease-out, infinite |
| `shimmer` | background-position sweep | 1.5s | linear, infinite |

**Typing dot delay pattern:**
```tsx
{[0, 1, 2].map((i) => (
  <div
    key={i}
    className="typing-dot h-2 w-2 rounded-full bg-gray-400"
    style={{ animationDelay: `${i * 0.2}s` }}
  />
))}
```

---

## Spacing Token Reference

| Token | Value | CSS var |
|---|---|---|
| sidebar compact collapsed | 68px | `--sidebar-width-collapsed` |
| sidebar compact expanded | 220px | `--sidebar-width-expanded` |
| sidebar wide collapsed (HR-IMS) | 80px | `--sidebar-width-collapsed-hr` |
| sidebar wide expanded (HR-IMS) | 288px | `--sidebar-width-expanded-hr` |
| navbar compact | 64px | `--navbar-height-compact` |
| navbar tall | 80px | `--navbar-height-tall` |
| border-radius default | 0.75rem | `rounded-lg` |
| border-radius xl | 0.75rem | `rounded-xl` |
| border-radius 2xl | 1rem | `rounded-2xl` |

---

## Differences vs Main Project

| Feature | Package (`@skn/design-tokens`) | Main Project (`frontend/`) |
|---|---|---|
| `SidebarItem.icon` type | `React.ReactNode` (rendered JSX) | `ComponentType` (unrendered) |
| `useTheme` localStorage key | `'skn-design-tokens-theme'` | `'theme'` (via `components/providers/ThemeProvider`; old `hooks/useTheme.ts`/`'jsk-admin-theme'` removed) |
| `useTheme` dark mode | applies `.dark` to `documentElement` | applies `.dark` class |
| Sidebar collapse trigger | `useSidebar().toggleSidebar()` | `isCollapsed` state in `layout.tsx` |
| Active item style | configured via `SidebarConfig.style` | hardcoded `.gradient-active` CSS class |
| Auth integration | none (pure layout) | `AuthContext` checks in `layout.tsx` |
| Sub-menu support | yes (via `subItems` + `hasSubMenu`) | no (flat nav only) |

---

## Known Gaps

| ID | Gap | Impact |
|---|---|---|
| GAP-1 | Package is untracked in git — will be lost if not committed | High if work is planned |
| GAP-2 | `dist/` not built — package cannot be installed without running `npm run build` first | High |
| GAP-3 | Package is NOT installed in `frontend/` — no integration yet | Medium |
| GAP-4 | `defaultSections` uses IMS.Pro branding ("Inventory System") — needs customization for SKN App | Medium |
| GAP-5 | No authentication / role-based visibility in Sidebar component | Low (consumer responsibility) |
| GAP-6 | Tailwind v4 compatibility not tested — peerDependencies allow v3 or v4 but CSS may need review | Medium |
