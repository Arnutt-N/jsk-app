"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface RichMenuArea {
    bounds: { x: number; y: number; w: number; h: number };
    action: {
        type: string;
        label: string;
        uri?: string;
        text?: string;
        data?: string;
        displayText?: string;
    };
}

interface RichMenu {
    id: number;
    name: string;
    chat_bar_text: string;
    line_rich_menu_id: string | null;
    status: string;
    image_path: string | null;
    config: {
        size: { width: number; height: number };
        areas: RichMenuArea[];
    };
}

export default function EditRichMenuPage() {
    const params = useParams();
    const router = useRouter();
    const menuId = params.id as string;

    const [menu, setMenu] = useState<RichMenu | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [chatBarText, setChatBarText] = useState('');
    const [areas, setAreas] = useState<RichMenuArea[]>([]);
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
                if (data.image_path) {
                    const baseHost = API_BASE.split('/api/')[0];
                    setImagePreview(`${baseHost}/${data.image_path}`);
                }
            } else {
                alert('Rich Menu not found');
                router.push('/admin/rich-menus');
            }
        } catch (error) {
            console.error('Failed to fetch rich menu', error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, menuId, router]);

    useEffect(() => {
        fetchMenu();
    }, [fetchMenu]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
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
                alert(`Update failed: ${err.detail}`);
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
                    alert('Image upload failed');
                }
            }

            alert('เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย!');
            router.push('/admin/rich-menus');
        } catch {
            alert('Error saving rich menu');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-24">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-700">Edit Rich Menu</h1>
                    <p className="text-sm text-slate-500 mt-1">เน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธโฌเน€เธเธเน€เธยเน€เธเธ: {menu?.name}</p>
                </div>
                <Link
                    href="/admin/rich-menus"
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium cursor-pointer"
                >
                    เนยย เน€เธยเน€เธเธ…เน€เธเธ‘เน€เธย
                </Link>
            </div>

            {/* Form */}
            <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">เน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธโฌเน€เธเธเน€เธยเน€เธเธ</label>
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
                        <label className="block text-sm font-medium text-slate-600 mb-2">เน€เธเธเน€เธเธเน€เธยเน€เธย เน€เธเธ’เน€เธยเน€เธโฌเน€เธเธเน€เธยเน€เธเธ</label>
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
                                    <span className="text-sm">เน€เธยเน€เธเธ…เน€เธเธ”เน€เธยเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธย เน€เธเธ’เน€เธย</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white text-sm font-medium">เน€เธโฌเน€เธยเน€เธเธ…เน€เธเธ•เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธย เน€เธเธ’เน€เธย</span>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                        <p className="text-xs text-slate-400 mt-2">เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธย JPEG, PNG เน€เธยเน€เธยเน€เธเธ’เน€เธโ€ 2500x1686 px</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Link
                        href="/admin/rich-menus"
                        className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium cursor-pointer"
                    >
                        เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                                เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธย...
                            </>
                        ) : (
                            'เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธย'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
