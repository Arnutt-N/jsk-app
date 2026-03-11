# Integration Guide: hr-ims

This guide shows how to integrate @skn/design-tokens into the hr-ims project.

---

## Step 1: Install the Package

```bash
cd D:\genAI\hr-ims
npm install ../skn-app/design-tokens
```

---

## Step 2: Import Global Styles

In `src/main.jsx` or `src/index.css`:

```jsx
// Add at the top of your main CSS file
@import '@skn/design-tokens/css/globals.css';
```

Or in your main JSX file:

```jsx
import '@skn/design-tokens/css/globals.css'
```

---

## Step 3: Wrap with SidebarProvider

In `src/App.jsx`:

**Before:**
```jsx
function App() {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        // ... many props
      />
      {/* ... */}
    </div>
  )
}
```

**After:**
```jsx
import { SidebarProvider, Sidebar, Navbar } from '@skn/design-tokens'

function AppContent() {
  const { toggleSidebar } = useSidebar()
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={{
          name: currentUser.name,
          role: currentUser.role,
          avatar: currentUser.avatar,
        }}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <Navbar
          title={activeTab.replace('-', ' ')}
          onToggleSidebar={toggleSidebar}
          config={{
            height: 'tall',        // HR-IMS uses 80px navbar
            style: 'glass',        // Glass morphism effect
            showNotifications: true,
          }}
        />

        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative main-scrollbar">
          <div className="max-w-7xl mx-auto h-full">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <SidebarProvider
      config={{
        style: 'gradient',       // HR-IMS gradient style
        size: 'wide',            // 288px expanded width
        navbarHeight: 'tall',    // 80px navbar
        showSectionLabels: true,
        showBadges: true,
      }}
    >
      <AppContent />
    </SidebarProvider>
  )
}
```

---

## Step 4: Migrate from Old Sidebar

Your current Sidebar.jsx can be removed after migration:

**Old Sidebar props:**
```jsx
<Sidebar
  isSidebarOpen={isSidebarOpen}
  setIsSidebarOpen={setIsSidebarOpen}
  activeTab={activeTab}
  setActiveTab={setActiveTab}
  isInventoryExpanded={isInventoryExpanded}
  setIsInventoryExpanded={setIsInventoryExpanded}
  currentUser={currentUser}
  handleLogout={handleLogout}
  requests={requests}
  myAssets={myAssets}
  inventory={inventory}
  cart={cart}
  handleInventoryMenuClick={handleInventoryMenuClick}
/>
```

**New Sidebar props:**
```jsx
<Sidebar
  activeTab={activeTab}
  onTabChange={setActiveTab}
  user={{
    name: currentUser.name,
    role: currentUser.role,
    avatar: currentUser.avatar,
  }}
  onLogout={handleLogout}
  isInventoryExpanded={isInventoryExpanded}
  onInventoryToggle={handleInventoryMenuClick}
  sections={customSections}  // Optional: customize navigation
/>
```

---

## Step 5: Preserve HR-IMS Styling

### Keep the Gradient Active State

The new Sidebar component supports both styles. To keep HR-IMS gradient:

```jsx
<SidebarProvider config={{ style: 'gradient' }}>
  {/* Your app */}
</SidebarProvider>
```

### Keep the Wide Sidebar

HR-IMS uses 288px width. Configure it:

```jsx
<SidebarProvider config={{ size: 'wide' }}>
  {/* Your app */}
</SidebarProvider>
```

### Keep the Tall Navbar

HR-IMS uses 80px navbar height:

```jsx
<Navbar config={{ height: 'tall' }} />
```

---

## Step 6: Custom Navigation Sections (Optional)

If you want to customize the navigation:

```jsx
const hrImsSections = [
  {
    title: 'Main Menu',
    items: [
      { icon: <LayoutDashboard size={22} />, label: 'Dashboard', id: 'dashboard' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      {
        icon: <Package size={22} />,
        label: 'Inventory Items',
        id: 'inventory',
        hasSubMenu: true,
        subItems: [
          { icon: <Box size={18} />, label: 'All Items', id: 'inventory' },
          { icon: <Box size={18} />, label: 'Consumables', id: 'inventory-consumable' },
          { icon: <Box size={18} />, label: 'Durables', id: 'inventory-durable' },
        ],
      },
      { icon: <ShoppingCart size={22} />, label: 'My Cart', id: 'cart', count: cart.length },
      { icon: <Box size={22} />, label: 'My Assets', id: 'my-assets', count: myAssets.length },
    ],
  },
  // ... more sections
]

<Sidebar sections={hrImsSections} />
```

