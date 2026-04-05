'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    ShieldX,
    User,
    UserCheck,
    UserMinus,
    UserPlus,
    Users,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import type { SelectOption } from '@/components/ui/Select';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';

interface FriendEvent {
    id: number;
    line_user_id: string;
    event_type: string;
    source: string;
    refollow_count: number;
    event_data: Record<string, unknown> | null;
    created_at: string;
    display_name: string | null;
    picture_url: string | null;
}

interface FriendStats {
    total_followers: number;
    total_blocked: number;
    total_unfollowed: number;
    total_refollows: number;
    refollow_rate: number;
    refollow_breakdown: { count: number; users: number }[];
}

const EVENT_CONFIG: Record<string, { label: string; thaiLabel: string; color: string; bgColor: string; icon: React.ElementType }> = {
    FOLLOW: {
        label: 'Follow',
        thaiLabel: 'เพิ่มเพื่อน',
        color: 'text-green-700 dark:text-green-300',
        bgColor: 'bg-green-100 dark:bg-green-900/50',
        icon: UserPlus,
    },
    UNFOLLOW: {
        label: 'Unfollow',
        thaiLabel: 'เลิกติดตาม',
        color: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-100 dark:bg-amber-900/50',
        icon: UserMinus,
    },
    BLOCK: {
        label: 'Block',
        thaiLabel: 'บล็อค',
        color: 'text-red-700 dark:text-red-300',
        bgColor: 'bg-red-100 dark:bg-red-900/50',
        icon: ShieldX,
    },
    UNBLOCK: {
        label: 'Unblock',
        thaiLabel: 'ปลดบล็อค',
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        icon: UserCheck,
    },
    REFOLLOW: {
        label: 'Re-follow',
        thaiLabel: 'กลับมาเป็นเพื่อน',
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        icon: RefreshCw,
    },
};

function formatThaiDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const perPage = 20;

