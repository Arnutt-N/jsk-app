'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
    Plus,
    Send,
    Clock,
    CheckCircle2,
    AlertCircle,
    XCircle,
    FileText,
    Calendar,
    Eye,
    Trash2,
    Loader2,
    Radio,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import PageHeader from '@/app/admin/components/PageHeader';

interface Broadcast {
    id: number;
    title: string;
    message_type: string;
    content: Record<string, unknown>;
    target_audience: string;
    target_filter: Record<string, unknown> | null;
    scheduled_at: string | null;
    sent_at: string | null;
    status: string;
    total_recipients: number;
    success_count: number;
    failure_count: number;
    created_by: number | null;
    created_at: string | null;
    updated_at: string | null;
}

const STATUS_MAP: Record<string, { variant: 'gray' | 'info' | 'warning' | 'success' | 'danger'; label: string; icon: React.ReactNode }> = {
    draft:     { variant: 'gray',    label: 'แบบร่าง',       icon: <FileText className="w-3 h-3" /> },
    scheduled: { variant: 'info',    label: 'ตั้งเวลาแล้ว', icon: <Clock className="w-3 h-3" /> },
    sending:   { variant: 'warning', label: 'กำลังส่ง',      icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    completed: { variant: 'success', label: 'ส่งแล้ว',       icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:    { variant: 'danger',  label: 'ล้มเหลว',       icon: <AlertCircle className="w-3 h-3" /> },
    cancelled: { variant: 'gray',    label: 'ยกเลิก',        icon: <XCircle className="w-3 h-3" /> },
};

const TYPE_LABELS: Record<string, string> = {
    text: 'ข้อความ',
    image: 'รูปภาพ',
    flex: 'Flex Message',
    multi: 'หลายประเภท',
};

export default function BroadcastListPage() {
    const { token } = useAuth();
    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }, [token]);

    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(0);
    const pageSize = 20;

    const [fetchError, setFetchError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Broadcast | null>(null);
    const [sendTarget, setSendTarget] = useState<Broadcast | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const API_BASE = '/api/v1';

    const fetchBroadcasts = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            params.append('skip', String(page * pageSize));
            params.append('limit', String(pageSize));

            const res = await fetch(`${API_BASE}/admin/broadcasts?${params.toString()}`, { headers: authHeaders });
            if (!res.ok) throw new Error('Failed to fetch broadcasts');
            const data = await res.json();
            setBroadcasts(data.items);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
            setFetchError('ไม่สามารถโหลดรายการ Broadcast ได้');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, statusFilter, page, authHeaders]);

    useEffect(() => {
        void fetchBroadcasts();
    }, [fetchBroadcasts]);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/broadcasts/${deleteTarget.id}`, { method: 'DELETE', headers: authHeaders });
            if (!res.ok) throw new Error('Failed to delete');
            setDeleteTarget(null);
            fetchBroadcasts();
        } catch (err) {
            console.error(err);
            alert('ลบไม่สำเร็จ');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendNow = async () => {
        if (!sendTarget) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/broadcasts/${sendTarget.id}/send`, { method: 'POST', headers: authHeaders });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to send');
            }
            setSendTarget(null);
            fetchBroadcasts();
        } catch (err: unknown) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
        } finally {
            setActionLoading(false);
        }
    };

    const getStatus = (status: string) => STATUS_MAP[status] || STATUS_MAP.draft;

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="ส่งข้อความแบบกระจาย" subtitle="สร้างและจัดการข้อความ Broadcast ถึงผู้ติดตาม LINE OA">
                <Link href="/admin/chatbot/broadcast/new">
                    <Button className="gap-2">
                        <Plus className="w-4 h-4" />
                        สร้างข้อความ
                    </Button>
                </Link>
            </PageHeader>

            {/* Filter */}
            <Card glass className="border-none shadow-sm">
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                            options={[
                                { value: '', label: 'ทุกสถานะ' },
                                { value: 'draft', label: 'แบบร่าง' },
                                { value: 'scheduled', label: 'ตั้งเวลาแล้ว' },
                                { value: 'sending', label: 'กำลังส่ง' },
                                { value: 'completed', label: 'ส่งแล้ว' },
                                { value: 'failed', label: 'ล้มเหลว' },
                                { value: 'cancelled', label: 'ยกเลิก' },
                            ]}
                        />
                    </div>
                </CardContent>
            </Card>

            {fetchError && <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl text-sm mb-4">{fetchError}</div>}

            {/* Table */}
            <Card glass className="border-none shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-bg/50 border-b border-border-default text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                <th className="px-6 py-4">ชื่อแคมเปญ</th>
                                <th className="px-6 py-4">ประเภท</th>
                                <th className="px-6 py-4">สถานะ</th>
                                <th className="px-6 py-4">ผู้รับ</th>
                                <th className="px-6 py-4">วันที่ส่ง</th>
                                <th className="px-6 py-4 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default bg-surface/40">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-8">
                                            <div className="h-4 bg-muted rounded-full w-3/4 mb-3" />
                                            <div className="h-3 bg-muted/50 rounded-full w-1/2" />
                                        </td>
                                    </tr>
                                ))
                            ) : broadcasts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3 text-text-tertiary">
                                            <Radio className="w-12 h-12 opacity-20" />
                                            <p className="text-sm">ยังไม่มีข้อความ Broadcast</p>
                                            <Link href="/admin/chatbot/broadcast/new">
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <Plus className="w-4 h-4" />
                                                    สร้างข้อความแรก
                                                </Button>
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ) : broadcasts.map((b) => {
                                const s = getStatus(b.status);
                                return (
                                    <tr key={b.id} className="hover:bg-bg/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-brand-500/10 text-brand-600 rounded-lg flex items-center justify-center shrink-0 dark:bg-brand-500/20 dark:text-brand-400">
                                                    <Send className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-text-secondary">{b.title}</div>
                                                    <div className="text-xs text-text-tertiary mt-0.5">
                                                        {b.target_audience === 'all' ? 'ผู้ติดตามทั้งหมด' : 'เฉพาะกลุ่ม'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-text-secondary">
                                                {TYPE_LABELS[b.message_type] || b.message_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant={s.variant} className="gap-1.5 py-1 px-2.5">
                                                {s.icon}
                                                {s.label}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-text-secondary">
                                                {b.status === 'completed' ? (
                                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                                        {b.success_count.toLocaleString()} สำเร็จ
                                                        {b.failure_count > 0 && (
                                                            <span className="text-red-500 ml-1">/ {b.failure_count} ล้มเหลว</span>
                                                        )}
                                                    </span>
                                                ) : b.total_recipients > 0 ? (
                                                    `${b.total_recipients.toLocaleString()} คน`
                                                ) : (
                                                    <span className="text-text-tertiary">-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
                                                <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                                                {b.sent_at ? (
                                                    new Date(b.sent_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                                                ) : b.scheduled_at ? (
                                                    <span className="text-brand-600 dark:text-brand-400">
                                                        {new Date(b.scheduled_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                ) : (
                                                    <span className="text-text-tertiary">-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Link href={`/admin/chatbot/broadcast/${b.id}`}>
                                                    <ActionIconButton icon={<Eye className="w-4 h-4" />} label="ดูรายละเอียด" variant="default" />
                                                </Link>
                                                {b.status === 'draft' && (
                                                    <ActionIconButton
                                                        icon={<Send className="w-4 h-4" />}
                                                        label="ส่งเลย"
                                                        variant="warning"
                                                        onClick={() => setSendTarget(b)}
                                                    />
                                                )}
                                                {(b.status === 'draft' || b.status === 'cancelled') && (
                                                    <ActionIconButton
                                                        icon={<Trash2 className="w-4 h-4" />}
                                                        label="ลบ"
                                                        variant="danger"
                                                        onClick={() => setDeleteTarget(b)}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-border-default bg-bg/30 flex items-center justify-between">
                    <p className="text-xs text-text-tertiary font-medium">
                        ทั้งหมด {total} รายการ
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-xs text-text-tertiary">
                            {page + 1} / {totalPages || 1}
                        </span>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Delete confirmation modal */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="ยืนยันการลบ" maxWidth="sm">
                <div className="space-y-4">
                    <p className="text-sm text-text-secondary">
                        คุณต้องการลบข้อความ <b>{deleteTarget?.title}</b> ใช่หรือไม่?
                        <br /><span className="text-xs text-red-500 mt-2 block">* การกระทำนี้ไม่สามารถย้อนกลับได้</span>
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
                        <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
                            {actionLoading ? 'กำลังลบ...' : 'ยืนยันลบ'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Send confirmation modal */}
            <Modal isOpen={!!sendTarget} onClose={() => setSendTarget(null)} title="ยืนยันการส่ง" maxWidth="sm">
                <div className="space-y-4">
                    <p className="text-sm text-text-secondary">
                        คุณต้องการส่งข้อความ <b>{sendTarget?.title}</b> ถึงผู้ติดตามทั้งหมดเลยใช่หรือไม่?
                        <br /><span className="text-xs text-amber-600 mt-2 block">* เมื่อส่งแล้วไม่สามารถยกเลิกได้</span>
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setSendTarget(null)}>ยกเลิก</Button>
                        <Button onClick={handleSendNow} disabled={actionLoading} className="gap-2">
                            <Send className="w-4 h-4" />
                            {actionLoading ? 'กำลังส่ง...' : 'ส่งเลย'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
