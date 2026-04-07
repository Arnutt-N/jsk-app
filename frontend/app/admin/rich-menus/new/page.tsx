"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '../../components/PageHeader';

interface TemplateBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface TemplateArea {
    id: number;
    name: string;
    bounds: TemplateBounds;
}

interface TemplateItem {
    id: string;
    name: string;
    areas: TemplateArea[];
}

interface TemplateGroup {
    category: string;
    description: string;
    width: number;
    height: number;
    items: TemplateItem[];
}

interface TemplateSelection {
    category: TemplateGroup;
    item: TemplateItem;
}

interface MenuAction {
    type: 'uri' | 'message';
    uri: string;
    label: string;
    text: string;
}

interface ReplyObjectLite {
    id: number;
    object_id: string;
    name: string;
}

interface AutoReplyLite {
    id: number;
    name: string;
}

const PRESET_TEMPLATES: TemplateGroup[] = [
    {
        category: 'Large',
        description: 'A larger menu for displaying more items.',
        width: 2500,
        height: 1686,
        items: [
            {
                id: '6-buttons',
                name: '6 Buttons (3x2)',
                areas: [
                    { id: 1, name: 'Area 1', bounds: { x: 0, y: 0, width: 833, height: 843 } },
                    { id: 2, name: 'Area 2', bounds: { x: 833, y: 0, width: 834, height: 843 } },
                    { id: 3, name: 'Area 3', bounds: { x: 1667, y: 0, width: 833, height: 843 } },
                    { id: 4, name: 'Area 4', bounds: { x: 0, y: 843, width: 833, height: 843 } },
                    { id: 5, name: 'Area 5', bounds: { x: 833, y: 843, width: 834, height: 843 } },
                    { id: 6, name: 'Area 6', bounds: { x: 1667, y: 843, width: 833, height: 843 } },
                ]
            },
            {
                id: '4-buttons',
                name: '4 Buttons (2x2)',
                areas: [
                    { id: 1, name: 'Top Left', bounds: { x: 0, y: 0, width: 1250, height: 843 } },
                    { id: 2, name: 'Top Right', bounds: { x: 1250, y: 0, width: 1250, height: 843 } },
                    { id: 3, name: 'Bottom Left', bounds: { x: 0, y: 843, width: 1250, height: 843 } },
                    { id: 4, name: 'Bottom Right', bounds: { x: 1250, y: 843, width: 1250, height: 843 } },
                ]
            },
            {
                id: '3-buttons-top',
                name: '3 Buttons (1 Top, 2 Bottom)',
                areas: [
                    { id: 1, name: 'Top', bounds: { x: 0, y: 0, width: 2500, height: 843 } },
                    { id: 2, name: 'Bottom Left', bounds: { x: 0, y: 843, width: 1250, height: 843 } },
                    { id: 3, name: 'Bottom Right', bounds: { x: 1250, y: 843, width: 1250, height: 843 } },
                ]
            },
            {
                id: '3-buttons-left',
                name: '3 Buttons (1 Left, 2 Right)',
                areas: [
                    { id: 1, name: 'Main (Left)', bounds: { x: 0, y: 0, width: 1667, height: 1686 } },
                    { id: 2, name: 'Top Right', bounds: { x: 1667, y: 0, width: 833, height: 843 } },
                    { id: 3, name: 'Bottom Right', bounds: { x: 1667, y: 843, width: 833, height: 843 } },
                ]
            },
            {
                id: '2-buttons-rows',
                name: '2 Buttons (Rows)',
                areas: [
                    { id: 1, name: 'Top', bounds: { x: 0, y: 0, width: 2500, height: 843 } },
                    { id: 2, name: 'Bottom', bounds: { x: 0, y: 843, width: 2500, height: 843 } },
                ]
            },
            {
                id: '2-buttons-cols',
                name: '2 Buttons (Columns)',
                areas: [
                    { id: 1, name: 'Left', bounds: { x: 0, y: 0, width: 1250, height: 1686 } },
                    { id: 2, name: 'Right', bounds: { x: 1250, y: 0, width: 1250, height: 1686 } },
                ]
            },
            {
                id: '1-button-full',
                name: '1 Button (Full)',
                areas: [
                    { id: 1, name: 'Full Area', bounds: { x: 0, y: 0, width: 2500, height: 1686 } },
                ]
            }
        ]
    },
    {
        category: 'Compact',
        description: 'A less obtrusive menu to be used together with chat functions.',
        width: 2500,
        height: 843,
        items: [
            {
                id: '3-buttons-compact',
                name: '3 Buttons (Columns)',
                areas: [
                    { id: 1, name: 'Left', bounds: { x: 0, y: 0, width: 833, height: 843 } },
                    { id: 2, name: 'Middle', bounds: { x: 833, y: 0, width: 834, height: 843 } },
                    { id: 3, name: 'Right', bounds: { x: 1667, y: 0, width: 833, height: 843 } },
                ]
            },
            {
                id: '2-buttons-compact-cols',
                name: '2 Buttons (Columns)',
                areas: [
                    { id: 1, name: 'Left', bounds: { x: 0, y: 0, width: 1250, height: 843 } },
                    { id: 2, name: 'Right', bounds: { x: 1250, y: 0, width: 1250, height: 843 } },
                ]
            },
            {
                id: '2-buttons-compact-asym',
                name: '2 Buttons (Small Left)',
                areas: [
                    { id: 1, name: 'Left', bounds: { x: 0, y: 0, width: 833, height: 843 } },
                    { id: 2, name: 'Right', bounds: { x: 833, y: 0, width: 1667, height: 843 } },
                ]
            },
            {
                id: '1-button-compact-full',
                name: '1 Button (Full)',
                areas: [
                    { id: 1, name: 'Full Area', bounds: { x: 0, y: 0, width: 2500, height: 843 } },
                ]
            }
        ]
    }
];

