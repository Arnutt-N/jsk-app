'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import PageHeader from '@/app/admin/components/PageHeader';
import {
    MessageSquare,
    Send,
    Webhook,
    Puzzle,
    ChevronRight,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ProviderStatus {
    provider: string;
    name: string;
    is_connected: boolean;
    credential_id: number | null;
}

const providerMeta: Record<string, { icon: React.ElementType; href: string; description: string }> = {
    LINE: {
        icon: MessageSquare,
        href: '/admin/settings/line',
        description: 'LINE Official Account messaging credentials',
    },
    TELEGRAM: {
        icon: Send,
        href: '/admin/settings/telegram',
        description: 'Telegram Bot สำหรับแจ้งเตือนและ notifications',
    },
    N8N: {
        icon: Webhook,
        href: '/admin/settings/n8n',
        description: 'n8n workflow automation webhooks',
    },
    CUSTOM: {
        icon: Puzzle,
        href: '/admin/settings/custom',
        description: 'Custom API / Webhook integrations',
    },
};

export default function SettingsOverviewPage() {
    const { token } = useAuth();
    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }, [token]);

    const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

    const fetchOverview = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/admin/settings/overview`, { headers: authHeaders });
            if (res.ok) {
                setStatuses(await res.json());
            } else {
                setError('ไม่สามารถโหลดข้อมูลได้');
            }
        } catch (err: unknown) {
            console.error('[settings] โหลด overview ล้มเหลว:', err);
            setError('ไม่สามารถโหลดข้อมูลได้');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    if (loading) {
        return <LoadingSpinner label="Loading integrations..." />;
    }

    return (
        <div className="thai-text space-y-5">
            {error && <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl text-sm mb-4">{error}</div>}

            <PageHeader
                title="Settings Overview"
                subtitle="ภาพรวมของ Integrations ทั้งหมดในระบบ"
            >
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                    onClick={fetchOverview}
                >
                    Refresh
                </Button>
            </PageHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {statuses.map((s) => {
                    const meta = providerMeta[s.provider] ?? providerMeta.CUSTOM;
                    const Icon = meta.icon;

                    return (
                        <Link key={s.provider} href={meta.href}>
                            <Card hover="border" className="h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                                                <Icon className="w-5 h-5 text-brand-500" />
                                            </div>
                                            <div>
                                                <CardTitle>{s.name}</CardTitle>
                                                <CardDescription>{meta.description}</CardDescription>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-text-tertiary" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Badge variant={s.is_connected ? 'success' : 'gray'} size="sm">
                                        {s.is_connected ? 'Connected' : 'Not configured'}
                                    </Badge>
                                </CardContent>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
