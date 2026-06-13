'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Native <select> styled to match the admin form text inputs
 * (bg-bg, rounded-lg) but with `appearance-none` + a custom ChevronDown
 * so the indicator sits inset from the edge instead of flush against it
 * (UAT: browser-default arrows looked cramped against the border).
 *
 * Accepts <option> children directly so callers keep their own option
 * logic (placeholders, legacy passthrough, dynamic lists). className is
 * merged via tailwind-merge, so passing e.g. "text-base font-bold"
 * overrides the defaults for emphasis selects.
 */
export function FormSelect({
    className,
    children,
    ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <div className="relative">
            <select
                {...props}
                className={cn(
                    'w-full appearance-none p-2.5 pr-9 bg-bg border border-border-default rounded-lg text-sm outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
                    className,
                )}
            >
                {children}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
        </div>
    );
}
