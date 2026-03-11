import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSidebar } from './SidebarContext';

export interface SidebarItemProps {
  /** Icon element (from lucide-react) */
  icon: React.ReactNode;
  /** Label text */
  label: string;
  /** Active state */
  active?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Notification badge count */
  count?: number;
  /** Is this a sub-menu item */
  isSubItem?: boolean;
  /** Has a sub-menu */
  hasSubMenu?: boolean;
  /** Is the sub-menu expanded */
  isExpanded?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  (
    {
      icon,
      label,
      active = false,
      onClick,
      count,
      isSubItem = false,
      hasSubMenu = false,
      isExpanded = false,
      className,
    },
    ref
  ) => {
    const { config, isCollapsed } = useSidebar();

    // Determine active style based on config
    const activeStyle =
      config.style === 'gradient'
        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40'
        : 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20';

    // Determine inactive/hover style
    const inactiveStyle = config.style === 'gradient'
      ? 'text-slate-400 hover:bg-white/5 hover:text-white'
      : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground';

    return (
      <button
        ref={ref}
        onClick={onClick}
        className={cn(
          'flex items-center rounded-xl transition-all duration-300 group relative my-1',
          active ? activeStyle : inactiveStyle,
          isSubItem ? 'pl-11 text-sm' : 'w-full p-3.5',
          !isCollapsed && 'justify-start',
          isCollapsed && 'justify-center',
          className
        )}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
      >
        {/* Icon */}
        <div
          className={cn(
            active
              ? config.style === 'gradient'
                ? 'text-white'
                : 'text-white'
              : config.style === 'gradient'
              ? 'text-slate-400 group-hover:text-blue-300'
              : 'text-sidebar-muted group-hover:text-sidebar-foreground',
            'transition-colors',
            isCollapsed && 'mx-auto'
          )}
        >
          {React.cloneElement(icon as React.ReactElement, {
            size: isSubItem ? 18 : 22,
          })}
        </div>

        {/* Label and Chevron */}
        {!isCollapsed && (
          <div className="flex-1 flex justify-between items-center ml-4 overflow-hidden">
            <span
              className={cn(
                'font-medium tracking-wide whitespace-nowrap',
                isSubItem ? 'font-normal text-slate-300' : ''
              )}
            >
              {label}
            </span>
            {hasSubMenu && (
              <ChevronRight
                size={16}
                className={cn(
                  'text-slate-400 transition-transform duration-300',
                  isExpanded ? 'rotate-90' : ''
                )}
              />
            )}
          </div>
        )}

        {/* Notification Badge */}
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              'bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-md border border-rose-400 min-w-[1.25rem]',
              isCollapsed
                ? 'absolute top-1 right-1'
                : 'absolute right-2 top-1/2 -translate-y-1/2'
            )}
          >
            {count}
          </span>
        )}
      </button>
    );
  }
);

SidebarItem.displayName = 'SidebarItem';
