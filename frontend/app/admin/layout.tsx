'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SessionTimeoutWarning } from '@/components/admin/SessionTimeoutWarning';
import { useTheme } from '@/components/providers';
import { cn } from '@/lib/utils';
import {
  Sun, Moon, Bell, Menu, Search, LogOut, ChevronLeft, ChevronRight,
  LayoutDashboard, FileText, Bot, MessageCircle,
  Reply, MessageSquareReply, PanelTop, Users,
  UserCog, BarChart3, Megaphone, FolderOpen,
  Settings, Palette,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import SidebarItem from '@/components/admin/SidebarItem';

interface MenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles?: Array<'SUPER_ADMIN' | 'ADMIN' | 'AGENT'>;
  external?: boolean;
  openInNewTab?: boolean;
}

type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/login';
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) {
      return;
    }

    if (user.role !== 'AGENT') {
      return;
    }

    if (pathname !== '/admin/live-chat') {
      window.location.href = '/admin/live-chat';
    }
  }, [isAuthenticated, isLoading, pathname, user]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user?.role === 'AGENT' && pathname !== '/admin/live-chat') {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}

// Sidebar User Info Component (uses auth context)
function SidebarUserInfo({ isCollapsed }: { isCollapsed: boolean }) {
  const { user, logout } = useAuth();
  const displayName = user?.display_name || user?.username || 'Administrator';
  const email = '';
  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <div className="relative z-10 p-3 border-t border-white/10 bg-sidebar-accent/50">
      <div
        className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
        onClick={() => logout?.()}
      >
        <Avatar size="sm" fallback={initials} />
        {!isCollapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              {email && <p className="text-xs text-sidebar-text-muted truncate">{email}</p>}
            </div>
            <LogOut className="w-4 h-4 text-sidebar-text-muted group-hover:text-white transition-colors" />
          </>
        )}
      </div>
    </div>
  );
}

