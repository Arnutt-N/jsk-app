'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
    ArrowLeft,
    Send,
    Clock,
    CheckCircle2,
    AlertCircle,
    XCircle,
    FileText,
    Calendar,
    Users,
    Loader2,
    Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import PageHeader from '@/app/admin/components/PageHeader';

interface BroadcastDetail {
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

const STATUS_CONFIG: Record<string, { variant: 'gray' | 'info' | 'warning' | 'success' | 'danger'; label: string; icon: React.ReactNode }> = {
    draft:     { variant: 'gray',    label: 'แบบร่าง',       icon: <FileText className="w-4 h-4" /> },
    scheduled: { variant: 'info',    label: 'ตั้งเวลาแล้ว', icon: <Clock className="w-4 h-4" /> },
    sending:   { variant: 'warning', label: 'กำลังส่ง',      icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    completed: { variant: 'success', label: 'ส่งสำเร็จ',     icon: <CheckCircle2 className="w-4 h-4" /> },
    failed:    { variant: 'danger',  label: 'ล้มเหลว',       icon: <AlertCircle className="w-4 h-4" /> },
    cancelled: { variant: 'gray',    label: 'ยกเลิกแล้ว',    icon: <XCircle className="w-4 h-4" /> },
};

const TYPE_LABELS: Record<string, string> = {
    text: 'ข้อความ',
    image: 'รูปภาพ',
    flex: 'Flex Message',
    multi: 'หลายประเภท',
};

export default function BroadcastDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { token } = useAuth();
    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }, [token]);
    const broadcastId = params.id as string;
    const API_BASE = '/api/v1';

    const [broadcast, setBroadcast] = useState<BroadcastDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [sendModal, setSendModal] = useState(false);
    const [cancelModal, setCancelModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState(false);

    const fetchBroadcast = useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`${API_BASE}/admin/broadcasts/${broadcastId}`, { headers: authHeaders });
            if (!res.ok) throw new Error('Not found');
            const data = await res.json();
            setBroadcast(data);
        } catch (err) {
            console.error(err);
            setFetchError('ไม่สามารถโหลดข้อมูล Broadcast ได้');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, broadcastId, authHeaders]);

    useEffect(() => {
        void fetchBroadcast();
    }, [fetchBroadcast]);

    const handleSend = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/broadcasts/${broadcastId}/send`, { method: 'POST', headers: authHeaders });
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }
            setSendModal(false);
            fetchBroadcast();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/broadcasts/${broadcastId}/cancel`, { method: 'POST', headers: authHeaders });
            if (!res.ok) throw new Error('Failed');
            setCancelModal(false);
            fetchBroadcast();
        } catch {
            alert('ยกเลิกไม่สำเร็จ');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/broadcasts/${broadcastId}`, { method: 'DELETE', headers: authHeaders });
            if (!res.ok) throw new Error('Failed');
            router.push('/admin/chatbot/broadcast');
        } catch {
            alert('ลบไม่สำเร็จ');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 thai-text">
                <PageHeader title="รายละเอียด Broadcast" />
                <Card glass className="border-none shadow-sm">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-center gap-3 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">กำลังโหลด...</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!broadcast) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 thai-text">
                <PageHeader title="ไม่พบข้อมูล" />
                {fetchError && <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl text-sm mb-4">{fetchError}</div>}
                <Card glass className="border-none shadow-sm">
                    <CardContent className="p-8 text-center">
                        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">{fetchError || 'ไม่พบข้อมูล Broadcast นี้'}</p>
                        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/chatbot/broadcast')}>
                            กลับไปรายการ
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const statusInfo = STATUS_CONFIG[broadcast.status] || STATUS_CONFIG.draft;
    const content = broadcast.content as Record<string, unknown>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title={broadcast.title} subtitle="รายละเอียดข้อความ Broadcast">
                <Button variant="outline" size="sm" onClick={() => router.push('/admin/chatbot/broadcast')} className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    กลับ
                </Button>
            </PageHeader>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main info */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Status & Info Card */}
                    <Card glass className="border-none shadow-sm">
                        <CardContent className="p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <Badge variant={statusInfo.variant} size="lg" className="gap-2 py-1.5 px-4">
                                    {statusInfo.icon}
                                    {statusInfo.label}
                                </Badge>
                                <span className="text-xs text-text-tertiary">ID: {broadcast.id}</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-text-tertiary">ประเภทข้อความ</label>
                                    <p className="text-sm font-medium text-text-primary mt-0.5">{TYPE_LABELS[broadcast.message_type] || broadcast.message_type}</p>
                                </div>
                                <div>
                                    <label className="text-xs text-text-tertiary">กลุ่มเป้าหมาย</label>
                                    <p className="text-sm font-medium text-text-primary mt-0.5 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-gray-400" />
                                        {broadcast.target_audience === 'all' ? 'ผู้ติดตามทั้งหมด' : 'เฉพาะกลุ่ม'}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-xs text-text-tertiary">วันที่สร้าง</label>
                                    <p className="text-sm font-medium text-text-primary mt-0.5 flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                        {broadcast.created_at ? new Date(broadcast.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </p>
                                </div>
                                {broadcast.sent_at && (
                                    <div>
                                        <label className="text-xs text-text-tertiary">วันที่ส่ง</label>
                                        <p className="text-sm font-medium text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1.5">
                                            <Send className="w-3.5 h-3.5" />
                                            {new Date(broadcast.sent_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                )}
                                {broadcast.scheduled_at && broadcast.status === 'scheduled' && (
                                    <div>
                                        <label className="text-xs text-text-tertiary">กำหนดส่ง</label>
                                        <p className="text-sm font-medium text-brand-600 dark:text-brand-400 mt-0.5 flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(broadcast.scheduled_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Content Preview Card */}
                    <Card glass className="border-none shadow-sm">
                        <CardContent className="p-6">
                            <h3 className="text-sm font-bold text-text-primary mb-4">เนื้อหาข้อความ</h3>

                            {broadcast.message_type === 'text' && (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                                    <p className="text-sm text-text-primary whitespace-pre-wrap">{String(content.text || '')}</p>
                                </div>
                            )}

                            {broadcast.message_type === 'image' && Boolean(content.original_url) && (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={String(content.original_url)} alt="Broadcast image" className="rounded-lg max-w-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                            )}

                            {broadcast.message_type === 'flex' && Boolean(content.flex) && (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                                    <pre className="text-xs font-mono text-text-secondary overflow-auto max-h-64">{JSON.stringify(content.flex, null, 2)}</pre>
                                </div>
                            )}

                            {broadcast.message_type === 'multi' && Array.isArray(content.messages) && (
                                <div className="space-y-3">
                                    {(content.messages as Array<Record<string, unknown>>).map((msg, i) => (
                                        <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                                            <span className="text-xs text-text-tertiary">ข้อความ {i + 1} ({String(msg.type)})</span>
                                            {msg.type === 'text' && <p className="text-sm text-text-primary mt-1">{String(msg.text || '')}</p>}
                                            {msg.type === 'image' && Boolean(msg.original_url) && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={String(msg.original_url)} alt={`msg ${i}`} className="rounded-lg max-w-xs mt-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            )}
                                            {msg.type === 'flex' && <pre className="text-xs font-mono mt-1 overflow-auto max-h-32">{JSON.stringify(msg.flex, null, 2)}</pre>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Delivery Stats */}
                    <Card glass className="border-none shadow-sm">
                        <CardContent className="p-6">
                            <h3 className="text-sm font-bold text-text-primary mb-4">สถิติการส่ง</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-text-tertiary">จำนวนผู้รับทั้งหมด</span>
                                    <span className="text-sm font-bold text-text-primary">{broadcast.total_recipients.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3 h-3 text-green-500" /> ส่งสำเร็จ
                                    </span>
                                    <span className="text-sm font-bold text-green-600 dark:text-green-400">{broadcast.success_count.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                                        <AlertCircle className="w-3 h-3 text-red-500" /> ล้มเหลว
                                    </span>
                                    <span className="text-sm font-bold text-red-600 dark:text-red-400">{broadcast.failure_count.toLocaleString()}</span>
                                </div>
                                {broadcast.total_recipients > 0 && (
                                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs text-text-tertiary">อัตราสำเร็จ</span>
                                            <span className="text-xs font-bold text-text-primary">
                                                {((broadcast.success_count / broadcast.total_recipients) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                            <div
                                                className="bg-green-500 h-2 rounded-full transition-all"
                                                style={{ width: `${(broadcast.success_count / broadcast.total_recipients) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Status Timeline */}
                    <Card glass className="border-none shadow-sm">
                        <CardContent className="p-6">
                            <h3 className="text-sm font-bold text-text-primary mb-4">ไทม์ไลน์</h3>
                            <div className="space-y-4">
                                <TimelineItem
                                    done
                                    label="สร้างแบบร่าง"
                                    date={broadcast.created_at}
                                />
                                {broadcast.scheduled_at && (
                                    <TimelineItem
                                        done={broadcast.status !== 'draft'}
                                        label="ตั้งเวลาส่ง"
                                        date={broadcast.scheduled_at}
                                    />
                                )}
                                {broadcast.sent_at && (
                                    <TimelineItem
                                        done
                                        label={broadcast.status === 'completed' ? 'ส่งสำเร็จ' : 'ส่งสำเร็จ'}
                                        date={broadcast.sent_at}
                                        success={broadcast.status === 'completed'}
                                    />
                                )}
                                {broadcast.status === 'failed' && (
                                    <TimelineItem
                                        done
                                        label="ส่งล้มเหลว"
                                        date={broadcast.updated_at}
                                        error
                                    />
                                )}
                                {broadcast.status === 'cancelled' && (
                                    <TimelineItem
                                        done
                                        label="ยกเลิกแล้ว"
                                        date={broadcast.updated_at}
                                    />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <Card glass className="border-none shadow-sm">
                        <CardContent className="p-6 space-y-3">
                            <h3 className="text-sm font-bold text-text-primary mb-2">การดำเนินการ</h3>
                            {(broadcast.status === 'draft' || broadcast.status === 'scheduled') && (
                                <Button className="w-full gap-2" onClick={() => setSendModal(true)}>
                                    <Send className="w-4 h-4" />
                                    ส่งแล้ว
                                </Button>
                            )}
                            {broadcast.status === 'scheduled' && (
                                <Button variant="outline" className="w-full gap-2" onClick={() => setCancelModal(true)}>
                                    <XCircle className="w-4 h-4" />
                                    ไม่พบข้อมูล
                                </Button>
                            )}
                            {(broadcast.status === 'draft' || broadcast.status === 'cancelled') && (
                                <Button variant="danger" className="w-full gap-2" onClick={() => setDeleteModal(true)}>
                                    <Trash2 className="w-4 h-4" />
                                    ลบ
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Send Modal */}
            <Modal isOpen={sendModal} onClose={() => setSendModal(false)} title="รายละเอียด Broadcast" maxWidth="sm">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        คุณต้องการส่งข้อความ <b>{broadcast.title}</b> ถึงผู้ติดตามทั้งหมดเลยใช่หรือไม่?
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setSendModal(false)}>ยกเลิก</Button>
                        <Button onClick={handleSend} disabled={actionLoading} className="gap-2">
                            <Send className="w-4 h-4" />
                            {actionLoading ? 'กำลังส่ง...' : 'ส่งแล้ว'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Cancel Modal */}
            <Modal isOpen={cancelModal} onClose={() => setCancelModal(false)} title="ไม่พบข้อมูล" maxWidth="sm">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">ต้องการยกเลิกการตั้งเวลาส่งข้อความนี้ใช่หรือไม่?</p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setCancelModal(false)}>ไม่ยกเลิก</Button>
                        <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                            ยกเลิก
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Delete Modal */}
            <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} title="ยืนยันการส่ง" maxWidth="sm">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        คุณต้องการลบข้อความ <b>{broadcast.title}</b> ใช่หรือไม่?
                        <br /><span className="text-xs text-red-500 mt-2 block">* การกระทำนี้ไม่สามารถย้อนกลับได้</span>
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setDeleteModal(false)}>ยกเลิก</Button>
                        <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
                            ไม่ยกเลิก
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function TimelineItem({ done, label, date, success, error }: { done: boolean; label: string; date: string | null; success?: boolean; error?: boolean }) {
    return (
        <div className="flex items-start gap-3">
            <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${
                error ? 'bg-red-500' :
                success ? 'bg-green-500' :
                done ? 'bg-brand-500' :
                'bg-gray-300 dark:bg-gray-600'
            }`} />
            <div>
                <p className={`text-xs font-medium ${done ? 'text-text-primary' : 'text-text-tertiary'}`}>{label}</p>
                {date && (
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                        {new Date(date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>
        </div>
    );
}
