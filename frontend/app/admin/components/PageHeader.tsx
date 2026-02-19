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
                'flex items-center justify-between',
                'bg-surface rounded-2xl p-5',
                'border border-border-default shadow-sm',
                className
            )}
        >
            <div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight thai-no-break">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-sm text-text-tertiary mt-0.5 thai-no-break">
                        {subtitle}
                    </p>
                )}
            </div>
            {children && (
                <div className="flex items-center gap-3">{children}</div>
            )}
        </div>
    );
}
