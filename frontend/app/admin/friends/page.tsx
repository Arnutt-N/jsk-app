'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, MoreVertical, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { SelectOption } from '@/components/ui/Select';
import { AdminSearchFilterBar } from '@/components/admin/AdminSearchFilterBar';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import { useAuth } from '@/contexts/AuthContext';

interface Friend {
    line_user_id: string;
    display_name: string;
    picture_url?: string;
    friend_status: string;
    friend_since?: string;
    last_message_at?: string;
    chat_mode: string;
    refollow_count?: number;
}

export default function FriendsPage() {
    const { token } = useAuth();
    const router = useRouter();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const statusOptions: SelectOption[] = [
        { value: '', label: 'All Status' },
        { value: 'ACTIVE', label: 'Active' },
        { value: 'BLOCKED', label: 'Blocked' },
        { value: 'UNFOLLOWED', label: 'Unfollowed' },
    ];
    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'user', label: 'User', className: 'px-6 py-4' },
        { key: 'status', label: 'Status', className: 'px-6 py-4' },
        { key: 'chat_mode', label: 'Chat Mode', className: 'px-6 py-4' },
        { key: 'since', label: 'Since', className: 'px-6 py-4' },
        { key: 'last_active', label: 'Last Active', className: 'px-6 py-4' },
        { key: 'actions', label: 'Actions', align: 'right', className: 'px-6 py-4' },
    ];

    const API_BASE = '/api/v1';
    const authHeaders = useMemo(() => {
        if (!token) {
            return {} as Record<string, string>;
        }
        return { Authorization: `Bearer ${token}` };
    }, [token]);

    const fetchFriends = useCallback(async () => {
        setLoading(true);
        try {
            const query = statusFilter ? `?status=${statusFilter}` : '';
            const res = await fetch(`${API_BASE}/admin/friends${query}`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setFriends(data.friends);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders, statusFilter]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    const filteredFriends = friends.filter(f =>
        f.display_name?.toLowerCase().includes(filter.toLowerCase()) ||
        f.line_user_id.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto thai-text">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary tracking-tight thai-no-break">ประวัติเพื่อน</h1>
                    <p className="text-text-secondary text-sm thai-no-break">ประวัติการเพิ่มเพื่อนและการเปลี่ยนแปลง</p>
                </div>
                <Link
                    href="/admin/friends/history"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50 transition-colors text-sm font-medium"
                >
                    <History className="w-4 h-4" />
                    <span className="thai-no-break">ประวัติ</span>
                </Link>
            </div>

            <div className="mb-6">
                <AdminSearchFilterBar
                    searchValue={filter}
                    onSearchChange={setFilter}
                    statusValue={statusFilter ?? ''}
                    onStatusChange={(value) => setStatusFilter(value || null)}
                    searchPlaceholder="Search users..."
                    statusOptions={statusOptions}
                    showCategory={false}
                />
            </div>

            <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <AdminTableHead columns={tableColumns} rowClassName="text-text-secondary" />
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <LoadingSpinner size="sm" label="กำลังโหลด..." fullPage={false} />
                                    </td>
                                </tr>
                            ) : filteredFriends.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">No users found.</td>
                                </tr>
                            ) : (
                                filteredFriends.map((friend) => (
                                    <tr
                                        key={friend.line_user_id}
                                        className="hover:bg-surface-hover transition-colors cursor-pointer"
                                        onClick={() => router.push(`/admin/friends/${friend.line_user_id}`)}
                                        role="link"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                router.push(`/admin/friends/${friend.line_user_id}`);
                                            }
                                        }}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-surface-secondary overflow-hidden">
                                                    {friend.picture_url ? (
                                                        <Image src={friend.picture_url} alt={friend.display_name || 'Friend avatar'} width={40} height={40} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-text-secondary">
                                                            <User className="w-5 h-5" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-text-primary">{friend.display_name || 'Unknown'}</span>
                                                        {(friend.refollow_count ?? 0) > 0 && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                                                                <RefreshCw className="w-3 h-3" />
                                                                กลับมา {friend.refollow_count} ครั้ง
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-text-secondary font-mono">{friend.line_user_id.substring(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${friend.friend_status === 'ACTIVE' ? 'bg-success/12 text-success' :
                                                    friend.friend_status === 'BLOCKED' ? 'bg-danger/12 text-danger' :
                                                        'bg-surface-secondary text-text-secondary'
                                                }`}>
                                                {friend.friend_status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${friend.chat_mode === 'HUMAN' ? 'bg-primary/12 text-primary' : 'bg-surface-secondary text-text-secondary'
                                                }`}>
                                                {friend.chat_mode}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                                            {friend.friend_since ? new Date(friend.friend_since).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                                            {friend.last_message_at ? new Date(friend.last_message_at).toLocaleString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <button className="text-text-secondary hover:text-primary transition-colors">
                                                <MoreVertical className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
