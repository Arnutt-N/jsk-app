'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    children?: React.ReactNode; // Action buttons slot
    className?: string;
}

export default function PageHeader({
    title,
    subtitle,
    children,
    className,
}: PageHeaderProps) {
    return (
        <div
            className={cn(
                'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4',
                'pb-4 border-b border-border-default',
                className
            )}
        >
            <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight thai-no-break truncate">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-sm text-text-tertiary mt-0.5 thai-no-break truncate">
                        {subtitle}
                    </p>
                )}
            </div>
            {children && (
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 flex-wrap">{children}</div>
            )}
        </div>
    );
}
