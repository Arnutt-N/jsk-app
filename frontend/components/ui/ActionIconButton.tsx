'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

const variantStyles = {
    default: 'text-brand-600 hover:bg-brand-50 hover:text-brand-700 dark:text-brand-400 dark:hover:bg-brand-500/10',
    warning: 'text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/10',
    danger: 'text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10',
    success: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10',
    muted: 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700',
};

interface ActionIconButtonProps {
    icon: React.ReactNode;
    label: string; // Used for tooltip and aria-label
    variant?: keyof typeof variantStyles;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;
}

export function ActionIconButton({
    icon,
    label,
    variant = 'default',
    onClick,
    disabled = false,
    className,
}: ActionIconButtonProps) {
    return (
        <Tooltip content={label}>
            <button
                onClick={onClick}
                disabled={disabled}
                aria-label={label}
                className={cn(
                    'inline-flex items-center justify-center',
                    'h-8 w-8 rounded-lg',
                    'cursor-pointer select-none',
                    'transition-all duration-200 ease-out',
                    'hover:scale-110',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent',
                    'active:scale-95',
                    variantStyles[variant],
                    className
                )}
            >
                {icon}
            </button>
        </Tooltip>
    );
}

export default ActionIconButton;
