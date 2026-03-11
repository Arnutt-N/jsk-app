# @skn/design-tokens

> **Unified Design Token System for SKN Applications**
>
> Combines the best of Admin-Chat-System and HR-IMS into a single, configurable design system.

[![Version](https://img.shields.io/npm/v/@skn/design-tokens.svg)](https://www.npmjs.com/package/@skn/design-tokens)
[![License](https://img.shields.io/npm/l/@skn/design-tokens.svg)](https://github.com/skn-org/design-tokens/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

---

## 🎨 Features

- **Dual Style Support**: Choose between solid color (Admin-Chat) or gradient (HR-IMS) active states
- **Configurable Sizes**: Compact (64px) or tall (80px) navbar, narrow (220px) or wide (288px) sidebar
- **Token-Based Architecture**: All colors, spacing, and typography defined as CSS custom properties
- **Built-in Animations**: 10+ CSS animations for messages, transitions, and loading states
- **TypeScript Support**: Full type definitions for all components and configurations
- **Responsive**: Mobile-first design with collapsible sidebar
- **Accessible**: ARIA labels, keyboard navigation, and focus management

---

## 📦 Installation

```bash
npm install @skn/design-tokens
# or
pnpm add @skn/design-tokens
# or
yarn add @skn/design-tokens
```

### Peer Dependencies

```bash
npm install react tailwindcss
```

---

## 🚀 Quick Start

### 1. Import Global Styles

In your main entry file (e.g., `app/layout.tsx` or `src/main.jsx`):

```tsx
import '@skn/design-tokens/css/globals.css'
```

### 2. Wrap with SidebarProvider

```tsx
import { SidebarProvider } from '@skn/design-tokens'

function App({ children }) {
  return (
    <SidebarProvider config={{ style: 'solid' }}>
      {children}
    </SidebarProvider>
  )
}
```

### 3. Use Sidebar and Navbar Components

```tsx
import { Sidebar, Navbar, useSidebar } from '@skn/design-tokens'

function Layout() {
  const { toggleSidebar } = useSidebar()
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="flex h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="flex-1 flex flex-col">
        <Navbar 
          title="Dashboard" 
          onToggleSidebar={toggleSidebar}
        />
        
        <div className="flex-1 overflow-y-auto p-8">
          {/* Your content */}
        </div>
      </main>
    </div>
  )
}
```

---

## 🎯 Configuration

### Theme Presets

Apply pre-configured themes instantly:

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
        Hybrid Style
      </button>
    </div>
  )
}
```

### Available Presets

| Preset | Sidebar Style | Sidebar Size | Navbar Height | Best For |
|--------|--------------|--------------|---------------|----------|
| `admin-chat` | Solid | Compact (220px) | Compact (64px) | Admin-Chat-System |
| `hr-ims` | Gradient | Wide (288px) | Tall (80px) | HR-IMS |
| `hybrid` | Gradient | Compact (220px) | Compact (64px) | Modern look |

### Manual Configuration

```tsx
import { SidebarProvider } from '@skn/design-tokens'

<SidebarProvider
  config={{
    style: 'gradient',        // 'solid' | 'gradient'
    size: 'wide',             // 'compact' | 'wide'
    navbarHeight: 'tall',     // 'compact' | 'tall'
    showSectionLabels: true,  // Show/hide section labels
    showBadges: true,         // Show/hide notification badges
  }}
>
  {children}
</SidebarProvider>
```

---

## 🧩 Components

### Sidebar

The main navigation sidebar with collapsible functionality.

#### Props

```tsx
interface SidebarProps {
  activeTab: string;                    // Currently active tab ID
  onTabChange: (tabId: string) => void; // Tab change handler
  sections?: SidebarNavSection[];       // Custom navigation sections
  user?: {                              // User profile (optional)
    name: string;
    role: string;
    avatar: string;
  };
  onLogout?: () => void;                // Logout handler
  isInventoryExpanded?: boolean;        // For sub-menu expansion
  onInventoryToggle?: () => void;       // Sub-menu toggle
  className?: string;                   // Additional CSS classes
}
```

#### Example

```tsx
<Sidebar
  activeTab={activeTab}
  onTabChange={setActiveTab}
  user={{
    name: 'John Doe',
    role: 'admin',
    avatar: '/avatar.jpg',
  }}
  onLogout={() => console.log('Logout')}
/>
```

### SidebarItem

Individual navigation item (used internally by Sidebar).

```tsx
<SidebarItem
  icon={<Dashboard size={22} />}
  label="Dashboard"
  active={true}
  onClick={() => console.log('Clicked')}
  count={5}           // Notification badge
  hasSubMenu={true}   // Show chevron
/>
```

### Navbar

Top navigation bar with search and notifications.

#### Props

```tsx
interface NavbarProps {
  title?: string;                       // Page title
  onToggleSidebar?: () => void;         // Sidebar toggle handler
  searchQuery?: string;                 // Search query (controlled)
  onSearchChange?: (q: string) => void; // Search change handler
  onSearchSubmit?: (q: string) => void; // Search submit handler
  onNotificationsClick?: () => void;    // Notification click handler
  config?: Partial<NavbarConfig>;       // Config overrides
  rightContent?: React.ReactNode;       // Custom right-side content
  className?: string;                   // Additional CSS classes
}
```

#### Example

```tsx
<Navbar
  title="Dashboard"
  onToggleSidebar={toggleSidebar}
  searchQuery={search}
  onSearchChange={setSearch}
  config={{
    height: 'tall',
    style: 'glass',
    showSearch: true,
    showNotifications: true,
    notificationCount: 3,
  }}
/>
```

---

## 🎨 Design Tokens

### Color Tokens

All colors are defined as CSS custom properties (HSL format):

```css
:root {
  /* Core Palette */
  --primary: 217 91% 60%;
  --accent: 162 72% 45%;
  --destructive: 0 84% 60%;
  
  /* Sidebar (Solid Style) */
  --sidebar-background: 222 47% 11%;
  --sidebar-primary: 217 91% 60%;
  
  /* Gradients (HR-IMS) */
  --gradient-active-from: 217 91% 60%;
  --gradient-active-to: 225 93% 65%;
  
  /* Status */
  --online: 142 71% 45%;
  --away: 38 92% 50%;
  --busy: 0 84% 60%;
  --offline: 220 10% 46%;
}
```

### Spacing Tokens

```css
:root {
  --sidebar-width-collapsed: 68px;
  --sidebar-width-expanded: 220px;
  --sidebar-width-collapsed-hr: 80px;
  --sidebar-width-expanded-hr: 288px;
  --navbar-height-compact: 64px;
  --navbar-height-tall: 80px;
}
```

### Typography

```css
:root {
  --font-noto-sans-thai: 'Noto Sans Thai', system-ui, sans-serif;
  
  /* Font Sizes */
  --text-micro: 9px;
  --text-caption: 10px;
  --text-small: 12px;
  --text-body: 14px;
  --text-base: 16px;
}
```

---

## ✨ Animations

Built-in CSS animations (defined in `globals.css`):

| Class | Duration | Effect |
|-------|----------|--------|
| `msg-in` | 0.3s | Message slide from left |
| `msg-out` | 0.3s | Message slide from right |
| `fade-in` | 0.3s | Content fade with upward motion |
| `scale-in` | 0.2s | Popup scale from 0.95 |
| `toast-slide` | 0.4s | Toast notification from right |
| `blink-badge` | 1s infinite | Badge opacity pulse |
| `typing-dot` | 1.4s infinite | Bouncing typing indicator |
| `pulse-ring` | 1.5s infinite | Expanding ring (video call) |
| `shimmer` | 1.5s infinite | Loading skeleton sweep |

### Usage

```tsx
<div className="fade-in">Content appears with animation</div>
<div className="msg-in">Incoming message</div>
<div className="msg-out">Outgoing message</div>
```

---

## 🔧 Hooks

### useTheme

Manage theme configuration globally.

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
      <button onClick={() => setSidebarStyle('gradient')}>
        Use Gradient Sidebar
      </button>
      <button onClick={() => applyPreset('hr-ims')}>
        Apply HR-IMS Theme
      </button>
    </div>
  )
}
```

### useSidebar

Access sidebar state within SidebarProvider.

```tsx
import { useSidebar } from '@skn/design-tokens'

function MyComponent() {
  const { config, isCollapsed, toggleSidebar, setConfig } = useSidebar()

  return (
    <div>
      <p>Sidebar is {isCollapsed ? 'collapsed' : 'expanded'}</p>
      <p>Style: {config.style}</p>
      <button onClick={toggleSidebar}>Toggle</button>
    </div>
  )
}
```

---

## 📚 Integration Guides

### Next.js 16+ (App Router)

```tsx
// app/layout.tsx
import '@skn/design-tokens/css/globals.css'
import { SidebarProvider } from '@skn/design-tokens'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SidebarProvider config={{ style: 'solid' }}>
          {children}
        </SidebarProvider>
      </body>
    </html>
  )
}
```

### Vite + React

```tsx
// src/main.jsx
import '@skn/design-tokens/css/globals.css'
import { SidebarProvider } from '@skn/design-tokens'

ReactDOM.createRoot(document.getElementById('root')).render(
  <SidebarProvider>
    <App />
  </SidebarProvider>
)
```

---

## 🎯 Migration from Existing Projects

### From Admin-Chat-System

Your existing components will work with minimal changes:

**Before:**
```tsx
<AdminSidebar />
```

**After:**
```tsx
<Sidebar
  activeTab={activeTab}
  onTabChange={setActiveTab}
  sections={customSections}
/>
```

### From HR-IMS

**Before:**
```tsx
<Sidebar
  isSidebarOpen={isSidebarOpen}
  activeTab={activeTab}
/>
```

**After:**
```tsx
<SidebarProvider defaultCollapsed={!isSidebarOpen}>
  <Sidebar
    activeTab={activeTab}
    onTabChange={setActiveTab}
  />
</SidebarProvider>
```

---

## 🛠️ Advanced Usage

### Custom Navigation Sections

```tsx
const customSections = [
  {
    title: 'Main',
    items: [
      { icon: <Home size={22} />, label: 'Home', id: 'home' },
      { icon: <Settings size={22} />, label: 'Settings', id: 'settings' },
    ],
  },
]

<Sidebar sections={customSections} />
```

### Custom Styling

```tsx
<Sidebar
  className="bg-custom-dark"
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>

<Navbar
  className="bg-gradient-to-r from-blue-500 to-indigo-500"
  title="Custom Navbar"
/>
```

### Responsive Behavior

```tsx
// Sidebar automatically collapses on mobile (< 1024px)
// Use useSidebar hook to control programmatically

const { isCollapsed, toggleSidebar } = useSidebar()

// On mobile menu button click
<button onClick={toggleSidebar}>Menu</button>
```

---

## 📝 License

MIT © SKN Team

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support

- Documentation: [GitHub](https://github.com/skn-org/design-tokens)
- Issues: [GitHub Issues](https://github.com/skn-org/design-tokens/issues)