export default function FriendHistoryPage() {
    const { token } = useAuth();
    const [events, setEvents] = useState<FriendEvent[]>([]);
    const [stats, setStats] = useState<FriendStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [eventTypeFilter, setEventTypeFilter] = useState('');
    const [searchFilter, setSearchFilter] = useState('');

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const authHeaders = useMemo(() => {
        if (!token) return {} as Record<string, string>;
        return { Authorization: `Bearer ${token}` };
    }, [token]);

    const eventTypeOptions: SelectOption[] = [
        { value: '', label: 'ทุกประเภท' },
        { value: 'FOLLOW', label: 'เพิ่มเพื่อน (Follow)' },
        { value: 'UNFOLLOW', label: 'เลิกติดตาม (Unfollow)' },
        { value: 'BLOCK', label: 'บล็อค (Block)' },
        { value: 'REFOLLOW', label: 'กลับมาเป็นเพื่อน (Re-follow)' },
    ];

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/friends/stats`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }, [API_BASE, authHeaders]);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                per_page: String(perPage),
            });
            if (eventTypeFilter) params.set('event_type', eventTypeFilter);
            if (searchFilter) params.set('line_user_id', searchFilter);

            const res = await fetch(`${API_BASE}/admin/friends/history?${params.toString()}`, {
                headers: authHeaders,
            });
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
                setTotal(data.total);
                setTotalPages(data.total_pages);
            }
        } catch (error) {
            console.error('Failed to fetch events:', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders, page, perPage, eventTypeFilter, searchFilter]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useEffect(() => {
        setPage(1);
    }, [eventTypeFilter, searchFilter]);

    return (
        <div className="p-6 max-w-7xl mx-auto thai-text">
            {/* Header */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/friends"
                        className="p-2 rounded-xl hover:bg-surface-hover transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-text-secondary" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary tracking-tight thai-no-break">
                            ประวัติเพื่อน
                        </h1>
                        <p className="text-text-secondary text-sm thai-no-break">
                            Friend History - Track follow, unfollow, and re-follow events
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-surface rounded-2xl shadow-sm border border-border p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/50">
                                <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-text-primary">
                            {stats.total_followers.toLocaleString()}
                        </p>
                        <p className="text-xs text-text-secondary thai-no-break">ผู้ติดตามทั้งหมด</p>
                    </div>

                    <div className="bg-surface rounded-2xl shadow-sm border border-border p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/50">
                                <ShieldX className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-text-primary">
                            {stats.total_blocked.toLocaleString()}
                        </p>
                        <p className="text-xs text-text-secondary thai-no-break">บล็อคแล้ว</p>
                    </div>

                    <div className="bg-surface rounded-2xl shadow-sm border border-border p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/50">
                                <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-text-primary">
                            {stats.total_refollows.toLocaleString()}
                        </p>
                        <p className="text-xs text-text-secondary thai-no-break">กลับมาใหม่</p>
                    </div>

                    <div className="bg-surface rounded-2xl shadow-sm border border-border p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-xl bg-brand-100 dark:bg-brand-900/50">
                                <UserCheck className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-text-primary">
                            {stats.refollow_rate}%
                        </p>
                        <p className="text-xs text-text-secondary thai-no-break">อัตราการกลับมา</p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <Input
                            placeholder="ค้นหาด้วย LINE User ID..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            variant="filled"
                            className="thai-no-break"
                        />
                    </div>
                    <div className="md:col-span-1">
                        <Select
                            value={eventTypeFilter}
                            onChange={(e) => setEventTypeFilter(e.target.value)}
                            options={eventTypeOptions}
                            variant="filled"
                        />
                    </div>
                    <div className="md:col-span-1 flex items-center text-sm text-text-secondary">
                        ทั้งหมด {total.toLocaleString()} รายการ
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-text-secondary">Loading...</div>
                ) : events.length === 0 ? (
                    <div className="p-12 text-center text-text-secondary">ไม่พบข้อมูล</div>
                ) : (
                    <div className="divide-y divide-border">
                        {events.map((event) => {
                            const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.FOLLOW;
                            const IconComponent = config.icon;
                            const isRefollow = event.event_type === 'REFOLLOW';

                            return (
                                <div
                                    key={event.id}
                                    className="flex items-center gap-4 px-6 py-4 hover:bg-surface-hover transition-colors"
                                >
                                    {/* Icon */}
                                    <div className={`flex-shrink-0 p-2.5 rounded-xl ${config.bgColor}`}>
                                        <IconComponent className={`w-5 h-5 ${config.color}`} />
                                    </div>

                                    {/* User info */}
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-surface-secondary overflow-hidden flex-shrink-0">
                                            {event.picture_url ? (
                                                <Image
                                                    src={event.picture_url}
                                                    alt={event.display_name || 'User avatar'}
                                                    width={36}
                                                    height={36}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-text-secondary">
                                                    <User className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-text-primary truncate">
                                                {event.display_name || 'LINE User'}
                                            </p>
                                            <p className="text-xs text-text-secondary font-mono truncate">
                                                {event.line_user_id.substring(0, 12)}...
                                            </p>
                                        </div>
                                    </div>

                                    {/* Event type */}
                                    <div className="flex-shrink-0 text-right">
                                        <span
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${config.bgColor} ${config.color}`}
                                        >
                                            {isRefollow
                                                ? `${config.thaiLabel} ครั้งที่ ${event.refollow_count}`
                                                : config.thaiLabel}
                                        </span>
                                    </div>

                                    {/* Timestamp */}
                                    <div className="flex-shrink-0 text-right hidden sm:block">
                                        <p className="text-sm text-text-secondary whitespace-nowrap">
                                            {formatThaiDate(event.created_at)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                        <p className="text-sm text-text-secondary">
                            หน้า {page} จาก {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 rounded-lg hover:bg-surface-hover disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg hover:bg-surface-hover disabled:opacity-30 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