const TemplateIcon = ({ areas, width, height, isActive }: { areas: TemplateArea[]; width: number; height: number; isActive: boolean }) => (
    <div
        className={`relative aspect-[250/168.6] w-full border-2 transition-all duration-300 overflow-hidden cursor-pointer ${isActive
            ? 'border-primary bg-primary/8 shadow-md ring-2 ring-primary/20'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 hover:shadow-sm'
            }`}
        style={{ aspectRatio: `${width}/${height}` }}
    >
        <div className="absolute inset-0 grid overflow-hidden" style={{
            gridTemplateRows: height === 1686 ? '1fr 1fr' : '1fr'
        }}>
            {areas.map((area, i) => (
                <div
                    key={i}
                    className={`border border-slate-300 flex items-center justify-center text-[8px] transition-colors ${isActive ? 'border-primary/20' : 'border-slate-300'
                        }`}
                    style={{
                        position: 'absolute',
                        left: `${(area.bounds.x / 2500) * 100}%`,
                        top: `${(area.bounds.y / (height)) * 100}%`,
                        width: `${(area.bounds.width / 2500) * 100}%`,
                        height: `${(area.bounds.height / height) * 100}%`,
                        margin: '-0.5px',
                    }}
                >
                </div>
            ))}
        </div>
    </div>
);

