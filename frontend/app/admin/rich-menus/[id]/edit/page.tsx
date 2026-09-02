"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { readErrorMessage } from '@/lib/api-error';
import { canPublish, ensureRichMenuImage, needsResync, parseSyncResult, RichMenuDisplayMode, RichMenuSyncStatus, toLocalDatetimeInputValue } from '@/lib/rich-menu';
import type { RichMenuDisplayModeValue } from '@/lib/rich-menu';

interface RichMenuArea {
    bounds: { x: number; y: number; width: number; height: number };
    action: {
        type: string;
        label: string;
        uri?: string;
        text?: string;
        data?: string;
        displayText?: string;
        richMenuAliasId?: string;
    };
}

interface AliasLite {
    id: number;
    alias_id: string;
    rich_menu_id: number;
}

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
    config: {
        size: { width: number; height: number };
        areas: RichMenuArea[];
    };
}

export default function EditRichMenuPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const menuId = params.id as string;

    const [menu, setMenu] = useState<RichMenu | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [chatBarText, setChatBarText] = useState('');
    const [areas, setAreas] = useState<RichMenuArea[]>([]);
    const [aliases, setAliases] = useState<AliasLite[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [syncBusy, setSyncBusy] = useState(false);
    const [publishBusy, setPublishBusy] = useState(false);
    // Display settings — initialized from the saved menu, sent on every save.
    const [displayMode, setDisplayMode] = useState<RichMenuDisplayModeValue>(RichMenuDisplayMode.ALWAYS);
    const [displayStart, setDisplayStart] = useState('');
    const [displayEnd, setDisplayEnd] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const API_BASE = '/api/v1';

    const fetchMenu = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${menuId}`);
            if (res.ok) {
                const data = await res.json();
                setMenu(data);
                setName(data.name);
                setChatBarText(data.chat_bar_text);
                setAreas(data.config?.areas || []);
                setDisplayMode(
                    (data.display_mode as RichMenuDisplayModeValue) || RichMenuDisplayMode.ALWAYS,
                );
                setDisplayStart(toLocalDatetimeInputValue(data.display_start_at));
                setDisplayEnd(toLocalDatetimeInputValue(data.display_end_at));
                if (data.image_url) {
                    setImagePreview(data.image_url);
                } else {
                    setImagePreview(null);
                }
            } else {
                toast({ variant: 'error', title: 'ไม่พบ Rich Menu', description: 'ไม่พบข้อมูล Rich Menu ที่ต้องการ' });
                router.push('/admin/rich-menus');
            }
        } catch (error) {
            logger.error('Failed to fetch rich menu', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, menuId, router, toast]);

    useEffect(() => {
        fetchMenu();
    }, [fetchMenu]);

    // Aliases populate the "switch menu" action dropdown. Plain fetch is enough —
    // the rich-menus pages get their token injected by the authFetch interceptor.
    useEffect(() => {
        const fetchAliases = async () => {
            try {
                const res = await fetch(`${API_BASE}/admin/rich-menus/aliases`);
                if (res.ok) setAliases((await res.json()) as AliasLite[]);
            } catch (error) {
                logger.error('Failed to fetch aliases', error);
            }
        };
        fetchAliases();
    }, [API_BASE]);

    const handleAreaActionChange = (index: number, field: string, value: string) => {
        setAreas((prev) =>
            prev.map((area, i) =>
                i === index ? { ...area, action: { ...area.action, [field]: value } } : area
            )
        );
    };

    const objectUrlRef = useRef<string | null>(null);
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            // Revoke the previous blob URL before minting the next one — the
            // old URL (and its File blob) leaked per image selection (M6).
            // Server-served image_url previews are never revoked.
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            const url = URL.createObjectURL(file);
            objectUrlRef.current = url;
            setImagePreview(url);
        }
    };
    useEffect(() => () => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    }, []);

    // Save flow mirrors the create page's two modes. `andSync` continues into
    // POST sync, which (since LINE menus are immutable) recreates the menu on
    // LINE when local state drifted — that is how an edit actually reaches
    // users. Draft-only saves of a synced menu keep the รอซิงค์ state visible.
    const handleSave = async (andSync: boolean) => {
        // A "switch menu" area must point at an alias; the backend rejects it
        // otherwise (422), so guard here for a friendly message.
        if (areas.some((a) => a.action?.type === 'richmenuswitch' && !a.action?.richMenuAliasId)) {
            toast({ variant: 'warning', title: 'ยังไม่ได้เลือกเมนูปลายทาง', description: 'พื้นที่ที่ตั้งเป็น "สลับเมนู" ต้องเลือก alias ปลายทางก่อนบันทึก' });
            return;
        }

        setSaving(true);
        try {
            // SCHEDULED needs a full, ordered period — the backend 422s otherwise.
            const display: {
                display_mode: RichMenuDisplayModeValue;
                display_start_at?: string;
                display_end_at?: string;
            } = { display_mode: displayMode };
            if (displayMode === RichMenuDisplayMode.SCHEDULED) {
                if (!displayStart || !displayEnd) {
                    toast({ variant: 'warning', title: 'ยังไม่ได้ระบุช่วงเวลา', description: 'โหมด "ตามช่วงเวลา" ต้องระบุวันเวลาเริ่มต้นและสิ้นสุด' });
                    setSaving(false);
                    return;
                }
                const start = new Date(displayStart);
                const end = new Date(displayEnd);
                if (end <= start) {
                    toast({ variant: 'warning', title: 'ช่วงเวลาไม่ถูกต้อง', description: 'วันเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น' });
                    setSaving(false);
                    return;
                }
                display.display_start_at = start.toISOString();
                display.display_end_at = end.toISOString();
            }

            // 1. Save menu details
            const updateRes = await fetch(`${API_BASE}/admin/rich-menus/${menuId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    chat_bar_text: chatBarText,
                    areas,
                    ...display
                })
            });

            if (!updateRes.ok) {
                const err = await updateRes.json();
                toast({ variant: 'error', title: 'อัปเดตไม่สำเร็จ', description: `${err.detail}` });
                setSaving(false);
                return;
            }

            // 2. Upload new image if selected (auto-fit to LINE's 1 MB cap first)
            let alreadyUploaded = false;
            if (imageFile) {
                const fitted = await ensureRichMenuImage(imageFile).catch((e: unknown) => {
                    toast({ variant: 'error', title: 'รูปไม่พร้อมอัปโหลด', description: e instanceof Error ? e.message : 'โปรดใช้รูปขนาดไม่เกิน 1 MB' });
                    return null;
                });
                if (!fitted) { setSaving(false); return; }
                if (fitted.converted) {
                    toast({ variant: 'info', title: 'ย่อรูปอัตโนมัติแล้ว', description: `รูปถูกย่อเป็น ${Math.round(fitted.file.size / 1024)} KB เพื่อให้อยู่ในขีดจำกัด 1 MB ของ LINE` });
                }
                const formData = new FormData();
                formData.append('file', fitted.file, fitted.filename);
                const uploadRes = await fetch(`${API_BASE}/admin/rich-menus/${menuId}/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (!uploadRes.ok) {
                    // Upload failure means the menu is NOT fully saved — show the
                    // error and stay on the page.
                    const detail = await readErrorMessage(uploadRes, 'ไม่สามารถอัปโหลดรูปภาพได้');
                    toast({ variant: 'error', title: 'อัปโหลดรูปภาพไม่สำเร็จ', description: detail });
                    setSaving(false);
                    return;
                }
                alreadyUploaded = !!(await uploadRes.json().catch(() => ({})))?.already_uploaded;
            }

            // 3. Optional: push everything to LINE (recreates the menu there
            //    when local state drifted — LINE has no in-place update).
            if (andSync) {
                const res = await fetch(`${API_BASE}/admin/rich-menus/${menuId}/sync`, { method: 'POST' });
                if (!res.ok) {
                    const msg = await readErrorMessage(res, 'Sync ไปยัง LINE ล้มเหลว');
                    toast({ variant: 'error', title: 'ผิดพลาด', description: msg });
                } else {
                    const outcome = parseSyncResult(await res.json());
                    if (outcome.ok) {
                        // แสดงตลอดเวลา = keep it live: (re)publish right after the
                        // sync. A SCHEDULED menu's default is owned by the
                        // backend scheduler; MANUAL never auto-publishes.
                        if (displayMode === RichMenuDisplayMode.ALWAYS && menu?.status !== 'PUBLISHED') {
                            const pubRes = await fetch(`${API_BASE}/admin/rich-menus/${menuId}/publish`, { method: 'POST' });
                            if (pubRes.ok) {
                                toast({ variant: 'success', title: 'อัปเดตและเผยแพร่สำเร็จ', description: 'แก้ไขถึง LINE แล้วและเมนูกำลังใช้งานเป็นเมนูหลัก' });
                            } else {
                                const msg = await readErrorMessage(pubRes, 'ไม่ทราบสาเหตุ');
                                toast({ variant: 'error', title: 'ตั้งเป็นเมนูหลักไม่สำเร็จ', description: `อัปเดตถึง LINE แล้ว แต่ตั้งเป็นเมนูหลักไม่สำเร็จ: ${msg} — กด "Set Active" ได้` });
                            }
                        } else if (outcome.recreated) {
                            const nextStep = displayMode === RichMenuDisplayMode.SCHEDULED
                                ? 'ระบบจะแสดง/ซ่อนตามช่วงเวลาที่กำหนด'
                                : 'เมนูซ่อนอยู่ (ใช้ผ่านการผูกรายคนหรือ alias)';
                            toast({
                                variant: 'success',
                                title: 'อัปเดตบน LINE แล้ว',
                                description: `${outcome.message} — ${nextStep}`,
                            });
                        } else {
                            const nextStep = menu?.status === 'PUBLISHED'
                                ? 'เมนูหลักกำลังใช้เนื้อหาที่แก้ไขแล้ว'
                                : 'กด "Set Active" เพื่อใช้งานเมนูนี้';
                            toast({
                                variant: 'success',
                                title: 'ซิงค์สำเร็จ',
                                description: `${outcome.message} — ${nextStep}`,
                            });
                        }
                    } else {
                        toast({ variant: 'error', title: 'Sync ไม่สมบูรณ์', description: outcome.message });
                    }
                }
            } else {
                toast({
                    variant: 'success',
                    title: 'บันทึกสำเร็จ',
                    description: menu?.line_rich_menu_id
                        ? 'บันทึกในระบบแล้ว — ยังไม่ส่งไป LINE กด "บันทึกและซิงค์" เพื่ออัปเดตให้ผู้ใช้เห็น'
                        : 'บันทึก Rich Menu เป็นฉบับร่างแล้ว',
                });
                if (alreadyUploaded) {
                    toast({ variant: 'info', title: 'รูปใหม่ยังไม่ถึง LINE', description: 'LINE รับรูปได้ครั้งเดียวต่อเมนู — กด "บันทึกและซิงค์" แล้วระบบจะสร้างเมนูใหม่พร้อมรูปล่าสุดให้อัตโนมัติ' });
                }
            }

            setImageFile(null);
            // Stay on the page and refresh state — badges/actions must reflect
            // the new truth (e.g. รอซิงค์ after a draft-only save).
            await fetchMenu();
        } catch {
            toast({ variant: 'error', title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถบันทึก Rich Menu ได้' });
        } finally {
            setSaving(false);
        }
    };

    // Mirror of the list page's sync flow: parseSyncResult decides the real
    // outcome (200 can still carry success:false / image_upload_error), and
    // the toast names the next step — sync alone never goes live.
    const handleSync = async () => {
        setSyncBusy(true);
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${menuId}/sync`, { method: 'POST' });
            if (res.ok) {
                const payload = await res.json();
                const outcome = parseSyncResult(payload);
                if (outcome.ok) {
                    const nextStep = menu?.status === 'PUBLISHED'
                        ? 'เมนูหลักกำลังใช้เนื้อหาที่แก้ไขแล้ว'
                        : 'กด "Set Active" เพื่อใช้งานเมนูนี้';
                    toast({ variant: 'success', title: outcome.recreated ? 'อัปเดตบน LINE แล้ว' : 'ซิงค์สำเร็จ', description: `${outcome.message} — ${nextStep}` });
                } else {
                    toast({ variant: 'error', title: 'Sync ไม่สมบูรณ์', description: outcome.message });
                }
                fetchMenu();
            } else {
                const msg = await readErrorMessage(res, 'Sync ไปยัง LINE ล้มเหลว');
                toast({ variant: 'error', title: 'ผิดพลาด', description: msg });
            }
        } catch (err) {
            logger.error('syncRichMenu error', err, { id: menuId });
            toast({ variant: 'error', title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
        } finally {
            setSyncBusy(false);
        }
    };

    const handlePublish = async () => {
        setPublishBusy(true);
        try {
            const res = await fetch(`${API_BASE}/admin/rich-menus/${menuId}/publish`, { method: 'POST' });
            if (res.ok) {
                toast({ variant: 'success', title: 'สำเร็จ', description: 'ตั้งเป็นเมนูหลักสำเร็จ' });
                fetchMenu();
            } else {
                const msg = await readErrorMessage(res, 'ไม่สามารถตั้งเป็นเมนูหลักได้');
                toast({ variant: 'error', title: 'ผิดพลาด', description: msg });
            }
        } catch (err) {
            logger.error('publishRichMenu error', err, { id: menuId });
            toast({ variant: 'error', title: 'ผิดพลาด', description: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
        } finally {
            setPublishBusy(false);
        }
    };

    if (loading) {
        return <LoadingSpinner label="กำลังโหลด..." />;
    }

    // Local edits of a synced menu are NOT on LINE yet (backend flags PENDING
    // on PUT/upload) — drives both the badge and the action bar.
    const pendingResync = menu != null && needsResync(menu);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-700">Edit Rich Menu</h1>
                    <p className="text-sm text-slate-500 mt-1">แก้ไขเมนู: {menu?.name}</p>
                </div>
                <Link
                    href="/admin/rich-menus"
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium cursor-pointer"
                >
                    ← กลับ
                </Link>
            </div>

            {/* Form */}
            <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">ชื่อเมนู</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
                                placeholder="e.g., Main Menu v1"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Chat Bar Text</label>
                            <input
                                type="text"
                                value={chatBarText}
                                onChange={(e) => setChatBarText(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
                                placeholder="e.g., Open Menu"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">สถานะ</label>
                            {/* Sync-aware badge (same states as the list page) — a
                                FAILED sync or LOCAL EDITS must be visible here,
                                not hidden behind a plain DRAFT/ACTIVE pill. */}
                            <span
                                title={menu?.last_sync_error || (pendingResync ? 'แก้ไขในระบบแล้ว ยังไม่ส่งไป LINE' : undefined)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${menu?.status === 'PUBLISHED' && !pendingResync
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : menu?.sync_status === RichMenuSyncStatus.FAILED
                                        ? 'bg-red-50 text-red-600'
                                        : pendingResync
                                            ? 'bg-amber-50 text-amber-600'
                                            : menu?.line_rich_menu_id
                                                ? 'bg-brand-50 text-brand-600'
                                                : 'bg-amber-50 text-amber-600'
                                    }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${menu?.status === 'PUBLISHED' && !pendingResync ? 'bg-emerald-500' : menu?.sync_status === RichMenuSyncStatus.FAILED ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                {menu?.status === 'PUBLISHED' && !pendingResync
                                    ? 'ACTIVE'
                                    : menu?.sync_status === RichMenuSyncStatus.FAILED
                                        ? 'SYNC FAILED'
                                        : pendingResync
                                            ? 'รอซิงค์'
                                            : menu?.line_rich_menu_id
                                                ? 'SYNCED'
                                                : 'DRAFT'}
                            </span>
                        </div>
                        {/* Display settings — same three modes as the create
                            page; changing them rides along on every save. */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">การแสดงผล</label>
                            <div className="space-y-2">
                                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${displayMode === RichMenuDisplayMode.ALWAYS ? 'border-primary/40 bg-primary/8' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <input
                                        type="radio"
                                        name="display-mode"
                                        className="mt-0.5 accent-[var(--primary)]"
                                        checked={displayMode === RichMenuDisplayMode.ALWAYS}
                                        onChange={() => setDisplayMode(RichMenuDisplayMode.ALWAYS)}
                                    />
                                    <span>
                                        <span className="block text-sm font-bold text-slate-700">แสดงตลอดเวลา</span>
                                        <span className="block text-[11px] text-slate-400">เมื่อบันทึกและซิงค์ เมนูจะกลับมาเป็นเมนูหลักทันที</span>
                                    </span>
                                </label>
                                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${displayMode === RichMenuDisplayMode.SCHEDULED ? 'border-primary/40 bg-primary/8' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <input
                                        type="radio"
                                        name="display-mode"
                                        className="mt-0.5 accent-[var(--primary)]"
                                        checked={displayMode === RichMenuDisplayMode.SCHEDULED}
                                        onChange={() => setDisplayMode(RichMenuDisplayMode.SCHEDULED)}
                                    />
                                    <span className="flex-1">
                                        <span className="block text-sm font-bold text-slate-700">ตามช่วงเวลา</span>
                                        <span className="block text-[11px] text-slate-400">ระบบแสดงเมนูอัตโนมัติเมื่อถึงเวลาเริ่ม และซ่อนเมื่อหมดเวลา</span>
                                        {displayMode === RichMenuDisplayMode.SCHEDULED && (
                                            <span className="mt-3 grid grid-cols-1 gap-2" onClick={(e) => e.preventDefault()}>
                                                <label className="text-[10px] font-bold text-slate-400">เริ่มแสดง
                                                    <input
                                                        type="datetime-local"
                                                        value={displayStart}
                                                        onChange={(e) => setDisplayStart(e.target.value)}
                                                        className="mt-1 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
                                                    />
                                                </label>
                                                <label className="text-[10px] font-bold text-slate-400">ซ่อนเมื่อถึง
                                                    <input
                                                        type="datetime-local"
                                                        value={displayEnd}
                                                        onChange={(e) => setDisplayEnd(e.target.value)}
                                                        className="mt-1 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
                                                    />
                                                </label>
                                            </span>
                                        )}
                                    </span>
                                </label>
                                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${displayMode === RichMenuDisplayMode.MANUAL ? 'border-primary/40 bg-primary/8' : 'border-slate-200 hover:border-slate-300'}`}>
                                    <input
                                        type="radio"
                                        name="display-mode"
                                        className="mt-0.5 accent-[var(--primary)]"
                                        checked={displayMode === RichMenuDisplayMode.MANUAL}
                                        onChange={() => setDisplayMode(RichMenuDisplayMode.MANUAL)}
                                    />
                                    <span>
                                        <span className="block text-sm font-bold text-slate-700">ซ่อน (เตรียมใช้งาน)</span>
                                        <span className="block text-[11px] text-slate-400">ซิงค์ไป LINE แต่ไม่ตั้งเป็นเมนูหลัก — ใช้กับการผูกรายคนหรือปุ่มสลับเมนู</span>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Right: Image Preview */}
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">รูปภาพเมนู</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="@container w-full aspect-[250/168.6] bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 hover:border-primary/40 transition-colors cursor-pointer overflow-hidden group relative"
                            style={menu?.config?.size ? { aspectRatio: `${menu.config.size.width}/${menu.config.size.height}` } : undefined}
                        >
                            {imagePreview ? (
                                <div className="w-full h-full relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                                    {/* Area overlay from the menu's own saved bounds —
                                        the canvas layout is fixed at creation, so the
                                        stored areas ARE the template (PRD G1). Same
                                        numbered-box affordance as the create page. */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        {areas.map((area, i) => (
                                            <div
                                                key={i}
                                                className="absolute border border-white/80 flex items-center justify-center text-white font-bold text-[10cqw] bg-black/20"
                                                style={{
                                                    left: `${(area.bounds.x / (menu?.config?.size?.width || 2500)) * 100}%`,
                                                    top: `${(area.bounds.y / (menu?.config?.size?.height || 1686)) * 100}%`,
                                                    width: `${(area.bounds.width / (menu?.config?.size?.width || 2500)) * 100}%`,
                                                    height: `${(area.bounds.height / (menu?.config?.size?.height || 1686)) * 100}%`,
                                                }}
                                            >
                                                {i + 1}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-white text-sm font-medium">เปลี่ยนรูปภาพ</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm">คลิกเพื่ออัปโหลดรูปภาพ</span>
                                </div>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                        <p className="text-xs text-slate-400 mt-2">รองรับ JPEG, PNG ขนาด 2500x1686 px</p>
                    </div>
                </div>

                {/* Area Actions */}
                {areas.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div>
                            <h3 className="text-sm font-bold text-slate-600">Area Actions</h3>
                            <p className="text-xs text-slate-400 mt-0.5">กำหนดปลายทางของแต่ละพื้นที่บนเมนู</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {areas.map((area, i) => (
                                <div key={i} className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/60 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-500 uppercase">
                                            พื้นที่ {i + 1}
                                        </span>
                                        <select
                                            value={area.action?.type || 'uri'}
                                            onChange={(e) => handleAreaActionChange(i, 'type', e.target.value)}
                                            className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                                        >
                                            <option value="uri">Open URL</option>
                                            <option value="message">Send Msg</option>
                                            <option value="richmenuswitch">สลับเมนู</option>
                                        </select>
                                    </div>

                                    {area.action?.type === 'uri' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400">WEBSITE URL</label>
                                            <input
                                                className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
                                                value={area.action?.uri || ''}
                                                onChange={(e) => handleAreaActionChange(i, 'uri', e.target.value)}
                                                placeholder="https://"
                                            />
                                        </div>
                                    )}
                                    {area.action?.type === 'message' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400">TEXT / PAYLOAD</label>
                                            <input
                                                className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
                                                value={area.action?.text || ''}
                                                onChange={(e) => handleAreaActionChange(i, 'text', e.target.value)}
                                            />
                                        </div>
                                    )}
                                    {area.action?.type === 'richmenuswitch' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400">สลับไปที่เมนู (ALIAS)</label>
                                            {aliases.length === 0 ? (
                                                <p className="text-[11px] text-amber-600 leading-snug">
                                                    ยังไม่มี alias —{' '}
                                                    <Link href="/admin/rich-menus" className="underline font-bold hover:text-amber-700">
                                                        สร้าง alias ก่อน
                                                    </Link>
                                                </p>
                                            ) : (
                                                <select
                                                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                                                    value={area.action?.richMenuAliasId || ''}
                                                    onChange={(e) => handleAreaActionChange(i, 'richMenuAliasId', e.target.value)}
                                                >
                                                    <option value="">-- เลือก alias --</option>
                                                    {aliases.map((a) => (
                                                        <option key={a.id} value={a.alias_id}>{a.alias_id}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-end items-center gap-3 pt-4 border-t border-slate-100">
                    {/* Sync state machine — same actions the list page offers
                        (PRD G4), so a FAILED or LOCALLY-EDITED menu can be
                        reconciled without navigating away. canPublish gates
                        Set Active on the real sync state, never on a guess. */}
                    {menu && (
                        <div className="flex items-center gap-3 mr-auto">
                            {!menu.line_rich_menu_id ? (
                                <Button size="sm" onClick={handleSync} isLoading={syncBusy} loadingText="กำลังซิงค์...">
                                    Sync to LINE
                                </Button>
                            ) : pendingResync ? (
                                <Button size="sm" variant="outline" onClick={handleSync} isLoading={syncBusy} loadingText="กำลังซิงค์...">
                                    ซิงค์การแก้ไข
                                </Button>
                            ) : menu.status === 'PUBLISHED' ? (
                                <span className="text-[10px] font-black text-emerald-600 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100 tracking-widest leading-none thai-no-break">
                                    Live Now
                                </span>
                            ) : menu.sync_status === RichMenuSyncStatus.FAILED ? (
                                <Button size="sm" variant="outline" onClick={handleSync} isLoading={syncBusy} loadingText="กำลังซิงค์...">
                                    Re-sync
                                </Button>
                            ) : canPublish(menu) ? (
                                <Button size="sm" variant="success" onClick={handlePublish} isLoading={publishBusy} loadingText="กำลังตั้งค่า...">
                                    Set Active
                                </Button>
                            ) : (
                                <Button size="sm" onClick={handleSync} isLoading={syncBusy} loadingText="กำลังซิงค์...">
                                    Sync to LINE
                                </Button>
                            )}
                        </div>
                    )}
                    <Link
                        href="/admin/rich-menus"
                        className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium cursor-pointer"
                    >
                        ยกเลิก
                    </Link>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving || syncBusy}
                        className="px-6 py-2.5 bg-white text-slate-600 rounded-lg border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        บันทึกฉบับร่าง
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={saving || syncBusy}
                        className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                กำลังบันทึกและซิงค์...
                            </>
                        ) : (
                            'บันทึกและซิงค์'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
