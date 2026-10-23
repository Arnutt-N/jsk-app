'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Trash2, SquarePen, Eye, LayoutGrid, List } from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import ReplyObjectForm, { formatErrorDetail, type ReplyObjectFormData } from '@/components/admin/ReplyObjectForm';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';

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
    const [objects, setObjects] = useState<ReplyObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingObj, setEditingObj] = useState<ReplyObject | null>(null);
    const [viewObj, setViewObj] = useState<ReplyObject | null>(null);
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

    const openEdit = (obj: ReplyObject) => setEditingObj(obj);
    const closeEdit = () => setEditingObj(null);

    const handleSaveEdit = async (data: ReplyObjectFormData): Promise<boolean> => {
        if (!editingObj) return false;
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects/${editingObj.object_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, payload: JSON.parse(data.payload) }),
            });
            if (res.ok) {
                toast({ title: 'บันทึกการแก้ไขแล้ว', variant: 'success' });
                closeEdit();
                await fetchObjects();
                return true;
            }
            const error = await res.json().catch(() => ({} as { detail?: unknown }));
            toast({ title: 'ผิดพลาด', description: formatErrorDetail(error.detail), variant: 'error' });
            return false;
        } catch (error) {
            logger.error('Error saving reply object:', error);
            toast({ title: 'ผิดพลาด', description: formatErrorDetail(undefined), variant: 'error' });
            return false;
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

    const editInitial: ReplyObjectFormData | null = editingObj ? (() => {
        const p = editingObj.payload;
        const isPlainObject = p !== null && typeof p === 'object' && !Array.isArray(p);
        return {
            object_id: editingObj.object_id,
            name: editingObj.name,
            category: editingObj.category || '',
            object_type: editingObj.object_type,
            payload: isPlainObject ? JSON.stringify(p, null, 2) : p ? JSON.stringify(p, null, 2) : '{}',
            alt_text: editingObj.alt_text || '',
        };
    })() : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="Reply Objects" subtitle="Manage reusable message templates">
                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-border-default p-0.5" role="tablist" aria-label="มุมมอง">
                        <button
                            role="tab"
                            aria-selected={viewMode === 'grid'}
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-brand-500 text-white' : 'text-text-tertiary hover:text-text-primary'}`}
                            aria-label="มุมมองการ์ด"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            role="tab"
                            aria-selected={viewMode === 'list'}
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-brand-500 text-white' : 'text-text-tertiary hover:text-text-primary'}`}
                            aria-label="มุมมองตาราง"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                    <Link href="/admin/reply-objects/new">
                        <Button>+ New Template</Button>
                    </Link>
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

                                <div className="flex gap-2 h-10 items-center justify-end">
                                    <ActionIconButton
                                        icon={<Eye className="w-4 h-4" />}
                                        label="ดูรายละเอียด"
                                        variant="default"
                                        onClick={() => setViewObj(obj)}
                                    />
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
                                            <div className="flex items-center justify-center gap-1">
                                                <ActionIconButton icon={<Eye className="w-4 h-4" />} label="ดูรายละเอียด" variant="default" onClick={() => setViewObj(obj)} />
                                                <ActionIconButton icon={<SquarePen className="w-4 h-4" />} label="แก้ไข" variant="default" onClick={() => openEdit(obj)} />
                                                <ActionIconButton icon={<Trash2 className="w-4 h-4" />} label="ลบ" variant="danger" onClick={() => setConfirmDelete({ open: true, objectId: obj.object_id })} />
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

            <Modal
                isOpen={editingObj !== null}
                onClose={closeEdit}
                title="Edit Object"
                maxWidth="4xl"
            >
                {editInitial && (
                    <ReplyObjectForm
                        key={editingObj?.object_id}
                        initial={editInitial}
                        lockObjectId
                        submitLabel="Save Modifications"
                        onSave={handleSaveEdit}
                        onCancel={closeEdit}
                    />
                )}
            </Modal>

            <Modal
                isOpen={viewObj !== null}
                onClose={() => setViewObj(null)}
                title="รายละเอียดเทมเพลต"
                maxWidth="lg"
            >
                {viewObj && (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs text-text-tertiary mb-1">รหัส</p>
                            <p className="font-mono font-semibold text-brand-600 dark:text-brand-400">${viewObj.object_id}</p>
                        </div>
                        <div>
                            <p className="text-xs text-text-tertiary mb-1">ชื่อ</p>
                            <p className="font-medium text-text-primary">{viewObj.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-text-tertiary mb-1">ประเภท</p>
                                <p className="text-text-primary uppercase">{viewObj.object_type}</p>
                            </div>
                            <div>
                                <p className="text-xs text-text-tertiary mb-1">หมวดหมู่</p>
                                <p className="text-text-primary">{viewObj.category || '-'}</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-text-tertiary mb-1">JSON</p>
                            <pre className="max-h-64 overflow-auto rounded-xl bg-gray-900 p-4 font-mono text-xs text-green-400 overscroll-contain">
                                {JSON.stringify(viewObj.payload, null, 2)}
                            </pre>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setViewObj(null); openEdit(viewObj); }}>แก้ไข</Button>
                            <Button variant="primary" size="sm" onClick={() => setViewObj(null)}>ปิด</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
