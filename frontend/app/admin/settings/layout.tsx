'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { MessageSquare, Send, Webhook, Puzzle } from 'lucide-react';

const tabs = [
    { href: '/admin/settings', label: 'Overview', icon: Puzzle, exact: true },
    { href: '/admin/settings/line', label: 'LINE', icon: MessageSquare },
    { href: '/admin/settings/telegram', label: 'Telegram', icon: Send },
    { href: '/admin/settings/n8n', label: 'n8n', icon: Webhook },
    { href: '/admin/settings/custom', label: 'Custom', icon: Puzzle },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const isActive = (tab: typeof tabs[number]) => {
        if (tab.exact) return pathname === tab.href;
        return pathname.startsWith(tab.href);
    };

    return (
        <div className="space-y-5 animate-in fade-in duration-500">
            {/* Tab Navigation */}
            <nav
                className={cn(
                    'flex items-center gap-1 overflow-x-auto',
                    'bg-surface border border-border-default rounded-xl p-1',
                    'shadow-sm',
                )}
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = isActive(tab);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                                active
                                    ? 'bg-white dark:bg-gray-700 text-text-primary shadow-sm'
                                    : 'text-text-tertiary hover:text-text-secondary hover:bg-gray-100/50 dark:hover:bg-gray-700/50',
                            )}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span>{tab.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Page Content */}
            {children}
        </div>
    );
}
