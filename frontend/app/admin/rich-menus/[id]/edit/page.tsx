"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { readErrorMessage } from '@/lib/api-error';

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
    image_url: string | null;
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

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        // A "switch menu" area must point at an alias; the backend rejects it
        // otherwise (422), so guard here for a friendly message.
        if (areas.some((a) => a.action?.type === 'richmenuswitch' && !a.action?.richMenuAliasId)) {
            toast({ variant: 'warning', title: 'ยังไม่ได้เลือกเมนูปลายทาง', description: 'พื้นที่ที่ตั้งเป็น "สลับเมนู" ต้องเลือก alias ปลายทางก่อนบันทึก' });
            return;
        }

        setSaving(true);
        try {
            // Update menu details
            const updateRes = await fetch(`${API_BASE}/admin/rich-menus/${menuId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    chat_bar_text: chatBarText,
                    areas
                })
            });

            if (!updateRes.ok) {
                const err = await updateRes.json();
                toast({ variant: 'error', title: 'อัปเดตไม่สำเร็จ', description: `${err.detail}` });
                setSaving(false);
                return;
            }

            // Upload new image if selected
            if (imageFile) {
                const formData = new FormData();
                formData.append('file', imageFile);
                const uploadRes = await fetch(`${API_BASE}/admin/rich-menus/${menuId}/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (!uploadRes.ok) {
                    // Upload failure means the menu is NOT fully saved — show the
                    // error and stay on the page (previously this showed an error
                    // toast and then a success toast and redirected anyway).
                    const detail = await readErrorMessage(uploadRes, 'ไม่สามารถอัปโหลดรูปภาพได้');
                    toast({ variant: 'error', title: 'อัปโหลดรูปภาพไม่สำเร็จ', description: detail });
                    setSaving(false);
                    return;
                }
            }

            toast({ variant: 'success', title: 'บันทึกสำเร็จ', description: 'แก้ไข Rich Menu เรียบร้อยแล้ว' });
            router.push('/admin/rich-menus');
        } catch {
            toast({ variant: 'error', title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถบันทึก Rich Menu ได้' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <LoadingSpinner label="กำลังโหลด..." />;
    }

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
                            <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${menu?.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                }`}>
                                <span className={`w-2 h-2 rounded-full ${menu?.status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                {menu?.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT'}
                            </div>
                        </div>
                    </div>

                    {/* Right: Image Preview */}
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">รูปภาพเมนู</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full aspect-[250/168.6] bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 hover:border-primary/40 transition-colors cursor-pointer overflow-hidden group relative"
                        >
                            {imagePreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm">คลิกเพื่ออัปโหลดรูปภาพ</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white text-sm font-medium">เปลี่ยนรูปภาพ</span>
                            </div>
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
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Link
                        href="/admin/rich-menus"
                        className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium cursor-pointer"
                    >
                        ยกเลิก
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                กำลังบันทึก...
                            </>
                        ) : (
                            'บันทึกการแก้ไข'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