// Theme Toggle Button Component
function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Tooltip content={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <button
        onClick={toggleTheme}
        className={cn(
          'p-2 rounded-xl transition-all duration-200',
          'text-text-tertiary hover:text-brand-600 hover:bg-gray-50',
          'dark:hover:text-brand-400 dark:hover:bg-gray-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50'
        )}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </Tooltip>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      } else {
        setIsSidebarCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuGroups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Service Requests',
      items: [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Manage Requests', href: '/admin/requests', icon: FileText, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
      ]
    },
    {
      title: 'Chatbot Management',
      items: [
        { name: 'Chatbot Overview', href: '/admin/chatbot', icon: Bot, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Live Chat', href: '/admin/live-chat', icon: MessageCircle, openInNewTab: true, allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'AGENT'] },
        { name: 'Broadcast', href: '/admin/chatbot/broadcast', icon: Megaphone, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Auto-Replies', href: '/admin/auto-replies', icon: Reply, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Reply Objects', href: '/admin/reply-objects', icon: MessageSquareReply, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Rich Menus', href: '/admin/rich-menus', icon: PanelTop, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Friends', href: '/admin/friends', icon: Users, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
      ]
    },
    {
      title: 'System Management',
      items: [
        { name: 'User Management', href: '/admin/users', icon: UserCog, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'File Management', href: '/admin/files', icon: FolderOpen, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Reports', href: '/admin/reports', icon: BarChart3, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Settings', href: '/admin/settings', icon: Settings, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
        { name: 'Design System', href: '/admin/design-system', icon: Palette, allowedRoles: ['SUPER_ADMIN', 'ADMIN'] },
      ]
    }
  ];

  const isMenuItemVisible = (item: MenuItem) => {
    if (!item.allowedRoles) {
      return true;
    }

    if (!user || user.role === 'USER') {
      return false;
    }

    return item.allowedRoles.includes(user.role as StaffRole);
  };

  const visibleMenuGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(isMenuItemVisible),
    }))
    .filter((group) => group.items.length > 0);

  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
  const isLiveChat = pathname.includes('/admin/live-chat');

  if (isLiveChat) {
    return <>{children}</>;
  }

  const allItems = visibleMenuGroups.flatMap(g => g.items);
  const activeItem = allItems
    .filter(item => !item.external && (pathname === item.href || pathname.startsWith(item.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="flex h-screen bg-bg text-gray-600 dark:bg-gray-900 dark:text-gray-400 font-sans">
          {/* Skip to main content link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-500 focus:text-white focus:rounded-lg"
          >
            Skip to main content
          </a>

          {/* Sidebar */}
          <aside
            className={cn(
              'fixed left-0 top-0 z-50 h-full',
              'bg-sidebar-bg text-sidebar-fg',
              'flex flex-col overflow-hidden',
              'transition-all duration-300 ease-in-out',
              'border-r border-white/5',
              isSidebarCollapsed ? 'w-20' : 'w-64',
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-sidebar-bg via-sidebar-accent to-sidebar-border opacity-100 pointer-events-none" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay pointer-events-none" />

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
                    <h1 className="text-white font-bold text-xl bg-gradient-to-r from-white to-sidebar-text-muted bg-clip-text text-transparent tracking-wide leading-tight">
                      JSK
                    </h1>
                    <p className="text-[10px] text-sidebar-text-muted tracking-widest uppercase">Admin</p>
                  </div>
                </Link>
              )}
            </div>

            {/* Navigation */}
            <nav className="relative z-10 flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-sidebar">
              {visibleMenuGroups.map((group) => (
                <div key={group.title}>
                  {!isSidebarCollapsed && (
                    <h3 className="px-3 mb-2 text-[10px] font-semibold text-sidebar-text-muted uppercase tracking-widest">
                      {group.title}
                    </h3>
                  )}
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
                </div>
              ))}
            </nav>

            {/* User Section */}
            <SidebarUserInfo isCollapsed={isSidebarCollapsed} />

            {/* Bottom collapse toggle — HR-IMS style */}
            <button
              onClick={toggleSidebar}
              className="relative z-10 flex h-10 w-full items-center justify-center border-t border-white/10 text-sidebar-text-muted transition-colors hover:bg-white/5 hover:text-white"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed
                ? <ChevronRight className="h-4 w-4" />
                : <ChevronLeft className="h-4 w-4" />}
            </button>
          </aside>

          {/* Main Content */}
          <div className={cn(
            'flex flex-col flex-1 transition-all duration-300',
            isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
          )}>
            {/* Header */}
            <header className={cn(
              'sticky top-0 z-40 h-20',
              'flex items-center justify-between',
              'glass-navbar',
              'px-6 md:px-8'
            )}>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 bg-surface dark:bg-surface-dark rounded-xl shadow-sm border border-border-default text-text-secondary hover:text-brand-600 transition-colors cursor-pointer"
                  aria-label="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <div className="hidden md:flex items-center bg-muted/50 rounded-xl px-4 py-2.5 border border-border-default focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-900 transition-all w-64">
                  <Search className="w-4 h-4 text-sidebar-text-muted mr-2 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />

                <Tooltip content="Notifications">
                  <button
                    className="p-2.5 rounded-xl text-text-tertiary hover:text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all relative"
                    aria-label="Notifications"
                  >
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-gray-800 animate-pulse" />
                    <Bell className="w-5 h-5" />
                  </button>
                </Tooltip>

                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1" />

                <Avatar
                  size="sm"
                  fallback="AD"
                  status="online"
                  className="ring-2 ring-indigo-500/20 ring-offset-1 ring-offset-white dark:ring-offset-gray-800"
                />
              </div>
            </header>

            {/* Page content */}
            <main id="main-content" className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-6 scrollbar-thin">
              <div className="animate-fade-in-up">
                {children}
              </div>
            </main>
          </div>

          {/* Mobile Overlay */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-hidden="true"
            />
          )}

      <SessionTimeoutWarning />
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminAuthGate>
        <AdminShell>{children}</AdminShell>
      </AdminAuthGate>
    </AuthProvider>
  );
}
