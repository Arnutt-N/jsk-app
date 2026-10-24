'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, Trash2, SquarePen, Eye, LayoutGrid, List } from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { ViewToggle } from '@/components/admin/ViewToggle';
import { DetailModal } from '@/components/admin/DetailModal';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Switch } from '@/components/ui/Switch';
import { formatErrorDetail } from '@/components/admin/ReplyObjectForm';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';

interface ReplyObject {
    id: number;
    object_id: string;
    name: string;
    object_type: string;
    category?: string;
    payload: unknown;
    alt_text?: string;
    is_active: boolean;
    created_at: string;
}

export default function ReplyObjectsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';
    const [objects, setObjects] = useState<ReplyObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewObj, setViewObj] = useState<ReplyObject | null>(null);
    const [togglingId, setTogglingId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const [confirmDelete, setConfirmDelete] = useState<{open: boolean; objectId: string | null}>({open: false, objectId: null});
    const { toast } = useToast();
    const API_BASE = '/api/v1';

    const fetchObjects = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects`);
            if (res.ok) setObjects(await res.json());
        } catch (error) {
            logger.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchObjects();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchObjects]);

    const openEdit = (obj: ReplyObject) => router.push(`/admin/reply-objects/${obj.object_id}/edit`);

    const handleToggleActive = async (obj: ReplyObject) => {
        if (togglingId !== null) return;
        setTogglingId(obj.id);
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects/${obj.object_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !obj.is_active }),
            });
            if (res.ok) {
                toast({ title: 'อัปเดตสถานะแล้ว', variant: 'success' });
                await fetchObjects();
            } else {
                toast({ title: 'ผิดพลาด', description: formatErrorDetail(undefined, 'อัปเดตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), variant: 'error' });
            }
        } catch (error) {
            logger.error('Error toggling reply object:', error);
            toast({ title: 'ผิดพลาด', description: 'อัปเดตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', variant: 'error' });
        } finally {
            setTogglingId(null);
        }
    };

    const handleDelete = async (objectId: string) => {
        // ts-4: await + explicit error handling; refresh the list only on success.
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects/${objectId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                await fetchObjects();
            } else {
                const error = await res.json().catch(() => ({} as { detail?: unknown }));
                toast({
                    title: 'ผิดพลาด',
                    description: formatErrorDetail(error.detail, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'),
                    variant: 'error'
                });
            }
        } catch (error) {
            logger.error('Error deleting reply object:', error);
            toast({ title: 'ผิดพลาด', description: 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', variant: 'error' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="Reply Objects" subtitle="Manage reusable message templates">
                <div className="flex items-center gap-2">
                    <ViewToggle
                        options={[
                            { value: 'grid', label: 'มุมมองการ์ด', icon: <LayoutGrid className="w-4 h-4" /> },
                            { value: 'list', label: 'มุมมองตาราง', icon: <List className="w-4 h-4" /> },
                        ]}
                        value={viewMode}
                        onChange={setViewMode}
                        ariaLabel="มุมมอง"
                    />
                    {!isViewer && (
                        <Link href="/admin/reply-objects/new">
                            <Button>+ New Template</Button>
                        </Link>
                    )}
                </div>
            </PageHeader>

            {/* Objects Grid */}
            {loading ? (
                <LoadingSpinner label="Loading Assets..." />
            ) : objects.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] bg-surface rounded-2xl border border-dashed border-border-default p-20 text-center">
                    <div className="w-32 h-32 bg-brand-50 rounded-full flex items-center justify-center mb-10 border border-brand-100 shadow-inner dark:bg-brand-500/10 dark:border-brand-500/20">
                        <Package className="w-12 h-12 text-brand-300 dark:text-brand-400" />
                    </div>
                    <h3 className="text-3xl font-black text-text-primary mb-4 tracking-tight">Empty Repository</h3>
                    <p className="text-text-tertiary text-lg max-w-sm leading-relaxed">No reusable templates found. Create your first template to simplify your automated responses.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {objects.map((obj) => (
                        <StaggerItem key={obj.id}>
                        <div
                            className="bg-surface rounded-2xl border border-border-default overflow-hidden hover:border-brand-200 transition-all duration-300 group relative shadow-sm hover:shadow-lg"
                        >
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-brand-600 font-black font-mono text-sm tracking-tighter dark:text-brand-400">${obj.object_id}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-text-primary group-hover:text-brand-600 transition-colors tracking-tight">{obj.name}</h3>
                                    </div>
                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border shadow-sm ${obj.object_type === 'flex' ? 'bg-brand-50 text-brand-600 border-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20' :
                                        obj.object_type === 'image' ? 'bg-brand-50 text-brand-600 border-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20' :
                                            obj.object_type === 'sticker' ? 'bg-yellow-50 text-yellow-600 border-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20' :
                                                'bg-bg text-text-tertiary border-border-default'
                                        }`}>
                                        {obj.object_type}
                                    </span>
                                </div>

                                {obj.category && (
                                    <div className="flex items-center gap-2 mb-4 text-text-tertiary uppercase tracking-widest text-[9px] font-bold">
                                        <span className="w-1 h-1 bg-text-tertiary rounded-full" />
                                        {obj.category}
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-2 mb-4">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={obj.is_active ? 'success' : 'gray'} size="sm" className="thai-no-break">
                                            {obj.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                                        </Badge>
                                        {!isViewer && (
                                            <Switch
                                                checked={obj.is_active}
                                                onCheckedChange={() => { void handleToggleActive(obj); }}
                                                disabled={togglingId === obj.id}
                                                aria-label={`${obj.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} ${obj.name}`}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2 h-10 items-center justify-end">
                                    <ActionIconButton
                                        icon={<Eye className="w-4 h-4" />}
                                        label="ดูรายละเอียด"
                                        variant="default"
                                        onClick={() => setViewObj(obj)}
                                    />
                                    {!isViewer && (
                                        <>
                                            <ActionIconButton
                                                icon={<SquarePen className="w-4 h-4" />}
                                                label="แก้ไข"
                                                variant="default"
                                                onClick={() => openEdit(obj)}
                                            />
                                            <ActionIconButton
                                                icon={<Trash2 className="w-4 h-4" />}
                                                label="ลบ"
                                                variant="danger"
                                                onClick={() => setConfirmDelete({open: true, objectId: obj.object_id})}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        </StaggerItem>
                    ))}
                </StaggerContainer>
            ) : (
                <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px]">
                            <thead>
                                <tr className="border-b border-border-default text-left">
                                    <th className="px-5 py-3 text-xs font-semibold text-text-tertiary">รหัส</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-tertiary">ชื่อ</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-tertiary text-center">ประเภท</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-tertiary">หมวดหมู่</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-tertiary text-center">สถานะ</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-tertiary text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {objects.map((obj) => (
                                    <tr key={obj.id} className="hover:bg-bg/50 transition-colors">
                                        <td className="px-5 py-3"><span className="font-mono font-semibold text-brand-600 dark:text-brand-400 text-sm thai-no-break">${obj.object_id}</span></td>
                                        <td className="px-5 py-3 font-medium text-text-primary">{obj.name}</td>
                                        <td className="px-5 py-3 text-center"><span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">{obj.object_type}</span></td>
                                        <td className="px-5 py-3 text-sm text-text-tertiary">{obj.category || '-'}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col items-center gap-2">
                                                <Badge variant={obj.is_active ? 'success' : 'gray'} size="sm" className="thai-no-break">
                                                    {obj.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                                                </Badge>
                                                {!isViewer && (
                                                    <Switch
                                                        checked={obj.is_active}
                                                        onCheckedChange={() => { void handleToggleActive(obj); }}
                                                        disabled={togglingId === obj.id}
                                                        aria-label={`${obj.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} ${obj.name}`}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <ActionIconButton icon={<Eye className="w-4 h-4" />} label="ดูรายละเอียด" variant="default" onClick={() => setViewObj(obj)} />
                                                {!isViewer && (
                                                    <>
                                                        <ActionIconButton icon={<SquarePen className="w-4 h-4" />} label="แก้ไข" variant="default" onClick={() => openEdit(obj)} />
                                                        <ActionIconButton icon={<Trash2 className="w-4 h-4" />} label="ลบ" variant="danger" onClick={() => setConfirmDelete({ open: true, objectId: obj.object_id })} />
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={confirmDelete.open}
                onClose={() => setConfirmDelete({open: false, objectId: null})}
                onConfirm={() => { void handleDelete(confirmDelete.objectId!); setConfirmDelete({open: false, objectId: null}); }}
                title="ยืนยันการลบ"
                description={`ต้องการลบ ${confirmDelete.objectId} หรือไม่?`}
                confirmText="ลบ"
                variant="danger"
            />

            <DetailModal
                title="รายละเอียดเทมเพลต"
                open={viewObj !== null}
                onClose={() => setViewObj(null)}
                rows={viewObj ? [
                    { label: 'รหัส', value: <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">${viewObj.object_id}</span> },
                    { label: 'ชื่อ', value: viewObj.name },
                    { label: 'ประเภท', value: <span className="uppercase">{viewObj.object_type}</span> },
                    { label: 'หมวดหมู่', value: viewObj.category || '-' },
                    { label: 'สถานะ', value: (
                        <Badge variant={viewObj.is_active ? 'success' : 'gray'} size="sm">
                            {viewObj.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                        </Badge>
                    ) },
                ] : []}
                renderExtra={viewObj ? (
                    <div>
                        <p className="text-xs text-text-tertiary mb-1">JSON</p>
                        <pre className="max-h-64 overflow-auto rounded-xl bg-gray-900 p-4 font-mono text-xs text-green-400 overscroll-contain">
                            {JSON.stringify(viewObj.payload, null, 2)}
                        </pre>
                    </div>
                ) : undefined}
                actions={viewObj ? [
                    ...(!isViewer ? [{ label: 'แก้ไข', onClick: () => { const o = viewObj; setViewObj(null); openEdit(o); }, variant: 'outline' as const }] : []),
                    { label: 'ปิด', onClick: () => setViewObj(null), variant: 'primary' },
                ] : undefined}
            />
        </div>
    );
}
