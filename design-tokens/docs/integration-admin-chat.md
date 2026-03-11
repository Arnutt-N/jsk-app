# Integration Guide: admin-chat-system

This guide shows how to integrate @skn/design-tokens into the admin-chat-system project.

---

## Step 1: Install the Package

```bash
cd D:\genAI\skn-app\examples\admin-chat-system
npm install ../../design-tokens
```

---

## Step 2: Import Global Styles

In `app/layout.tsx`:

```tsx
import '@skn/design-tokens/css/globals.css'
import { SidebarProvider } from '@skn/design-tokens'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={notoSansThai.className}>
        <SidebarProvider
          config={{
            style: 'solid',      // Use Admin-Chat-System solid style
            size: 'compact',     // 220px expanded width
            navbarHeight: 'compact', // 64px navbar
            showSectionLabels: true,
            showBadges: true,
          }}
        >
          {children}
        </SidebarProvider>
      </body>
    </html>
  )
}
```

---

## Step 3: Replace AdminSidebar Component

In `app/page.tsx`:

**Before:**
```tsx
import { AdminSidebar } from "@/components/admin-sidebar"

export default function Page() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <AdminSidebar />
      {/* ... */}
    </div>
  )
}
```

**After:**
```tsx
import { Sidebar, useSidebar } from '@skn/design-tokens'

export default function Page() {
  const { isCollapsed } = useSidebar()
  const [activeTab, setActiveTab] = useState('live-chat')

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sections={[
          {
            title: 'Main Menu',
            items: [
              { icon: <MessageSquare size={22} />, label: 'Live Chat', id: 'live-chat', badge: 12 },
              { icon: <Users size={22} />, label: 'Contacts', id: 'contacts' },
              { icon: <BarChart3 size={22} />, label: 'Analytics', id: 'analytics' },
            ],
          },
          {
            title: 'Settings',
            items: [
              { icon: <Settings size={22} />, label: 'Preferences', id: 'preferences' },
            ],
          },
        ]}
      />
      {/* ... rest of layout */}
    </div>
  )
}
```

---

## Step 4: Replace Navbar

In your chat room component:

**Before:**
```tsx
<div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/50 px-6">
  {/* Your existing navbar */}
</div>
```

**After:**
```tsx
import { Navbar } from '@skn/design-tokens'

<Navbar
  title={selectedUser?.name || 'Live Chat'}
  config={{
    height: 'compact',
    style: 'solid',
    showNotifications: true,
    notificationCount: unreadCount,
  }}
  rightContent={
    <div className="flex items-center gap-2">
      {/* Your custom action buttons */}
      <Button variant="ghost" size="icon">
        <Phone className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon">
        <Video className="h-4 w-4" />
      </Button>
    </div>
  }
/>
```

---

## Step 5: Migrate Custom Styling

### Keep Your Existing Animations

Your existing CSS animations in `globals.css` will continue to work. The design tokens add new animations but don't remove existing ones.

### Keep Your Color Tokens

Your existing color tokens in `globals.css` take precedence. The design tokens provide defaults but you can override them:

```css
/* In your app/globals.css - AFTER importing design tokens */
@import '@skn/design-tokens/css/globals.css';

:root {
  /* Your existing tokens - these override the package defaults */
  --primary: 217 91% 60%;
  --sidebar-background: 222 47% 11%;
  /* ... your existing tokens */
}
```

---

## Step 6: Use Theme Hook (Optional)

Add a theme switcher for testing:

```tsx
'use client'
import { useTheme } from '@skn/design-tokens'

function ThemeSwitcher() {
  const { applyPreset, setSidebarStyle } = useTheme()

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => applyPreset('admin-chat')}
      >
        Admin Chat Style
      </Button>
      <Button
        variant="outline"
        onClick={() => setSidebarStyle('gradient')}
      >
        Try Gradient
      </Button>
    </div>
  )
}
```

---

## Migration Checklist

- [ ] Install @skn/design-tokens package
- [ ] Import globals.css in layout.tsx
- [ ] Wrap app with SidebarProvider
- [ ] Replace AdminSidebar with Sidebar component
- [ ] Replace custom navbar with Navbar component
- [ ] Update color references to use tokens
- [ ] Test responsive behavior
- [ ] Test collapsible sidebar
- [ ] Verify animations work correctly
- [ ] Remove old admin-sidebar.tsx (optional)

---

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `app/layout.tsx` | Modify | Add SidebarProvider wrapper |
| `app/page.tsx` | Modify | Replace AdminSidebar with Sidebar |
| `components/chat-room.tsx` | Modify | Replace navbar with Navbar |
| `components/admin-sidebar.tsx` | Delete (optional) | No longer needed |
| `app/globals.css` | Modify | Import design tokens CSS |

---

## Troubleshooting

### Sidebar not collapsing

Make sure you're using the SidebarProvider:

```tsx
<SidebarProvider>
  <Sidebar />
</SidebarProvider>
```

### Styles not applying

Check that you imported the CSS:

```tsx
import '@skn/design-tokens/css/globals.css'
```

### TypeScript errors

Make sure you have the latest types:

```bash
npm install --save-dev @types/react
```

---

## Next Steps

1. Test the gradient style: `applyPreset('hybrid')`
2. Customize navigation sections
3. Add custom theme switcher
4. Explore other components (StatusBadge, etc.)
