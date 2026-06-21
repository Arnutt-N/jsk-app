"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { AdminTableHead, type AdminTableHeadColumn } from '@/components/admin/AdminTableHead';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { readErrorMessage } from '@/lib/api-error';

interface RichMenuLite {
    id: number;
    name: string;
    line_rich_menu_id: string | null;
}

interface RichMenuAlias {
    id: number;
    alias_id: string;
    rich_menu_id: number;
    sync_status: string;
}

// Mirror of the backend RichMenuAliasCreate.alias_id pattern.
const ALIAS_ID_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;

export default function RichMenuAliasesPage() {
    const { toast } = useToast();
    const API_BASE = '/api/v1';

    const [aliases, setAliases] = useState<RichMenuAlias[]>([]);
    const [menus, setMenus] = useState<RichMenuLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [newAliasId, setNewAliasId] = useState('');
    const [newTargetId, setNewTargetId] = useState<number | ''>('');
    const [creating, setCreating] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; aliasId: string | null }>({ open: false, aliasId: null });

    const tableColumns: AdminTableHeadColumn[] = [
        { key: 'alias', label: 'Alias ID' },
        { key: 'target', label: 'ชี้ไปที่เมนู' },
        { key: 'status', label: 'สถานะ Sync', align: 'center' },
        { key: 'actions', label: 'จัดการ', align: 'center' },
    ];

    // Only menus synced to LINE can be an alias target; the backend 409s otherwise.
    const syncedMenus = useMemo(() => menus.filter((m) => m.line_rich_menu_id), [menus]);
    const menuName = useCallback(
        (id: number) => menus.find((m) => m.id === id)?.name ?? `#${id}`,
        [menus]
    );

    const fetchData = useCallback(async () => {
        try {
            const [aliasRes, menuRes] = await Promise.all([
                fetch(`${API_BASE}/admin/rich-menus/aliases`),
                fetch(`${API_BASE}/admin/rich-menus`),
            ]);
            if (aliasRes.ok) setAliases((await aliasRes.json()) as RichMenuAlias[]);
            if (menuRes.ok) setMenus((await menuRes.json()) as RichMenuLite[]);
        } catch (error) {
            logger.error('Failed to fetch aliases', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreate = async () => {
        if (!ALIAS_ID_PATTERN.test(newAliasId)) {
            toast({ variant: 'warning', title: 'alias id ไม่ถูกต้อง', description: 'ใช้ได้เฉพาะ a-z A-Z 0-9 _ - ความยาว 1-50 ตัว' });
            return;
        }
        if (!newTargetId) {
            toast({ variant: 'warning', title: 'ยังไม่ได้เลือกเมนูปลายทาง', description: 'เลือกเมนูที่ sync ไป LINE แล้วเป็นปลายทางของ alias' });
            return;
        }
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/aliases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alias_id: newAliasId, rich_menu_id: newTargetId }),
            });
            if (res.ok) {
                toast({ variant: 'success', title: 'สร้าง alias สำเร็จ', description: `สร้าง "${newAliasId}" แล้ว` });
                setNewAliasId('');
                setNewTargetId('');
                fetchData();
            } else {
                const msg = await readErrorMessage(res, 'สร้าง alias ไม่สำเร็จ');
                logger.error('createAlias failed', { status: res.status });
                toast({ variant: 'error', title: 'ผิดพลาด', description: msg });
            }
        } catch (err) {
            logger.error('create alias error', err);
            toast({ variant: 'error', title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
        } finally {
            setCreating(false);
        }
    };

    const handleRepoint = async (alias: RichMenuAlias, richMenuId: number) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/aliases/${alias.alias_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rich_menu_id: richMenuId }),
            });
            if (res.ok) {
                const updated = (await res.json()) as RichMenuAlias;
                setAliases((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                toast({ variant: 'success', title: 'อัปเดต alias สำเร็จ', description: `"${alias.alias_id}" ชี้ไปที่ ${menuName(richMenuId)}` });
            } else {
                const msg = await readErrorMessage(res, 'อัปเดต alias ไม่สำเร็จ');
                logger.error('repointAlias failed', { status: res.status });
                toast({ variant: 'error', title: 'ผิดพลาด', description: msg });
                fetchData(); // revert the select back to the server's state
            }
        } catch (err) {
            logger.error('repoint alias error', err);
            toast({ variant: 'error', title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
            fetchData();
        }
    };

    const handleDelete = async (aliasId: string) => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/aliases/${aliasId}`, { method: 'DELETE' });
            if (res.ok) {
                setAliases((prev) => prev.filter((a) => a.alias_id !== aliasId));
                toast({ variant: 'success', title: 'ลบสำเร็จ', description: `ลบ alias "${aliasId}" แล้ว` });
            } else {
                const msg = await readErrorMessage(res, 'ลบ alias ไม่สำเร็จ');
                logger.error('deleteAlias failed', { status: res.status });
                toast({ variant: 'error', title: 'ผิดพลาด', description: msg });
            }
        } catch (err) {
            logger.error('delete alias error', err);
            toast({ variant: 'error', title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="Rich Menu Aliases" subtitle="ชื่อย่อสำหรับสลับเมนูแบบแท็บ (richmenuswitch)">
                <Link href="/admin/rich-menus">
                    <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                        กลับไปหน้าเมนู
                    </Button>
                </Link>
            </PageHeader>

            {/* Create form */}
            <div className="bg-surface rounded-2xl border border-border-default shadow-sm p-5 space-y-4">
                <h2 className="text-sm font-bold text-text-secondary">สร้าง Alias ใหม่</h2>
                {syncedMenus.length === 0 ? (
                    <p className="text-xs text-amber-600">
                        ยังไม่มีเมนูที่ sync ไป LINE — ต้อง{' '}
                        <Link href="/admin/rich-menus" className="underline font-bold">sync เมนูอย่างน้อย 1 อัน</Link>{' '}
                        ก่อนจึงจะสร้าง alias ได้
                    </p>
                ) : (
                    <div className="flex flex-col md:flex-row gap-3 md:items-end">
                        <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Alias ID</label>
                            <input
                                value={newAliasId}
                                onChange={(e) => setNewAliasId(e.target.value)}
                                placeholder="เช่น menu-a (a-z 0-9 _ -)"
                                className="w-full text-sm bg-bg border border-border-default rounded-xl px-3 py-2 focus:ring-2 focus:ring-brand-500/20 outline-none"
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">ชี้ไปที่เมนู</label>
                            <select
                                value={newTargetId}
                                onChange={(e) => setNewTargetId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full text-sm bg-bg border border-border-default rounded-xl px-3 py-2 focus:ring-2 focus:ring-brand-500/20 outline-none cursor-pointer"
                            >
                                <option value="">-- เลือกเมนู --</option>
                                {syncedMenus.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <Button
                            size="sm"
                            leftIcon={<Plus className="w-4 h-4" />}
                            onClick={handleCreate}
                            disabled={creating}
                        >
                            {creating ? 'กำลังสร้าง...' : 'สร้าง'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Alias table */}
            {loading ? (
                <LoadingSpinner label="กำลังโหลดข้อมูล..." />
            ) : aliases.length === 0 ? (
                <div className="bg-surface rounded-xl border border-dashed border-border-default p-12 text-center">
                    <p className="text-text-tertiary text-sm">ยังไม่มี alias ในระบบ</p>
                </div>
            ) : (
                <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <AdminTableHead columns={tableColumns} />
                            <tbody className="divide-y divide-border-default">
                                {aliases.map((alias) => (
                                    <tr key={alias.id} className="hover:bg-bg/50 transition-colors">
                                        <td className="px-5 py-4 font-mono text-sm text-text-secondary">{alias.alias_id}</td>
                                        <td className="px-5 py-4">
                                            <select
                                                value={alias.rich_menu_id}
                                                onChange={(e) => handleRepoint(alias, Number(e.target.value))}
                                                className="text-sm bg-bg border border-border-default rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500/20 outline-none cursor-pointer"
                                            >
                                                {/* keep the current target selectable even if it is no longer synced */}
                                                {!syncedMenus.some((m) => m.id === alias.rich_menu_id) && (
                                                    <option value={alias.rich_menu_id}>{menuName(alias.rich_menu_id)}</option>
                                                )}
                                                {syncedMenus.map((m) => (
                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${alias.sync_status === 'SYNCED'
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                                : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                                }`}>
                                                {alias.sync_status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center">
                                                <ActionIconButton
                                                    icon={<Trash2 className="w-4 h-4" />}
                                                    label="ลบ"
                                                    variant="danger"
                                                    onClick={() => setConfirmDelete({ open: true, aliasId: alias.alias_id })}
                                                />
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
                onClose={() => setConfirmDelete({ open: false, aliasId: null })}
                onConfirm={() => { if (confirmDelete.aliasId) handleDelete(confirmDelete.aliasId); setConfirmDelete({ open: false, aliasId: null }); }}
                title="ยืนยันการลบ Alias"
                description="ลบ alias นี้แล้วพื้นที่เมนูที่ตั้งเป็น 'สลับเมนู' ไปยัง alias นี้จะใช้ไม่ได้ ต้องการลบหรือไม่?"
                confirmText="ลบ"
                variant="danger"
            />
        </div>
    );
}