export default function NewRichMenuPage() {
    const router = useRouter();
    const API_BASE = '/api/v1';

    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateSelection | null>({
        category: PRESET_TEMPLATES[0],
        item: PRESET_TEMPLATES[0].items[0]
    });
    // Temporary state for modal selection
    const [pendingTemplate, setPendingTemplate] = useState<TemplateSelection | null>(null);

    const [form, setForm] = useState({
        name: '',
        chat_bar_text: 'Open Menu',
    });

    const [actions, setActions] = useState<MenuAction[]>([]);
    const [replyObjects, setReplyObjects] = useState<ReplyObjectLite[]>([]);
    const [autoReplies, setAutoReplies] = useState<AutoReplyLite[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Synchronize pendingTemplate when modal opens
    useEffect(() => {
        if (isTemplateModalOpen) {
            setPendingTemplate(selectedTemplate);
        }
    }, [isTemplateModalOpen, selectedTemplate]);

    useEffect(() => {
        if (!selectedTemplate) return;

        setActions(selectedTemplate.item.areas.map((a: TemplateArea) => ({
            type: 'uri',
            uri: 'https://',
            label: a.name,
            text: ''
        })));
    }, [selectedTemplate]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [objRes, intentRes] = await Promise.all([
                    fetch(`${API_BASE}/admin/reply-objects`),
                    fetch(`${API_BASE}/admin/intents/categories`)
                ]);
                if (objRes.ok) setReplyObjects((await objRes.json()) as ReplyObjectLite[]);
                if (intentRes.ok) setAutoReplies((await intentRes.json()) as AutoReplyLite[]);
            } catch (error) {
                console.error("Data fetch failed", error);
            }
        };
        fetchData();
    }, [API_BASE]);

    const handleActionChange = (index: number, field: string, value: string) => {
        const newActions = [...actions];
        newActions[index] = { ...newActions[index], [field]: value };

        if (field === 'object_id') {
            const obj = replyObjects.find(o => o.object_id === value);
            if (obj) {
                newActions[index].type = 'message';
                newActions[index].text = `get_obj:${value}`;
                newActions[index].label = obj.name;
            }
        } else if (field === 'intent_name') {
            newActions[index].type = 'message';
            newActions[index].text = value;
            newActions[index].label = value;
        }

        setActions(newActions);
    };

    const handleSave = async (syncToLine: boolean = false) => {
        if (!form.name || !file || !selectedTemplate) {
            alert("Please provide a name, upload an image, and select a template.");
            return;
        }

        setIsSaving(true);
        try {
            // 1. Save locally as DRAFT
            const createPayload = {
                name: form.name,
                chat_bar_text: form.chat_bar_text,
                template_type: selectedTemplate.item.id,
                areas: selectedTemplate.item.areas.map((area: TemplateArea, i: number) => ({
                    bounds: area.bounds,
                    action: actions[i]
                }))
            };

            const createRes = await fetch(`${API_BASE}/admin/rich-menus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createPayload)
            });

            if (!createRes.ok) throw new Error("Failed to save local draft");
            const menu = await createRes.json();

            // 2. Upload Image locally
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch(`${API_BASE}/admin/rich-menus/${menu.id}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) throw new Error("Failed to upload image locally");

            // 3. Optional: Sync to LINE
            if (syncToLine) {
                const syncRes = await fetch(`${API_BASE}/admin/rich-menus/${menu.id}/sync`, {
                    method: 'POST'
                });
                if (!syncRes.ok) {
                    const errorData = await syncRes.json();
                    alert(`Saved locally, but Sync to LINE failed: ${errorData.detail || 'Unknown error'}`);
                    router.push('/admin/rich-menus');
                    return;
                }
            }

            alert(syncToLine ? "Rich Menu created and synced successfully!" : "Rich Menu saved as draft!");
            router.push('/admin/rich-menus');
        } catch (error: unknown) {
            alert(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleApplyTemplate = () => {
        if (pendingTemplate) {
            setSelectedTemplate(pendingTemplate);
        }
        setIsTemplateModalOpen(false);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <PageHeader title="New Rich Menu" className="mb-8">
                <Link
                    href="/admin/rich-menus"
                    className="p-2 rounded-xl hover:bg-surface-hover transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-text-secondary" />
                </Link>
            </PageHeader>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Configuration Form */}
                <div className="lg:col-span-2 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 space-y-4">
                        <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/8 text-primary text-xs flex items-center justify-center font-bold">1</span>
                            Basic Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Internal Name</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
                                    placeholder="e.g. Summer Campaign 2024"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chat Bar Text</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
                                    value={form.chat_bar_text}
                                    onChange={(e) => setForm({ ...form, chat_bar_text: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-primary/8 text-primary text-xs flex items-center justify-center font-bold">2</span>
                                Template & Actions
                            </h2>
                            <button
                                onClick={() => setIsTemplateModalOpen(true)}
                                className="text-sm font-bold text-primary hover:text-primary-dark flex items-center gap-1 transition-all group cursor-pointer"
                            >
                                <svg className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Change Template
                            </button>
                        </div>

                        {selectedTemplate && (
                            <div className="flex gap-4 items-center p-4 bg-primary/8 rounded-2xl border border-primary/10 group hover:bg-primary/12 transition-all duration-300">
                                <div className="w-24 shrink-0 shadow-sm overflow-hidden group-hover:shadow-md transition-shadow">
                                    <TemplateIcon
                                        areas={selectedTemplate.item.areas}
                                        width={selectedTemplate.category.width}
                                        height={selectedTemplate.category.height}
                                        isActive={true}
                                    />
                                </div>
                                <div>
                                    <div className="font-bold text-primary text-lg">{selectedTemplate.item.name}</div>
                                    <div className="text-xs text-primary flex items-center gap-2">
                                        <span className="bg-white/80 px-2 py-0.5 rounded border border-primary/10">{selectedTemplate.category.category}</span>
                                        <span className="font-mono">{selectedTemplate.category.width}x{selectedTemplate.category.height}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            {selectedTemplate?.item.areas.map((area: TemplateArea, i: number) => (
                                <div key={area.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-200/60 space-y-4 hover:border-primary/40 hover:bg-white transition-all duration-300 group">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold group-hover:bg-primary group-hover:text-white transition-all">
                                                {i + 1}
                                            </span>
                                            <span className="text-xs font-bold text-slate-500 uppercase">
                                                {area.name}
                                            </span>
                                        </div>
                                        <select
                                            value={actions[i]?.type || 'uri'}
                                            onChange={(e) => handleActionChange(i, 'type', e.target.value)}
                                            className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                                        >
                                            <option value="uri">Open URL</option>
                                            <option value="message">Send Msg</option>
                                        </select>
                                    </div>

                                    <div className="space-y-3">
                                        {actions[i]?.type === 'uri' ? (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400">WEBSITE URL</label>
                                                <input
                                                    className="w-full text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
                                                    value={actions[i]?.uri || ''}
                                                    onChange={(e) => handleActionChange(i, 'uri', e.target.value)}
                                                    placeholder="https://"
                                                />
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400">TEXT / PAYLOAD</label>
                                                    <input
                                                        className="w-full text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 outline-none"
                                                        value={actions[i]?.text || ''}
                                                        onChange={(e) => handleActionChange(i, 'text', e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400">SYSTEM OBJECTS</label>
                                                    <select
                                                        className="w-full text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-brand-500/20 outline-none cursor-pointer"
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val.startsWith('intent:')) handleActionChange(i, 'intent_name', val.split(':')[1]);
                                                            else if (val.startsWith('obj:')) handleActionChange(i, 'object_id', val.split(':')[1]);
                                                        }}
                                                    >
                                                        <option value="">-- Quick Select --</option>
                                                        <optgroup label="Auto Replies">
                                                            {autoReplies.map(cat => (
                                                                <option key={cat.id} value={`intent:${cat.name}`}>{cat.name}</option>
                                                            ))}
                                                        </optgroup>
                                                        <optgroup label="Reply Objects">
                                                            {replyObjects.map(obj => (
                                                                <option key={obj.id} value={`obj:${obj.object_id}`}>{obj.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Image Upload & Preview */}
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 space-y-6 sticky top-6">
                        <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/8 text-primary text-xs flex items-center justify-center font-bold">3</span>
                            Design & Sync
                        </h2>

                        <div className="space-y-4">
                            <label className="block bg-slate-100 border-2 border-dashed border-slate-300 hover:border-primary/40 transition-all cursor-pointer overflow-hidden relative group"
                                style={{ aspectRatio: selectedTemplate ? `${selectedTemplate.category.width}/${selectedTemplate.category.height}` : '2500/1686' }}
                            >
                                {file ? (
                                    <div className="w-full h-full relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={URL.createObjectURL(file)} alt="Rich menu preview" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" />
                                        <div className="absolute inset-0 pointer-events-none opacity-40">
                                            {selectedTemplate?.item.areas.map((area: TemplateArea, i: number) => (
                                                <div key={i} className="absolute border border-white flex items-center justify-center text-white font-bold text-3xl bg-black bg-opacity-20"
                                                    style={{
                                                        left: `${(area.bounds.x / 2500) * 100}%`,
                                                        top: `${(area.bounds.y / selectedTemplate.category.height) * 100}%`,
                                                        width: `${(area.bounds.width / 2500) * 100}%`,
                                                        height: `${(area.bounds.height / selectedTemplate.category.height) * 100}%`,
                                                    }}
                                                >
                                                    {i + 1}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-bold text-slate-500">Upload Rich Menu Image</span>
                                        <span className="text-[10px]">{selectedTemplate?.category.width}x{selectedTemplate?.category.height} pixels</span>
                                    </div>
                                )}
                                <input type="file" className="hidden" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                            </label>

                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                                <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-[10px] text-amber-700 leading-normal">
                                    Ensure your image strictly matches the dimensions of the selected template. Max size 1MB.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleSave(false)}
                                disabled={isSaving}
                                className={`w-full py-3 rounded-xl font-bold transition-all border-2 border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50`}
                            >
                                {isSaving ? 'Processing...' : 'Save as Draft Only'}
                            </button>

                            <button
                                onClick={() => handleSave(true)}
                                disabled={isSaving}
                                className={`w-full py-4 rounded-2xl font-bold transition-all shadow-xl flex items-center justify-center gap-2 group ${isSaving ? 'bg-slate-300 text-slate-500' : 'bg-gradient-to-br from-primary to-primary-dark hover:bg-primary-dark text-white shadow-primary/20'
                                    }`}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        Save & Sync to LINE
                                        <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Template Modal */}
            {isTemplateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsTemplateModalOpen(false)}></div>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 animate-in zoom-in-95 fade-in duration-300 border border-white/20">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Select a template</h2>
                                <p className="text-sm text-slate-500">Choose a layout that fits your content strategy</p>
                            </div>
                            <button
                                onClick={() => setIsTemplateModalOpen(false)}
                                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-thin p-8 space-y-12 bg-slate-100/30">
                            {PRESET_TEMPLATES.map((group) => (
                                <div key={group.category} className="space-y-6">
                                    <div className="flex items-baseline gap-3">
                                        <h3 className="text-xl font-bold text-slate-800">{group.category}</h3>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{group.width}x{group.height}</span>
                                        <div className="h-px bg-slate-200 flex-grow"></div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
                                        {group.items.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => setPendingTemplate({ category: group, item })}
                                                className="group space-y-3 text-center"
                                            >
                                                <div className="transform transition-transform active:scale-95 duration-200">
                                                    <TemplateIcon
                                                        areas={item.areas}
                                                        width={group.width}
                                                        height={group.height}
                                                        isActive={pendingTemplate?.item.id === item.id}
                                                    />
                                                </div>
                                                <div className={`text-[11px] font-bold uppercase tracking-tight transition-colors ${pendingTemplate?.item.id === item.id ? 'text-primary' : 'text-slate-500 group-hover:text-slate-800'
                                                    }`}>
                                                    {item.name}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 border-t border-slate-100 flex justify-end gap-4 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
                            <button
                                onClick={() => setIsTemplateModalOpen(false)}
                                className="px-8 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplyTemplate}
                                className="px-12 py-3 rounded-2xl font-bold text-white bg-gradient-to-br from-primary to-primary-dark hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 cursor-pointer active:scale-95 transform duration-150"
                            >
                                Apply Design
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
