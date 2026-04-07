"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

interface RichMenu {
    id: number;
    name: string;
    chat_bar_text: string;
    line_rich_menu_id: string | null;
    status: string;
    image_path: string | null;
    created_at: string;
}

export default function RichMenuListPage() {
    const [menus, setMenus] = useState<RichMenu[]>([]);
    const [loading, setLoading] = useState(true);
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
            }
        } catch (error) {
            console.error("Failed to fetch rich menus", error);
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
            }
        } catch {
            toast({ title: 'ผิดพลาด', description: 'ไม่สามารถลบ Rich Menu ได้', variant: 'error' });
        }
    };

    const handleSync = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}/sync`, { method: 'POST' });
            if (res.ok) {
                toast({ title: 'สำเร็จ', description: 'Sync ไปยัง LINE สำเร็จ', variant: 'success' });
                fetchMenus();
            } else {
                const err = await res.json();
                toast({ title: 'ผิดพลาด', description: err.detail || 'Sync failed', variant: 'error' });
            }
        } catch {
            toast({ title: 'ผิดพลาด', description: 'Error syncing to LINE', variant: 'error' });
        }
    };

    const handlePublish = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}/publish`, { method: 'POST' });
            if (res.ok) {
                toast({ title: 'สำเร็จ', description: 'ตั้งเป็นเมนูหลักสำเร็จ', variant: 'success' });
                fetchMenus();
            } else {
                const err = await res.json();
                toast({ title: 'ผิดพลาด', description: err.detail || 'Publish failed', variant: 'error' });
            }
        } catch {
            toast({ title: 'ผิดพลาด', description: 'Error publishing rich menu', variant: 'error' });
        }
    };

    const getImageUrl = (path: string | null) => {
        if (!path) return null;
        const baseHost = API_BASE.split('/api/')[0]; // Gets http://localhost:8000
        return `${baseHost}/${path}`;
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            {/* Header Section */}
            <PageHeader title="Rich Menus" subtitle="จัดการเมนู LINE Official Account">
                <Link href="/admin/rich-menus/new">
                    <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                        New Menu
                    </Button>
                </Link>
            </PageHeader>

            {loading ? (
                <LoadingSpinner label="กำลังโหลดข้อมูล..." />
            ) : menus.length === 0 ? (
                <div className="bg-surface rounded-xl border border-dashed border-border-default p-12 text-center">
                    <p className="text-text-tertiary text-sm">ไม่พบข้อมูลเมนูในระบบ</p>
                    <Link href="/admin/rich-menus/new" className="text-brand-600 text-sm mt-2 block hover:underline cursor-pointer dark:text-brand-400">สร้างเมนูแรกของคุณ &rarr;</Link>
                </div>
            ) : (
                <div className="bg-surface rounded-2xl border border-border-default overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <AdminTableHead columns={tableColumns} />
                        <tbody className="divide-y divide-border-default">
                            {menus.map((menu) => (
                                <tr key={menu.id} className="hover:bg-bg/50 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="w-32 aspect-[250/168.6] bg-muted rounded-lg overflow-hidden border border-border-default">
                                            {menu.image_path ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={getImageUrl(menu.image_path) || ''}
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
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${menu.status === 'PUBLISHED'
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                            : menu.line_rich_menu_id
                                                ? 'bg-brand-50 text-brand-600 border-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20'
                                                : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                            }`}>
                                            {menu.status === 'PUBLISHED' ? 'ACTIVE' : menu.line_rich_menu_id ? 'SYNCED' : 'DRAFT'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-center gap-4">
                                            {/* Primary Action Button */}
                                            {!menu.line_rich_menu_id ? (
                                                <Button
                                                    size="xs"
                                                    onClick={() => handleSync(menu.id)}
                                                >
                                                    Sync to LINE
                                                </Button>
                                            ) : menu.status !== 'PUBLISHED' ? (
                                                <Button
                                                    size="xs"
                                                    variant="success"
                                                    onClick={() => handlePublish(menu.id)}
                                                >
                                                    Set Active
                                                </Button>
                                            ) : (
                                                <div className="text-[10px] font-black text-emerald-600 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100 tracking-widest leading-none thai-no-break dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">Live Now</div>
                                            )}

                                            {/* Icons Actions: Edit then Delete */}
                                            <div className="flex items-center gap-1 border-l border-border-default pl-4">
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
