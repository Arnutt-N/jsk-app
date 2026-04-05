"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'preview', label: 'Preview', align: 'center', className: 'w-40' },
        { key: 'details', label: 'รายละเอียดเมนู' },
        { key: 'status', label: 'สถานะ', align: 'center' },
        { key: 'actions', label: 'จัดการ', align: 'center' },
    ];
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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
        if (!confirm("ต้องการลบ Rich Menu นี้?")) return;

        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setMenus(menus.filter(m => m.id !== id));
            }
        } catch {
            alert("Failed to delete rich menu");
        }
    };

    const handleSync = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}/sync`, { method: 'POST' });
            if (res.ok) {
                alert("Sync ไปยัง LINE สำเร็จ!");
                fetchMenus();
            } else {
                const err = await res.json();
                alert(`Sync failed: ${err.detail}`);
            }
        } catch {
            alert("Error syncing to LINE");
        }
    };

    const handlePublish = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${id}/publish`, { method: 'POST' });
            if (res.ok) {
                alert("ตั้งเป็นเมนูหลักสำเร็จ!");
                fetchMenus();
            } else {
                const err = await res.json();
                alert(`Publish failed: ${err.detail}`);
            }
        } catch {
            alert("Error publishing rich menu");
        }
    };

    const getImageUrl = (path: string | null) => {
        if (!path) return null;
        const baseHost = API_BASE.split('/api/')[0]; // Gets http://localhost:8000
        return `${baseHost}/${path}`;
    };

    return (
        <div className="space-y-5 animate-in fade-in duration-500 thai-text">
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
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center dark:bg-gray-800 dark:border-gray-600">
                    <p className="text-gray-400 text-sm dark:text-gray-500">ไม่พบข้อมูลเมนูในระบบ</p>
                    <Link href="/admin/rich-menus/new" className="text-brand-600 text-sm mt-2 block hover:underline cursor-pointer dark:text-brand-400">สร้างเมนูแรกของคุณ &rarr;</Link>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm dark:bg-gray-800 dark:border-gray-700">
                    <table className="w-full text-left">
                        <AdminTableHead columns={tableColumns} />
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                            {menus.map((menu) => (
                                <tr key={menu.id} className="hover:bg-gray-50/50 transition-colors dark:hover:bg-gray-700/30">
                                    <td className="px-5 py-4">
                                        <div className="w-32 aspect-[250/168.6] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 dark:bg-gray-700 dark:border-gray-600">
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
                                                <div className="flex items-center justify-center h-full text-[10px] text-gray-400 text-center bg-gray-50 px-2 thai-no-break dark:bg-gray-700/50 dark:text-gray-500">
                                                    No Image
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="font-semibold text-gray-700 dark:text-gray-200">{menu.name}</div>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 dark:text-gray-400">
                                            <span className="font-medium">Bar Text:</span>
                                            <span className="italic">&quot;{menu.chat_bar_text}&quot;</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-1 font-mono dark:text-gray-500">{menu.line_rich_menu_id || 'LOCAL_ONLY'}</div>
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
                                            <div className="flex items-center gap-1 border-l border-gray-200 pl-4 dark:border-gray-600">
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
                                                    onClick={() => handleDelete(menu.id)}
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
        </div>
    );
}
