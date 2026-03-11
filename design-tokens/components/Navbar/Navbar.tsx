import React from 'react';
import { Menu, Bell, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSidebar } from '../Sidebar/SidebarContext';

export type NavbarStyle = 'glass' | 'solid';
export type NavbarHeight = 'compact' | 'tall';

export interface NavbarConfig {
  /** Navbar height */
  height: NavbarHeight;
  /** Navbar visual style */
  style: NavbarStyle;
  /** Show search bar */
  showSearch: boolean;
  /** Show notifications */
  showNotifications: boolean;
  /** Notification count */
  notificationCount: number;
}

export const defaultNavbarConfig: NavbarConfig = {
  height: 'compact',
  style: 'glass',
  showSearch: false,
  showNotifications: true,
  notificationCount: 0,
};

export interface NavbarProps {
  /** Page title */
  title?: string;
  /** Sidebar toggle handler */
  onToggleSidebar?: () => void;
  /** Search query */
  searchQuery?: string;
  /** Search change handler */
  onSearchChange?: (query: string) => void;
  /** Search submit handler */
  onSearchSubmit?: (query: string) => void;
  /** Notification click handler */
  onNotificationsClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Config overrides */
  config?: Partial<NavbarConfig>;
  /** Custom right-side content */
  rightContent?: React.ReactNode;
}

export const Navbar = React.forwardRef<HTMLElement, NavbarProps>(
  (
    {
      title,
      onToggleSidebar,
      searchQuery = '',
      onSearchChange,
      onSearchSubmit,
      onNotificationsClick,
      className,
      config: customConfig,
      rightContent,
    },
    ref
  ) => {
    const { isCollapsed } = useSidebar();
    const config: NavbarConfig = {
      ...defaultNavbarConfig,
      ...customConfig,
    };

    // Determine height based on config
    const heightClass = config.height === 'tall' ? 'h-20' : 'h-16';

    // Determine background style
    const bgClass =
      config.style === 'glass'
        ? 'bg-white/80 backdrop-blur-md border-b border-slate-200'
        : 'bg-card/50 backdrop-blur-sm border-b border-border';

    // Handle search submit
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && onSearchSubmit) {
        onSearchSubmit(searchQuery);
      }
    };

    return (
      <header
        ref={ref}
        className={cn(
          'flex justify-between items-center px-8 sticky top-0 z-30 transition-all duration-300',
          heightClass,
          bgClass,
          className
        )}
      >
        {/* Left Section: Menu Toggle + Title */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={cn(
                'p-2 rounded-lg transition-colors lg:hidden',
                config.style === 'glass'
                  ? 'text-slate-500 hover:bg-slate-100'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              aria-label="Toggle sidebar"
            >
              <Menu size={24} />
            </button>
          )}

          {/* Page Title */}
          {title && (
            <h2
              className={cn(
                'text-xl font-bold hidden md:block',
                config.style === 'glass' ? 'text-slate-800' : 'text-foreground'
              )}
            >
              {title}
            </h2>
          )}
        </div>

        {/* Center Section: Search Bar (optional) */}
        {config.showSearch && (
          <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search
                className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2',
                  config.style === 'glass' ? 'text-slate-400' : 'text-muted-foreground'
                )}
                size={18}
              />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                onKeyDown={handleKeyDown}
                className={cn(
                  'w-full pl-10 pr-4 py-2 rounded-lg border transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20',
                  config.style === 'glass'
                    ? 'bg-white/50 border-slate-200 text-slate-800 placeholder:text-slate-400'
                    : 'bg-muted/50 border-border text-foreground placeholder:text-muted-foreground'
                )}
              />
            </div>
          </div>
        )}

        {/* Right Section: Notifications + Custom Content */}
        <div className="flex items-center gap-6">
          {rightContent}

          {/* Notifications */}
          {config.showNotifications && (
            <div className="relative">
              <button
                onClick={onNotificationsClick}
                className={cn(
                  'p-2 transition-colors relative',
                  config.style === 'glass'
                    ? 'text-slate-400 hover:text-indigo-600'
                    : 'text-muted-foreground hover:text-primary'
                )}
                aria-label="Notifications"
              >
                <Bell size={20} />
                {config.notificationCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
            </div>
          )}
        </div>
      </header>
    );
  }
);

Navbar.displayName = 'Navbar';
