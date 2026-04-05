'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, Trash2, SquarePen, ChevronDown } from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';

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

const OBJECT_TYPES = ['text', 'flex', 'image', 'sticker', 'video', 'audio', 'location'];

export default function ReplyObjectsPage() {
    const [objects, setObjects] = useState<ReplyObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        object_id: '',
        name: '',
        category: '',
        object_type: 'flex',
        payload: '{}',
        alt_text: ''
    });

    const API_BASE = '/api/v1';

    const fetchObjects = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects`);
            if (res.ok) setObjects(await res.json());
        } catch (error) {
            console.error('Error:', error);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                payload: JSON.parse(formData.payload)
            };

            const url = editingId
                ? `${API_BASE}/admin/reply-objects/${editingId}`
                : `${API_BASE}/admin/reply-objects`;

            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                await fetchObjects();
                resetForm();
            } else {
                const error = await res.json();
                alert(error.detail || 'Error saving');
            }
        } catch {
            alert('Invalid JSON payload');
        }
    };

    const handleEdit = (obj: ReplyObject) => {
        setFormData({
            object_id: obj.object_id,
            name: obj.name,
            category: obj.category || '',
            object_type: obj.object_type,
            payload: JSON.stringify(obj.payload, null, 2),
            alt_text: obj.alt_text || ''
        });
        setEditingId(obj.object_id);
        setShowForm(true);
    };

    const handleDelete = async (objectId: string) => {
        if (!confirm(`Delete $${objectId}?`)) return;

        const res = await fetch(`${API_BASE}/admin/reply-objects/${objectId}`, {
            method: 'DELETE'
        });

        if (res.ok) fetchObjects();
    };

    const resetForm = () => {
        setFormData({ object_id: '', name: '', category: '', object_type: 'flex', payload: '{}', alt_text: '' });
        setEditingId(null);
        setShowForm(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="Reply Objects" subtitle="Manage reusable message templates">
                <Button onClick={() => setShowForm(true)}>
                    + New Template
                </Button>
            </PageHeader>

            {/* Objects Grid */}
            {loading ? (
                <LoadingSpinner label="Loading Assets..." />
            ) : objects.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl border border-dashed border-gray-200 p-20 text-center dark:bg-gray-800 dark:border-gray-600">
                    <div className="w-32 h-32 bg-brand-50 rounded-full flex items-center justify-center mb-10 border border-brand-100 shadow-inner dark:bg-brand-500/10 dark:border-brand-500/20">
                        <Package className="w-12 h-12 text-brand-300 dark:text-brand-400" />
                    </div>
                    <h3 className="text-3xl font-black text-gray-800 mb-4 tracking-tight dark:text-gray-100">Empty Repository</h3>
                    <p className="text-gray-500 text-lg max-w-sm leading-relaxed dark:text-gray-400">No reusable templates found. Create your first template to simplify your automated responses.</p>
                </div>
            ) : (
                <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {objects.map((obj) => (
                        <StaggerItem key={obj.id}>
                        <div
                            className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-brand-200 transition-all duration-300 group relative shadow-sm hover:shadow-lg dark:bg-gray-800 dark:border-gray-700 dark:hover:border-brand-500/30"
                        >
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-brand-600 font-black font-mono text-sm tracking-tighter dark:text-brand-400">${obj.object_id}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-800 group-hover:text-brand-600 transition-colors tracking-tight dark:text-gray-100 dark:group-hover:text-brand-400">{obj.name}</h3>
                                    </div>
                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border shadow-sm ${obj.object_type === 'flex' ? 'bg-brand-50 text-brand-600 border-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20' :
                                        obj.object_type === 'image' ? 'bg-brand-50 text-brand-600 border-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20' :
                                            obj.object_type === 'sticker' ? 'bg-yellow-50 text-yellow-600 border-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20' :
                                                'bg-gray-50 text-gray-500 border-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
                                        }`}>
                                        {obj.object_type}
                                    </span>
                                </div>

                                {obj.category && (
                                    <div className="flex items-center gap-2 mb-4 text-gray-400 uppercase tracking-widest text-[9px] font-bold dark:text-gray-500">
                                        <span className="w-1 h-1 bg-gray-400 rounded-full dark:bg-gray-500" />
                                        {obj.category}
                                    </div>
                                )}

                                <div className="flex gap-2 h-10">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1"
                                        leftIcon={<SquarePen className="w-3.5 h-3.5" />}
                                        onClick={() => handleEdit(obj)}
                                    >
                                        Modify
                                    </Button>
                                    <ActionIconButton
                                        icon={<Trash2 className="w-4 h-4" />}
                                        label="ลบ"
                                        variant="danger"
                                        onClick={() => handleDelete(obj.object_id)}
                                    />
                                </div>
                            </div>
                        </div>
                        </StaggerItem>
                    ))}
                </StaggerContainer>
            )}

            {/* Form Modal */}
            <Modal
                isOpen={showForm}
                onClose={resetForm}
                title={editingId ? 'Edit Object' : 'New Template'}
                maxWidth="2xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 dark:text-gray-400">Universal ID *</label>
                            <input
                                type="text"
                                value={formData.object_id}
                                onChange={(e) => setFormData({ ...formData, object_id: e.target.value })}
                                disabled={!!editingId}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white disabled:opacity-50 transition-all font-mono dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                placeholder="flex_welcome"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 dark:text-gray-400">Internal Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                placeholder="Welcome Message 2.0"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 dark:text-gray-400">Message Protocol *</label>
                            <div className="relative">
                                <select
                                    value={formData.object_type}
                                    onChange={(e) => setFormData({ ...formData, object_type: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all cursor-pointer dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                >
                                    {OBJECT_TYPES.map(t => (
                                        <option key={t} value={t} className="bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-100">{t.toUpperCase()}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 dark:text-gray-400">Grouping Category</label>
                            <input
                                type="text"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                placeholder="Marketing / Support"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 dark:text-gray-400">Alt Text (Mobile/Tablet accessibility)</label>
                        <input
                            type="text"
                            value={formData.alt_text}
                            onChange={(e) => setFormData({ ...formData, alt_text: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                            placeholder="Brief description of the message"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1 dark:text-gray-400">JSON Payload *</label>
                        <textarea
                            value={formData.payload}
                            onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                            rows={10}
                            className="w-full px-6 py-4 bg-gray-900 border border-gray-800 rounded-xl text-green-400 font-mono text-xs focus:outline-none focus:border-brand-500/50 transition-all overscroll-contain"
                            placeholder="{ ... }"
                            required
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button type="submit" className="flex-1">
                            {editingId ? 'Save Modifications' : 'Initialize Template'}
                        </Button>
                        <Button type="button" variant="ghost" onClick={resetForm}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
