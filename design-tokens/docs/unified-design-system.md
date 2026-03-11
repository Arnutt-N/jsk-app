# SKN Unified Design System

> **Complete reference for the unified design token system combining Admin-Chat-System and HR-IMS**

---

## 📋 Overview

This design system unifies two distinct UI systems:

1. **Admin-Chat-System**: Token-based, solid color active states, compact layout
2. **HR-IMS**: Gradient active states, glass morphism, wider layout

The result is a **single, configurable system** that supports both styles and everything in between.

---

## 🎨 Style Comparison

### Admin-Chat-System Style

| Feature | Value | Preview |
|---------|-------|---------|
| **Sidebar Background** | `bg-sidebar` (HSL 222 47% 11%) | Dark navy solid |
| **Active Menu** | `bg-sidebar-primary` (solid blue) | Solid color |
| **Active Shadow** | `shadow-sidebar-primary/20` | Subtle blue glow |
| **Navbar Height** | `h-16` (64px) | Compact |
| **Navbar Style** | `bg-card/50 backdrop-blur-sm` | Light glass |
| **Sidebar Width** | 220px / 68px | Compact |
| **Border** | `border-border` (HSL 220 13% 90%) | Light gray |
| **Radius** | `rounded-lg` (0.75rem) | Standard |

### HR-IMS Style

| Feature | Value | Preview |
|---------|-------|---------|
| **Sidebar Background** | `bg-slate-900` | Dark navy solid |
| **Active Menu** | `bg-gradient-to-r from-blue-600 to-indigo-600` | Blue→Indigo gradient |
| **Active Shadow** | `shadow-blue-900/40` | Strong blue glow |
| **Navbar Height** | `h-20` (80px) | Tall |
| **Navbar Style** | `bg-white/80 backdrop-blur-md` | Prominent glass |
| **Sidebar Width** | 288px / 80px | Wide |
| **Border** | `border-white/10` | White 10% opacity |
| **Radius** | `rounded-xl` (0.75rem) | Extra large |

---

## 🎯 Configuration Options

### Sidebar Style

```tsx
style: 'solid' | 'gradient'
```

- **`solid`**: Admin-Chat-System style with solid blue active state
- **`gradient`**: HR-IMS style with blue-to-indigo gradient

### Sidebar Size

```tsx
size: 'compact' | 'wide'
```

- **`compact`**: 220px expanded / 68px collapsed (Admin-Chat)
- **`wide`**: 288px expanded / 80px collapsed (HR-IMS)

### Navbar Height

```tsx
navbarHeight: 'compact' | 'tall'
```

- **`compact`**: 64px height
- **`tall`**: 80px height

### Navbar Style

```tsx
style: 'glass' | 'solid'
```

- **`glass`**: Glass morphism effect with backdrop blur
- **`solid`**: Solid background color

---

## 🚀 Quick Start

### Using Presets

```tsx
import { useTheme } from '@skn/design-tokens'

function App() {
  const { applyPreset } = useTheme()

  return (
    <div>
      <button onClick={() => applyPreset('admin-chat')}>
        Admin Chat Style
      </button>
      <button onClick={() => applyPreset('hr-ims')}>
        HR-IMS Style
      </button>
      <button onClick={() => applyPreset('hybrid')}>
        Hybrid (Gradient + Compact)
      </button>
    </div>
  )
}
```

### Manual Configuration

```tsx
import { SidebarProvider } from '@skn/design-tokens'

function App({ children }) {
  return (
    <SidebarProvider
      config={{
        style: 'gradient',        // HR-IMS active state
        size: 'compact',          // Admin-Chat width
        navbarHeight: 'compact',  // Admin-Chat height
        showSectionLabels: true,
        showBadges: true,
      }}
    >
      {children}
    </SidebarProvider>
  )
}
```

---

## 📦 Package Structure

