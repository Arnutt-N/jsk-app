'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  isActive: boolean;
  isCollapsed: boolean;
  badge?: number;
  isSubItem?: boolean;
  hasSubMenu?: boolean;
  isExpanded?: boolean;
  target?: string;
}

export function SidebarItem({
  icon: Icon,
  label,
  href,
  isActive,
  isCollapsed,
  badge,
  isSubItem = false,
  hasSubMenu = false,
  isExpanded = false,
  target,
}: SidebarItemProps) {
  const link = (
    <Link
      href={href}
      target={target}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center w-full rounded-xl p-3.5',
        'transition-all duration-300 my-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
        isActive
          ? 'gradient-active text-white shadow-lg shadow-blue-900/40'
          : 'text-slate-400 hover:bg-white/5 hover:text-white',
        isSubItem && 'pl-11'
      )}
    >
      {/* Icon */}
      <Icon
        className={cn(
          'flex-shrink-0 transition-colors',
          isSubItem ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]',
          isCollapsed && 'mx-auto',
          isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-300'
        )}
        aria-hidden="true"
      />

      {/* Label + chevron (hidden when collapsed) */}
      {!isCollapsed && (
        <div className="flex flex-1 items-center justify-between ml-4 overflow-hidden">
          <span
            className={cn(
              'font-medium tracking-wide whitespace-nowrap text-sm',
              isSubItem && 'font-normal text-slate-300'
            )}
          >
            {label}
          </span>
          {hasSubMenu && (
            <ChevronRight
              className={cn(
                'h-4 w-4 text-slate-400 transition-transform duration-300',
                isExpanded && 'rotate-90'
              )}
            />
          )}
        </div>
      )}

      {/* Badge */}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            'absolute bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5',
            'rounded-md shadow-md border border-rose-400 min-w-[1.25rem] text-center',
            isCollapsed ? 'top-1 right-1' : 'right-2 top-1/2 -translate-y-1/2'
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );

  // When collapsed, wrap in tooltip so label is still discoverable
  if (isCollapsed) {
    return (
      <Tooltip content={label} side="right">
        {link}
      </Tooltip>
    );
  }

  return link;
}

export default SidebarItem;
