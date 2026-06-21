'use client';
// Client Component required: useAuth() reads JWT from localStorage for API calls.
// To convert to RSC, auth must migrate to httpOnly cookies.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Tag, User } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { SelectOption } from '@/components/ui/Select';
import { AdminSearchFilterBar } from '@/components/admin/AdminSearchFilterBar';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import {
    RichMenuAssignModal,
    type AssignableRichMenu,
} from '@/components/admin/RichMenuAssignModal';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import { logger } from '@/lib/logger';
import { readErrorMessage } from '@/lib/api-error';

interface Friend {
    line_user_id: string;
    display_name: string;
    picture_url?: string;
    friend_status: string;
    friend_since?: string;
    last_message_at?: string;
    chat_mode: string;
    refollow_count?: number;
    // Current per-user rich menu binding (null = on the default menu).
    rich_menu_id?: number | null;
    rich_menu_name?: string | null;
}

const API_BASE = '/api/v1';
const COLUMN_COUNT = 8;

export default function FriendsPage() {
    const { token } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [richMenus, setRichMenus] = useState<AssignableRichMenu[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [assignModal, setAssignModal] = useState<{
        open: boolean;
        mode: 'single' | 'bulk';
        friend: Friend | null;
    }>({ open: false, mode: 'single', friend: null });
    const [bulkUnassignOpen, setBulkUnassignOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const statusOptions: SelectOption[] = [
        { value: '', label: 'All Status' },
        { value: 'ACTIVE', label: 'Active' },
        { value: 'BLOCKED', label: 'Blocked' },
        { value: 'UNFOLLOWED', label: 'Unfollowed' },
    ];

    // Manual auth headers (NOT the global authFetch interceptor) — this page
    // already established the useAuth() token pattern; the assignment calls reuse it.
    const authHeaders = useMemo(() => {
        if (!token) {
            return {} as Record<string, string>;
        }
        return { Authorization: `Bearer ${token}` };
    }, [token]);
    const jsonHeaders = useMemo(
        () => ({ ...authHeaders, 'Content-Type': 'application/json' }),
        [authHeaders],
    );

    // Only synced menus are assignable (backend rejects unsynced with 409).
    const assignableMenus = useMemo(
        () => richMenus.filter((m) => !!m.line_rich_menu_id),
        [richMenus],
    );

    const fetchFriends = useCallback(async () => {
        setLoading(true);
        try {
            const query = statusFilter ? `?status=${statusFilter}` : '';
            const res = await fetch(`${API_BASE}/admin/friends${query}`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setFriends(data.friends);
            } else {
                logger.error('fetchFriends failed', { status: res.status });
            }
        } catch (error) {
            logger.error(error);
        } finally {
            setLoading(false);
        }
    }, [authHeaders, statusFilter]);

    const fetchRichMenus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setRichMenus(Array.isArray(data) ? data : []);
            } else {
                logger.error('fetchRichMenus failed', { status: res.status });
            }
        } catch (error) {
            logger.error('fetchRichMenus error', error);
        }
    }, [authHeaders]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    useEffect(() => {
        fetchRichMenus();
    }, [fetchRichMenus]);

    const filteredFriends = friends.filter(
        (f) =>
            f.display_name?.toLowerCase().includes(filter.toLowerCase()) ||
            f.line_user_id.toLowerCase().includes(filter.toLowerCase()),
    );

    // ---- Bulk selection (scoped to the rows currently visible) ----
    const visibleIds = filteredFriends.map((f) => f.line_user_id);
    const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    const toggleSelect = (id: string) =>
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    const toggleSelectAllVisible = () =>
        setSelectedIds((prev) => {
            const next = new Set(prev);
            // Derive from prev, not the render-time allVisibleSelected, so rapid
            // toggles never act on a stale snapshot.
            const allSelected =
                visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
            if (allSelected) {
                visibleIds.forEach((id) => next.delete(id));
            } else {
                visibleIds.forEach((id) => next.add(id));
            }
            return next;
        });

    const clearSelection = () => setSelectedIds(new Set());

    // ---- Assign / unassign actions ----
    const openSingleAssign = (friend: Friend) => {
        if (assignableMenus.length === 0) {
            toast({
                title: 'ยังไม่มีเมนูที่พร้อมใช้',
                description: 'ต้อง sync Rich Menu ไปยัง LINE ก่อนจึงจะกำหนดให้ผู้ใช้ได้',
                variant: 'warning',
            });
            return;
        }
        setAssignModal({ open: true, mode: 'single', friend });
    };

    const openBulkAssign = () => {
        if (assignableMenus.length === 0) {
            toast({
                title: 'ยังไม่มีเมนูที่พร้อมใช้',
                description: 'ต้อง sync Rich Menu ไปยัง LINE ก่อนจึงจะกำหนดให้ผู้ใช้ได้',
                variant: 'warning',
            });
            return;
        }
        setAssignModal({ open: true, mode: 'bulk', friend: null });
    };

    const closeAssignModal = () =>
        setAssignModal({ open: false, mode: 'single', friend: null });

    const submitAssign = async (richMenuId: number) => {
        setActionLoading(true);
        try {
            if (assignModal.mode === 'single' && assignModal.friend) {
                const res = await fetch(
                    `${API_BASE}/admin/rich-menus/${richMenuId}/users/${assignModal.friend.line_user_id}`,
                    { method: 'POST', headers: authHeaders },
                );
                if (!res.ok) throw new Error(await readErrorMessage(res, 'กำหนด Rich Menu ไม่สำเร็จ'));
                toast({ title: 'สำเร็จ', description: 'กำหนด Rich Menu เรียบร้อย', variant: 'success' });
            } else {
                const ids = Array.from(selectedIds);
                const res = await fetch(`${API_BASE}/admin/rich-menus/users/bulk-link`, {
                    method: 'POST',
                    headers: jsonHeaders,
                    body: JSON.stringify({ rich_menu_id: richMenuId, user_ids: ids }),
                });
                if (!res.ok)
                    throw new Error(await readErrorMessage(res, 'กำหนด Rich Menu แบบกลุ่มไม่สำเร็จ'));
                toast({
                    title: 'สำเร็จ',
                    description: `กำหนด Rich Menu ให้ ${ids.length} คนเรียบร้อย`,
                    variant: 'success',
                });
                clearSelection();
            }
            closeAssignModal();
            await fetchFriends();
        } catch (err) {
            logger.error('assign rich menu failed', err);
            toast({
                title: 'ผิดพลาด',
                description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
                variant: 'error',
            });
        } finally {
            setActionLoading(false);
        }
    };

    const submitUnassignSingle = async () => {
        const friend = assignModal.friend;
        if (!friend?.rich_menu_id) return;
        setActionLoading(true);
        try {
            const res = await fetch(
                `${API_BASE}/admin/rich-menus/${friend.rich_menu_id}/users/${friend.line_user_id}`,
                { method: 'DELETE', headers: authHeaders },
            );
            if (!res.ok) throw new Error(await readErrorMessage(res, 'ยกเลิกการกำหนดไม่สำเร็จ'));
            toast({ title: 'สำเร็จ', description: 'ยกเลิกการกำหนด Rich Menu เรียบร้อย', variant: 'success' });
            closeAssignModal();
            await fetchFriends();
        } catch (err) {
            logger.error('unassign rich menu failed', err);
            toast({
                title: 'ผิดพลาด',
                description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
                variant: 'error',
            });
        } finally {
            setActionLoading(false);
        }
    };

    const submitBulkUnassign = async () => {
        setActionLoading(true);
        try {
            const ids = Array.from(selectedIds);
            const res = await fetch(`${API_BASE}/admin/rich-menus/users/bulk-unlink`, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ user_ids: ids }),
            });
            if (!res.ok)
                throw new Error(await readErrorMessage(res, 'ยกเลิกการกำหนดแบบกลุ่มไม่สำเร็จ'));
            toast({
                title: 'สำเร็จ',
                description: `ยกเลิกการกำหนดให้ ${ids.length} คนเรียบร้อย`,
                variant: 'success',
            });
            clearSelection();
            setBulkUnassignOpen(false);
            await fetchFriends();
        } catch (err) {
            logger.error('bulk unassign failed', err);
            toast({
                title: 'ผิดพลาด',
                description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
                variant: 'error',
            });
        } finally {
            setActionLoading(false);
        }
    };

    const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
    const selectAllHeader = (
        <Checkbox
            checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
            onCheckedChange={toggleSelectAllVisible}
            aria-label="เลือกทั้งหมดในหน้านี้"
            className="mx-auto"
        />
    );

    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'select', label: selectAllHeader, align: 'center', className: 'px-4 py-4 w-10' },
        { key: 'user', label: 'User', className: 'px-6 py-4' },
        { key: 'rich_menu', label: 'Rich Menu', className: 'px-6 py-4' },
        { key: 'status', label: 'Status', className: 'px-6 py-4' },
        { key: 'chat_mode', label: 'Chat Mode', className: 'px-6 py-4' },
        { key: 'since', label: 'Since', className: 'px-6 py-4' },
        { key: 'last_active', label: 'Last Active', className: 'px-6 py-4' },
        { key: 'actions', label: 'Actions', align: 'right', className: 'px-6 py-4' },
    ];

    return (
        <div className="max-w-7xl mx-auto thai-text">
            <PageHeader title="ประวัติเพื่อน" subtitle="ประวัติการเพิ่มเพื่อนและการเปลี่ยนแปลง" className="mb-6">
                <Link
                    href="/admin/friends/history"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50 transition-colors text-sm font-medium"
                >
                    <History className="w-4 h-4" />
                    <span className="thai-no-break">ประวัติ</span>
                </Link>
            </PageHeader>

            <div className="mb-6">
                <AdminSearchFilterBar
                    searchValue={filter}
                    onSearchChange={setFilter}
                    statusValue={statusFilter ?? ''}
                    onStatusChange={(value) => {
                        // Status change refetches a different user set — drop the
                        // selection so bulk actions never target now-hidden users.
                        setStatusFilter(value || null);
                        clearSelection();
                    }}
                    searchPlaceholder="Search users..."
                    statusOptions={statusOptions}
                    showCategory={false}
                />
            </div>

            {selectedIds.size > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900/50 dark:bg-brand-900/20">
                    <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
                        เลือก {selectedIds.size} คน
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            leftIcon={<Tag className="w-4 h-4" />}
                            onClick={openBulkAssign}
                            disabled={actionLoading}
                        >
                            กำหนด Rich Menu
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setBulkUnassignOpen(true)}
                            disabled={actionLoading}
                        >
                            ยกเลิกการกำหนด
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clearSelection} disabled={actionLoading}>
                            ล้างการเลือก
                        </Button>
                    </div>
                </div>
            )}

            <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <AdminTableHead columns={tableColumns} rowClassName="text-text-secondary" />
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={COLUMN_COUNT} className="px-6 py-12 text-center">
                                        <LoadingSpinner size="sm" label="กำลังโหลด..." fullPage={false} />
                                    </td>
                                </tr>
                            ) : filteredFriends.length === 0 ? (
                                <tr>
                                    <td colSpan={COLUMN_COUNT} className="px-6 py-12 text-center text-text-secondary">
                                        No users found.
                                    </td>
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
                                        <td
                                            className="px-4 py-4 text-center"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                checked={selectedIds.has(friend.line_user_id)}
                                                onCheckedChange={() => toggleSelect(friend.line_user_id)}
                                                aria-label={`เลือก ${friend.display_name || friend.line_user_id}`}
                                                className="mx-auto"
                                            />
                                        </td>
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
                                            {friend.rich_menu_name ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                                                    <Tag className="w-3 h-3" />
                                                    {friend.rich_menu_name}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-text-tertiary">เมนูหลัก</span>
                                            )}
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
                                            {friend.friend_since ? new Date(friend.friend_since).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                                            {friend.last_message_at ? new Date(friend.last_message_at).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td
                                            className="px-6 py-4 whitespace-nowrap text-right"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Button
                                                size="xs"
                                                variant="outline"
                                                leftIcon={<Tag className="w-3.5 h-3.5" />}
                                                onClick={() => openSingleAssign(friend)}
                                            >
                                                Rich Menu
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <RichMenuAssignModal
                key={
                    assignModal.open
                        ? `${assignModal.mode}-${assignModal.friend?.line_user_id ?? 'bulk'}`
                        : 'closed'
                }
                isOpen={assignModal.open}
                onClose={closeAssignModal}
                menus={assignableMenus}
                mode={assignModal.mode}
                friend={assignModal.friend}
                selectedCount={selectedIds.size}
                loading={actionLoading}
                onAssign={submitAssign}
                onUnassign={submitUnassignSingle}
            />

            <ConfirmDialog
                isOpen={bulkUnassignOpen}
                onClose={() => setBulkUnassignOpen(false)}
                onConfirm={submitBulkUnassign}
                title="ยืนยันการยกเลิก"
                description={`ยกเลิกการกำหนด Rich Menu ให้ ${selectedIds.size} คน? ผู้ใช้จะกลับไปใช้เมนูหลัก`}
                confirmText="ยกเลิกการกำหนด"
                cancelText="ปิด"
                variant="warning"
                isLoading={actionLoading}
            />
        </div>
    );
}