```
design-tokens/
├── components/
│   ├── Sidebar/
│   │   ├── Sidebar.tsx          # Main sidebar component
│   │   ├── SidebarItem.tsx      # Individual nav item
│   │   ├── SidebarContext.tsx   # Context & provider
│   │   └── index.ts
│   └── Navbar/
│       ├── Navbar.tsx           # Top navbar component
│       └── index.ts
├── hooks/
│   └── useTheme.ts              # Theme management hook
├── lib/
│   └── utils.ts                 # cn() utility
├── css/
│   └── globals.css              # All design tokens & animations
├── tokens/
│   └── colors.json              # Design token definitions
├── docs/
│   ├── integration-admin-chat.md
│   ├── integration-hr-ims.md
│   └── unified-design-system.md
├── src/
│   └── index.ts                 # Main entry point
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 🎨 Design Tokens

### Core Color Tokens

```css
:root {
  /* Primary Brand */
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
  
  /* Accent */
  --accent: 162 72% 45%;
  --accent-foreground: 0 0% 100%;
  
  /* Destructive */
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  
  /* Backgrounds */
  --background: 220 20% 97%;
  --foreground: 220 20% 10%;
  --card: 0 0% 100%;
  --card-foreground: 220 20% 10%;
  --muted: 220 14% 94%;
  --muted-foreground: 220 10% 46%;
  
  /* Borders */
  --border: 220 13% 90%;
  --input: 220 13% 90%;
  --ring: 217 91% 60%;
}
```

### Sidebar Tokens (Solid Style)

```css
:root {
  --sidebar-background: 222 47% 11%;
  --sidebar-foreground: 213 31% 91%;
  --sidebar-primary: 217 91% 60%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 215 28% 17%;
  --sidebar-muted: 215 20% 65%;
  --sidebar-border: 215 28% 17%;
}
```

### Gradient Tokens (HR-IMS)

```css
:root {
  --gradient-active-from: 217 91% 60%;    /* blue-600 */
  --gradient-active-to: 225 93% 65%;      /* indigo-600 */
  --gradient-logo-from: 225 93% 65%;      /* indigo-500 */
  --gradient-logo-to: 217 91% 60%;        /* blue-600 */
}
```

### Status Tokens

```css
:root {
  --online: 142 71% 45%;   /* Green */
  --away: 38 92% 50%;      /* Amber */
  --busy: 0 84% 60%;       /* Red */
  --offline: 220 10% 46%;  /* Gray */
}
```

---

## ✨ Animations

All animations are defined in `globals.css` and available as utility classes:

### Message Animations

```css
.msg-in {
  animation: msg-in 0.3s ease-out;
  /* Slides from left */
}

.msg-out {
  animation: msg-out 0.3s ease-out;
  /* Slides from right */
}
```

### Content Animations

```css
.fade-in {
  animation: fade-in 0.3s ease-out;
  /* Fades in with upward motion */
}

.scale-in {
  animation: scale-in 0.2s ease-out;
  /* Scales from 0.95 to 1 */
}
```

### Notification Animations

```css
.toast-slide {
  animation: toast-slide 0.4s ease-out;
  /* Slides in from right */
}

.blink-badge {
  animation: blink-badge 1s infinite;
  /* Opacity pulse */
}
```

### Loading Animations

```css
.typing-dot {
  animation: typing-dot 1.4s infinite;
  /* Bouncing dots */
}

.shimmer {
  animation: shimmer 1.5s infinite;
  /* Gradient sweep */
}

.pulse-ring {
  animation: pulse-ring 1.5s infinite;
  /* Expanding ring */
}
```

---

## 🧩 Components API

### Sidebar

**Main navigation sidebar with collapsible functionality.**

```tsx
import { Sidebar } from '@skn/design-tokens'

<Sidebar
  activeTab={activeTab}
  onTabChange={setActiveTab}
  sections={customSections}
  user={{ name, role, avatar }}
  onLogout={handleLogout}
  isInventoryExpanded={isExpanded}
  onInventoryToggle={toggleExpansion}
/>
```

### Navbar

**Top navigation bar with search and notifications.**

```tsx
import { Navbar } from '@skn/design-tokens'