---

## Step 7: Update CSS Classes

Your existing custom scrollbar classes will continue to work:

```css
/* Keep your existing classes */
.main-scrollbar::-webkit-scrollbar {
  width: 6px;
}
```

The design tokens include these by default, but your local styles take precedence.

---

## Migration Checklist

- [ ] Install @skn/design-tokens package
- [ ] Import globals.css in main.jsx or index.css
- [ ] Wrap App with SidebarProvider
- [ ] Replace old Sidebar with new Sidebar component
- [ ] Replace header with Navbar component
- [ ] Test gradient active state
- [ ] Test wide sidebar (288px)
- [ ] Test tall navbar (80px)
- [ ] Verify notification badges work
- [ ] Test sub-menu expansion
- [ ] Remove old Sidebar.jsx and SidebarItem.jsx (optional)

---

## File Changes Summary

| File | Action | Notes |
|------|--------|-------|
| `src/App.jsx` | Modify | Add SidebarProvider, replace Sidebar/Navbar |
| `src/main.jsx` | Modify | Import design tokens CSS |
| `src/index.css` | Modify | Import design tokens CSS (alternative) |
| `src/layout/Sidebar.jsx` | Delete (optional) | No longer needed |
| `src/layout/SidebarItem.jsx` | Delete (optional) | No longer needed |
| `tailwind.config.js` | Keep | Your existing config |

---

## Preserving HR-IMS Features

### Gradient Active State ✅

```jsx
config={{ style: 'gradient' }}
// Results in: bg-gradient-to-r from-blue-600 to-indigo-600
```

### Wide Sidebar ✅

```jsx
config={{ size: 'wide' }}
// Results in: w-[288px] expanded, w-[80px] collapsed
```

### Tall Navbar ✅

```jsx
config={{ height: 'tall' }}
// Results in: h-20 (80px)
```

### Glass Morphism ✅

```jsx
<Navbar config={{ style: 'glass' }} />
// Results in: bg-white/80 backdrop-blur-md
```

### Notification Badges ✅

```jsx
<SidebarItem count={5} />
// Shows red badge with number
```

---

## Troubleshooting

### Gradient not showing

Make sure you set the style:

```jsx
<SidebarProvider config={{ style: 'gradient' }}>
```

### Sidebar too narrow

Change the size config:

```jsx
<SidebarProvider config={{ size: 'wide' }}>
```

### Navbar too short

Set the height:

```jsx
<Navbar config={{ height: 'tall' }} />
```

### Logo not showing

The new Sidebar includes a default logo. To customize it, you'll need to extend the component or add custom branding in the navbar.

---

## Advanced: Using useTheme Hook

Add theme switching capability:

```jsx
import { useTheme } from '@skn/design-tokens'

function ThemeSettings() {
  const { theme, applyPreset, setSidebarStyle } = useTheme()

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold mb-4">Theme Settings</h3>
      
      <div className="space-y-2">
        <button
          onClick={() => applyPreset('hr-ims')}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-2 rounded"
        >
          HR-IMS Theme (Gradient)
        </button>
        
        <button
          onClick={() => applyPreset('admin-chat')}
          className="w-full bg-sidebar-primary text-white p-2 rounded"
        >
          Admin Chat Theme (Solid)
        </button>
        
        <button
          onClick={() => setSidebarStyle('gradient')}
          className="w-full border p-2 rounded"
        >
          Use Gradient Sidebar
        </button>
      </div>
    </div>
  )
}
```

---

## Next Steps

1. Test all navigation items
2. Verify sub-menu expansion works
3. Test responsive behavior on mobile
4. Add theme switcher (optional)
5. Customize branding (logo, colors)
6. Explore animation utilities
