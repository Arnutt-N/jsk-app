"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, SquarePen, Trash2, Link2, Users, BarChart3 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { readErrorMessage } from '@/lib/api-error';
import { canPublish, menuStatusPill, needsResync, parseSyncResult, RichMenuSyncStatus } from '@/lib/rich-menu';

interface RichMenu {
    id: number;
    name: string;
    chat_bar_text: string;
    line_rich_menu_id: string | null;
    status: string;
    sync_status: string;
    last_sync_error: string | null;
    image_url: string | null;
    display_mode?: string | null;
    display_start_at?: string | null;
    display_end_at?: string | null;
    created_at: string;
    // Count of users bound to this menu via per-user assignment (Task 6.2).
    user_link_count?: number;
}

export default function RichMenuListPage() {
    const [menus, setMenus] = useState<RichMenu[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{open: boolean; id: number | null}>({open: false, id: null});
    const { toast } = useToast();
    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'preview', label: 'Preview', align: 'center', className: 'w-40' },
        { key: 'details', label: 'รายละเอียดเมนู' },
        { key: 'status', label: 'สถานะ', align: 'center' },
        { key: 'actions', label: 'จัดการ', align: 'center' },
    ];
    const API_BASE = '/api/v1';

    const fetchMenus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus`);
            if (res.ok) {
                const data = await res.json();
                setMenus(data);
            } else {
                const msg = await readErrorMessage(res, 'ไม่สามารถโหลดข้อมูลเมนูได้');
                logger.error('fetchMenus failed', { status: res.status });
                toast({ title: 'ผิดพลาด', description: msg, variant: 'error' });
            }
        } catch (error) {
            logger.error("Failed to fetch rich menus", error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        fetchMenus();
    }, [fetchMenus]);

    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setMenus(menus.filter(m => m.id !== id));
                toast({ title: 'สำเร็จ', description: 'ลบ Rich Menu เรียบร้อย', variant: 'success' });
            } else {
                const msg = await readErrorMessage(res, 'ไม่สามารถลบ Rich Menu ได้');
                logger.error('deleteRichMenu failed', { status: res.status, id });
                toast({ title: 'ผิดพลาด', description: msg, variant: 'error' });
            }
        } catch (err) {
            logger.error('deleteRichMenu error', err, { id });
            toast({ title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่', variant: 'error' });
        }
    };

    const handleSync = async (menu: RichMenu) => {
        setSyncingId(menu.id);
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${menu.id}/sync`, { method: 'POST' });
            if (res.ok) {
                // A 200 can still carry success:false or image_upload_error —
                // parseSyncResult decides the real outcome (sync-state honesty).
                const payload = await res.json();
                const outcome = parseSyncResult(payload);
                if (outcome.ok) {
                    // Sync alone never goes live — tell the admin the next
                    // step instead of letting the button silently morph into
                    // Set Active (PRD G3). A recreated outcome means local
                    // edits were just pushed to LINE (immutable menus).
                    const nextStep = menu.status === 'PUBLISHED'
                        ? 'เมนูหลักกำลังใช้เนื้อหาที่แก้ไขแล้ว'
                        : 'กด "Set Active" เพื่อใช้งานเมนูนี้';
                    toast({ title: outcome.recreated ? 'อัปเดตบน LINE แล้ว' : 'ซิงค์สำเร็จ', description: `${outcome.message} — ${nextStep}`, variant: 'success' });
                } else {
                    toast({ title: 'Sync ไม่สมบูรณ์', description: outcome.message, variant: 'error' });
                }
                fetchMenus();
            } else {
                const msg = await readErrorMessage(res, 'Sync ไปยัง LINE ล้มเหลว');
                logger.error('syncRichMenu failed', { status: res.status, id: menu.id });
                toast({ title: 'ผิดพลาด', description: msg, variant: 'error' });
            }
        } catch (err) {
            logger.error('syncRichMenu error', err, { id: menu.id });
            toast({ title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่', variant: 'error' });
        } finally {
            setSyncingId(null);
        }
    };

    const handlePublish = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}/publish`, { method: 'POST' });
            if (res.ok) {
                toast({ title: 'สำเร็จ', description: 'ตั้งเป็นเมนูหลักสำเร็จ', variant: 'success' });
                fetchMenus();
            } else {
                const msg = await readErrorMessage(res, 'ไม่สามารถตั้งเป็นเมนูหลักได้');
                logger.error('publishRichMenu failed', { status: res.status, id });
                toast({ title: 'ผิดพลาด', description: msg, variant: 'error' });
            }
        } catch (err) {
            logger.error('publishRichMenu error', err, { id });
            toast({ title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่', variant: 'error' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            {/* Header Section */}
            <PageHeader title="Rich Menus" subtitle="จัดการเมนู LINE Official Account">
                <div className="flex items-center gap-2">
                    <Link href="/admin/rich-menus/aliases">
                        <Button size="sm" variant="ghost" leftIcon={<Link2 className="w-4 h-4" />}>
                            Aliases
                        </Button>
                    </Link>
                    <Link href="/admin/rich-menus/new">
                        <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                            New Menu
                        </Button>
                    </Link>
                </div>
            </PageHeader>

            {loading ? (
                <LoadingSpinner label="กำลังโหลดข้อมูล..." />
            ) : menus.length === 0 ? (
                <div className="bg-surface rounded-xl border border-dashed border-border-default p-12 text-center">
                    <p className="text-text-tertiary text-sm">ไม่พบข้อมูลเมนูในระบบ</p>
                    <Link href="/admin/rich-menus/new" className="text-brand-600 text-sm mt-2 block hover:underline cursor-pointer dark:text-brand-400">สร้างเมนูแรกของคุณ &rarr;</Link>
                </div>
            ) : (
                <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                        <AdminTableHead columns={tableColumns} />
                        <tbody className="divide-y divide-border-default">
                            {menus.map((menu) => (
                                <tr key={menu.id} className="hover:bg-bg/50 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="w-32 aspect-[250/168.6] bg-muted rounded-lg overflow-hidden border border-border-default">
                                            {menu.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={menu.image_url}
                                                    alt={menu.name}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        if (!target.src.includes('placehold.co')) {
                                                            target.src = 'https://placehold.co/250x168?text=Image+Load+Error';
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-[10px] text-text-tertiary text-center bg-bg px-2 thai-no-break">
                                                    No Image
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="font-semibold text-text-secondary">{menu.name}</div>
                                        <div className="text-xs text-text-tertiary mt-1 flex items-center gap-2">
                                            <span className="font-medium">Bar Text:</span>
                                            <span className="italic">&quot;{menu.chat_bar_text}&quot;</span>
                                        </div>
                                        <div className="text-[10px] text-text-tertiary mt-1 font-mono">{menu.line_rich_menu_id || 'LOCAL_ONLY'}</div>
                                        {(menu.user_link_count ?? 0) > 0 && (
                                            <div className="mt-1.5">
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                                                    <Users className="w-3 h-3" />
                                                    {menu.user_link_count} ผู้ใช้
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        {/* Badge + button derive from REAL sync state — a
                                            FAILED sync (e.g. LINE rejected the image) must not
                                            offer publishing (that is how the LINE 400 happened).
                                            menuStatusPill is the ONE resolver (shared with the
                                            edit page) so the states can never diverge. */}
                                        {(() => {
                                            const pill = menuStatusPill(menu);
                                            const pillTone: Record<string, string> = {
                                                active: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
                                                error: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
                                                pending: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                                                scheduled: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20',
                                                inactive: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20',
                                                hidden: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20',
                                                synced: 'bg-brand-50 text-brand-600 border-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20',
                                                draft: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
                                            };
                                            return (
                                                <span
                                                    title={pill.title}
                                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${pillTone[pill.tone]}`}
                                                >
                                                    {pill.label}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-center gap-4">
                                            {/* Primary Action Button */}
                                            {!menu.line_rich_menu_id ? (
                                                <Button
                                                    size="xs"
                                                    onClick={() => handleSync(menu)}
                                                    isLoading={syncingId === menu.id}
                                                    loadingText="กำลังซิงค์..."
                                                >
                                                    Sync to LINE
                                                </Button>
                                            ) : needsResync(menu) ? (
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    onClick={() => handleSync(menu)}
                                                    isLoading={syncingId === menu.id}
                                                    loadingText="กำลังซิงค์..."
                                                >
                                                    ซิงค์การแก้ไข
                                                </Button>
                                            ) : canPublish(menu) && menu.status !== 'PUBLISHED' ? (
                                                <Button
                                                    size="xs"
                                                    variant="success"
                                                    onClick={() => handlePublish(menu.id)}
                                                >
                                                    Set Active
                                                </Button>
                                            ) : menu.sync_status === RichMenuSyncStatus.FAILED ? (
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    onClick={() => handleSync(menu)}
                                                    isLoading={syncingId === menu.id}
                                                    loadingText="กำลังซิงค์..."
                                                >
                                                    Re-sync
                                                </Button>
                                            ) : (
                                                <div className="text-[10px] font-black text-emerald-600 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100 tracking-widest leading-none thai-no-break dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">Live Now</div>
                                            )}

                                            {/* Icons Actions: Edit then Delete */}
                                            <div className="flex items-center gap-1 border-l border-border-default pl-4">
                                                {menu.line_rich_menu_id && (
                                                    <Link href={`/admin/rich-menus/${menu.id}/insights`}>
                                                        <ActionIconButton
                                                            icon={<BarChart3 className="w-4 h-4" />}
                                                            label="สถิติ"
                                                            variant="default"
                                                        />
                                                    </Link>
                                                )}
                                                <Link href={`/admin/rich-menus/${menu.id}/edit`}>
                                                    <ActionIconButton
                                                        icon={<SquarePen className="w-4 h-4" />}
                                                        label="แก้ไข"
                                                        variant="default"
                                                    />
                                                </Link>

                                                <ActionIconButton
                                                    icon={<Trash2 className="w-4 h-4" />}
                                                    label="ลบ"
                                                    variant="danger"
                                                    onClick={() => setConfirmDelete({open: true, id: menu.id})}
                                                />
                                            </div>
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
                onClose={() => setConfirmDelete({open: false, id: null})}
                onConfirm={() => { handleDelete(confirmDelete.id!); setConfirmDelete({open: false, id: null}); }}
                title="ยืนยันการลบ"
                description="ต้องการลบ Rich Menu นี้หรือไม่?"
                confirmText="ลบ"
                variant="danger"
            />
        </div>
    );
}