<Navbar
  title="Dashboard"
  onToggleSidebar={toggleSidebar}
  searchQuery={search}
  onSearchChange={setSearch}
  onSearchSubmit={handleSubmit}
  config={{
    height: 'tall',
    style: 'glass',
    showSearch: true,
    showNotifications: true,
    notificationCount: 5,
  }}
  rightContent={
    <div>{/* Custom buttons */}</div>
  }
/>
```

---

## 🔧 Hooks

### useTheme

**Manage theme configuration globally.**

```tsx
import { useTheme } from '@skn/design-tokens'

function ThemeSwitcher() {
  const {
    theme,
    setSidebarStyle,
    setSidebarSize,
    setNavbarHeight,
    setNavbarStyle,
    toggleDarkMode,
    toggleAnimations,
    resetTheme,
    applyPreset,
  } = useTheme()

  return (
    <div>
      <button onClick={() => applyPreset('hr-ims')}>
        Apply HR-IMS Theme
      </button>
      <button onClick={() => setSidebarStyle('gradient')}>
        Use Gradient
      </button>
      <button onClick={() => toggleDarkMode}>
        Toggle Dark Mode
      </button>
    </div>
  )
}
```

### useSidebar

**Access sidebar state within SidebarProvider.**

```tsx
import { useSidebar } from '@skn/design-tokens'

function MyComponent() {
  const { config, isCollapsed, toggleSidebar, setConfig } = useSidebar()

  return (
    <div>
      <p>Sidebar: {isCollapsed ? 'collapsed' : 'expanded'}</p>
      <p>Style: {config.style}</p>
      <button onClick={toggleSidebar}>Toggle</button>
    </div>
  )
}
```

---

## 📊 Feature Matrix

| Feature | Admin-Chat | HR-IMS | Unified |
|---------|------------|--------|---------|
| **Sidebar Style** | Solid | Gradient | ✅ Both |
| **Sidebar Size** | Compact (220px) | Wide (288px) | ✅ Both |
| **Navbar Height** | Compact (64px) | Tall (80px) | ✅ Both |
| **Navbar Style** | Solid | Glass | ✅ Both |
| **Color Tokens** | HSL variables | Hardcoded | ✅ Unified |
| **Animations** | CSS keyframes | CSS keyframes | ✅ Unified |
| **TypeScript** | ✅ Yes | ❌ No | ✅ Yes |
| **Responsive** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Dark Mode** | ❌ No | ❌ No | ✅ Yes |
| **Theme Presets** | ❌ No | ❌ No | ✅ Yes |
| **Configurable** | ❌ No | ❌ No | ✅ Yes |

---

## 🎯 Migration Path

### Phase 1: Install & Setup

```bash
npm install @skn/design-tokens
```

### Phase 2: Replace Components

1. Replace `AdminSidebar` → `Sidebar`
2. Replace custom navbar → `Navbar`
3. Wrap with `SidebarProvider`

### Phase 3: Configure Style

```tsx
<SidebarProvider config={{ style: 'solid' }}>
  {/* Admin-Chat style */}
</SidebarProvider>

// OR

<SidebarProvider config={{ style: 'gradient' }}>
  {/* HR-IMS style */}
</SidebarProvider>
```

### Phase 4: Test & Iterate

- Test all navigation items
- Verify responsive behavior
- Check animations
- Test theme switching

---

## 📚 Documentation

- [README.md](./README.md) - Package overview and quick start
- [Integration: Admin-Chat](./docs/integration-admin-chat.md) - Step-by-step guide
- [Integration: HR-IMS](./docs/integration-hr-ims.md) - Step-by-step guide
- [Design Tokens](./tokens/colors.json) - Full token definitions

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both projects
5. Submit a pull request

---

## 📝 License

MIT © SKN Team

---

## 📞 Support

- GitHub Issues: [Report a bug](https://github.com/skn-org/design-tokens/issues)
- Documentation: [Full docs](https://github.com/skn-org/design-tokens)
