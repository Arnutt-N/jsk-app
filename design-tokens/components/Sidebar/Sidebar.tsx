import React from 'react';
import {
  LayoutDashboard, Box, ShoppingCart, Users, FileText,
  History, Monitor, ScanLine, Tags, BarChart3,
  Settings, LogOut, Package
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSidebar } from './SidebarContext';
import { SidebarItem } from './SidebarItem';

export interface SidebarNavSection {
  title: string;
  items: SidebarNavItem[];
}

export interface SidebarNavItem {
  icon: React.ReactNode;
  label: string;
  id: string;
  count?: number;
  hasSubMenu?: boolean;
  isExpanded?: boolean;
  subItems?: SidebarNavItem[];
}

export interface SidebarProps {
  /** Active tab ID */
  activeTab: string;
  /** Tab change handler */
  onTabChange: (tabId: string) => void;
  /** Navigation sections */
  sections?: SidebarNavSection[];
  /** User profile data */
  user?: {
    name: string;
    role: string;
    avatar: string;
  };
  /** Logout handler */
  onLogout?: () => void;
  /** Inventory expanded state (for demo) */
  isInventoryExpanded?: boolean;
  /** Inventory toggle handler */
  onInventoryToggle?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const defaultSections: SidebarNavSection[] = [
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
      { icon: <ShoppingCart size={22} />, label: 'My Cart', id: 'cart', count: 3 },
      { icon: <Box size={22} />, label: 'My Assets', id: 'my-assets', count: 5 },
    ],
  },
  {
    title: 'Management',
    items: [
      { icon: <Users size={22} />, label: 'User Management', id: 'users' },
      { icon: <FileText size={22} />, label: 'Requests', id: 'requests', count: 2 },
      { icon: <History size={22} />, label: 'History Logs', id: 'history' },
      { icon: <Monitor size={22} />, label: 'Maintenance', id: 'maintenance', count: 1 },
    ],
  },
  {
    title: 'Tools',
    items: [
      { icon: <ScanLine size={22} />, label: 'Scanner Mode', id: 'scanner' },
      { icon: <Tags size={22} />, label: 'Tag Generator', id: 'tags' },
      { icon: <BarChart3 size={22} />, label: 'Reports', id: 'reports' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: <Settings size={22} />, label: 'Settings', id: 'settings' },
    ],
  },
];

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      activeTab,
      onTabChange,
      sections = defaultSections,
      user,
      onLogout,
      isInventoryExpanded = false,
      onInventoryToggle,
      className,
    },
    ref
  ) => {
    const { config, isCollapsed } = useSidebar();

    // Determine sidebar width based on size config
    const widthClass = config.size === 'wide'
      ? (isCollapsed ? 'w-[80px]' : 'w-[288px]')
      : (isCollapsed ? 'w-[68px]' : 'w-[220px]');

    // Determine background style
    const bgClass = config.style === 'gradient'
      ? 'bg-slate-900'
      : 'bg-sidebar';

    return (
      <aside
        ref={ref}
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 h-full transition-all duration-300 ease-in-out flex flex-col shadow-2xl overflow-hidden',
          widthClass,
          bgClass,
          !isCollapsed && 'translate-x-0',
          isCollapsed && '-translate-x-full lg:translate-x-0',
          className
        )}
      >
        {/* Logo Area */}
        <div className={cn(
          'h-20 flex items-center px-6 border-b border-white/10 relative',
          config.style === 'gradient' ? 'bg-slate-900' : 'bg-sidebar'
        )}>
          <div
            className={cn(
              'flex items-center gap-3 transition-opacity duration-300',
              !isCollapsed ? 'opacity-100' : 'opacity-0 lg:opacity-100 lg:w-0 lg:overflow-hidden'
            )}
          >
            {/* Logo Icon with Gradient */}
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shadow-lg',
              config.style === 'gradient'
                ? 'bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/30'
                : 'bg-sidebar-primary shadow-sidebar-primary/20'
            )}>
              <Box className={cn(
                config.style === 'gradient' ? 'text-white' : 'text-white'
              )} size={24} />
            </div>

            {/* Brand Text */}
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                IMS.Pro
              </h1>
              <p className="text-[10px] text-slate-500 tracking-widest uppercase">
                Inventory System
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 sidebar-scrollbar">
          {sections.map((section, sectionIndex) => (
            <div key={section.title} className="mb-4">
              {/* Section Label */}
              {config.showSectionLabels && (
                <p
                  className={cn(
                    'px-4 text-[10px] font-bold uppercase tracking-wider mb-2 transition-opacity',
                    config.style === 'gradient' ? 'text-slate-500' : 'text-sidebar-muted',
                    !isCollapsed ? 'opacity-100' : 'opacity-0 text-center'
                  )}
                >
                  {section.title}
                </p>
              )}

              {/* Nav Items */}
              {section.items.map((item) => (
                <React.Fragment key={item.id}>
                  <SidebarItem
                    icon={item.icon}
                    label={item.label}
                    active={activeTab === item.id || (item.subItems?.some(sub => sub.id === activeTab))}
                    onClick={() => {
                      if (item.hasSubMenu && onInventoryToggle) {
                        onInventoryToggle();
                      } else {
                        onTabChange(item.id);
                      }
                    }}
                    count={config.showBadges ? item.count : undefined}
                    hasSubMenu={item.hasSubMenu}
                    isExpanded={item.isExpanded}
                  />

                  {/* Sub-menu Items */}
                  {item.hasSubMenu && item.subItems && (
                    <div
                      className={cn(
                        'overflow-hidden transition-all duration-300 ease-in-out space-y-1',
                        isInventoryExpanded && !isCollapsed
                          ? 'max-h-40 opacity-100 mt-1'
                          : 'max-h-0 opacity-0'
                      )}
                    >
                      {item.subItems.map((subItem) => (
                        <SidebarItem
                          key={subItem.id}
                          icon={subItem.icon}
                          label={subItem.label}
                          active={activeTab === subItem.id}
                          onClick={() => onTabChange(subItem.id)}
                          isSubItem
                        />
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ))}
        </nav>

        {/* Profile Footer */}
        {user && (
          <div className={cn(
            'p-4 border-t',
            config.style === 'gradient' ? 'border-white/10 bg-slate-800/50' : 'border-sidebar-border bg-sidebar-accent/30'
          )}>
            <div className={cn(
              'flex items-center gap-3 transition-all',
              !isCollapsed && 'justify-center'
            )}>
              <img
                src={user.avatar}
                alt={user.name}
                className="w-10 h-10 rounded-full border-2 border-indigo-500"
              />
              {!isCollapsed && (
                <>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="text-sm font-bold text-white truncate">{user.name}</h4>
                    <p className="text-[10px] text-slate-400 truncate">
                      {user.role === 'admin' ? 'Administrator' : 'General User'}
                    </p>
                  </div>
                  {onLogout && (
                    <button
                      onClick={onLogout}
                      className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      title="Logout"
                      aria-label="Logout"
                    >
                      <LogOut size={18} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    );
  }
);

Sidebar.displayName = 'Sidebar';
