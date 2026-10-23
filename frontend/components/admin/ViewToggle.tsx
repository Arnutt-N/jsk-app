'use client';

import { cn } from '@/lib/utils';

export interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface ViewToggleProps<T extends string> {
  options: ViewToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

/**
 * Segmented grid/list (or list/calendar) switch shared by admin tables.
 * Single active style (brand pill) so pages stop diverging.
 */
export function ViewToggle<T extends string>({ options, value, onChange, ariaLabel }: ViewToggleProps<T>) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-default p-0.5" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.label}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs transition-colors',
              active
                ? 'bg-brand-500 font-medium text-white'
                : 'text-text-tertiary hover:text-text-primary',
            )}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ViewToggle;
