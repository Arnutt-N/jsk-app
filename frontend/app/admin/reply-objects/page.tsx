'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Trash2, SquarePen, ChevronDown } from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { StaggerContainer, StaggerItem } from '@/components/ui/PageTransition';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import type { QuickReply } from '@/lib/line/message-types';
import { TemplateEditor } from './_components/editors/TemplateEditor';
import { TextV2Editor } from './_components/editors/TextV2Editor';
import { QuickReplyEditor } from './_components/QuickReplyEditor';
import { MessagePreview } from './_components/preview/MessagePreview';
import {
    safeParsePayload,
    defaultPayloadForType,
    ensureEditorKeys,
    stripEditorKeys,
    findInvalidActionUri,
    URI_SCHEME_ERROR_TH,
} from './_components/payload-utils';

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

const OBJECT_TYPES = [
    'text', 'text_v2', 'flex', 'template',
    'image', 'sticker', 'video', 'audio', 'location', 'imagemap',
];

// Types that have a dedicated structured editor (vs. the raw JSON textarea).
const STRUCTURED_TYPES = new Set(['template', 'text_v2']);

/**
 * FastAPI validation errors (422) return `detail` as an ARRAY of error objects,
 * not a string. Normalize any shape into a single string so the toast never
 * receives an object/array (which throws "Objects are not valid as a React child").
 */
function formatErrorDetail(detail: unknown, fallback = 'Error saving'): string {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const msgs = detail
            .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
            .filter(Boolean);
        if (msgs.length > 0) return msgs.join('; ');
    }
    return fallback;
}

export default function ReplyObjectsPage() {
    const [objects, setObjects] = useState<ReplyObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [rawMode, setRawMode] = useState(false);
    const [formData, setFormData] = useState({
        object_id: '',
        name: '',
        category: '',
        object_type: 'flex',
        payload: '{}',
        alt_text: ''
    });

    const [confirmDelete, setConfirmDelete] = useState<{open: boolean; objectId: string | null}>({open: false, objectId: null});
    const { toast } = useToast();
    const API_BASE = '/api/v1';

    // Parsed payload — single source of truth stays the JSON string in formData.
    const parsedPayload = useMemo(() => safeParsePayload(formData.payload), [formData.payload]);

    const updatePayload = useCallback((next: Record<string, unknown>) => {
        setFormData(prev => ({ ...prev, payload: JSON.stringify(next, null, 2) }));
    }, []);

    const handleTypeChange = (newType: string) => {
        setFormData(prev => {
            const prevPayload = safeParsePayload(prev.payload);
            const next = defaultPayloadForType(newType);
            // Carry the quick-reply modifier across a type switch.
            if (prevPayload.quickReply) next.quickReply = prevPayload.quickReply;
            // Tag editor list items with stable internal keys (react-2).
            return { ...prev, object_type: newType, payload: JSON.stringify(ensureEditorKeys(next), null, 2) };
        });
        setRawMode(false);
    };

    // Entering raw mode strips internal `_key` tags so the JSON matches the
    // exact LINE payload shape; returning to the form re-tags list items so
    // React keys stay stable (react-2).
    const handleToggleRawMode = () => {
        setFormData(prev => {
            const parsed = safeParsePayload(prev.payload);
            const next = rawMode ? ensureEditorKeys(parsed) : stripEditorKeys(parsed);
            return { ...prev, payload: JSON.stringify(next, null, 2) };
        });
        setRawMode(m => !m);
    };

    const handleQuickReplyChange = (qr: QuickReply | undefined) => {
        const next: Record<string, unknown> = { ...parsedPayload };
        if (qr && Array.isArray(qr.items) && qr.items.length > 0) next.quickReply = qr;
        else delete next.quickReply;
        updatePayload(next);
    };

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const parsed: unknown = JSON.parse(formData.payload);

            // sec-1: defense-in-depth — block uri actions outside the scheme
            // allowlist (https/http/tel/mailto/line) before they reach the API.
            const invalidUri = findInvalidActionUri(parsed);
            if (invalidUri) {
                toast({ title: 'ผิดพลาด', description: `${URI_SCHEME_ERROR_TH} (${invalidUri})`, variant: 'error' });
                return;
            }

            const payload = {
                ...formData,
                // Strip internal editor keys so the saved LINE payload shape
                // never changes (react-2 backward-compatibility guarantee).
                payload: stripEditorKeys(parsed)
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
                const error = await res.json().catch(() => ({} as { detail?: unknown }));
                toast({ title: 'ผิดพลาด', description: formatErrorDetail(error.detail), variant: 'error' });
            }
        } catch {
            toast({ title: 'ผิดพลาด', description: 'Invalid JSON payload', variant: 'error' });
        }
    };

    const handleEdit = (obj: ReplyObject) => {
        // Loaded payloads predate internal keys — tag list items once at load
        // time so editor React keys are stable (react-2); stripped on save.
        // Non-object payloads (legacy/edge shapes) pass through untouched.
        const isPlainObject =
            obj.payload !== null && typeof obj.payload === 'object' && !Array.isArray(obj.payload);
        const payloadString = isPlainObject
            ? JSON.stringify(ensureEditorKeys(obj.payload as Record<string, unknown>), null, 2)
            : obj.payload
                ? JSON.stringify(obj.payload, null, 2)
                : '{}';
        setFormData({
            object_id: obj.object_id,
            name: obj.name,
            category: obj.category || '',
            object_type: obj.object_type,
            payload: payloadString,
            alt_text: obj.alt_text || ''
        });
        setEditingId(obj.object_id);
        setRawMode(false);
        setShowForm(true);
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

    const resetForm = () => {
        setFormData({ object_id: '', name: '', category: '', object_type: 'flex', payload: '{}', alt_text: '' });
        setEditingId(null);
        setRawMode(false);
        setShowForm(false);
    };

    const isStructured = STRUCTURED_TYPES.has(formData.object_type);
    const showStructuredEditor = isStructured && !rawMode;

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
                <div className="flex flex-col items-center justify-center min-h-[400px] bg-surface rounded-2xl border border-dashed border-border-default p-20 text-center">
                    <div className="w-32 h-32 bg-brand-50 rounded-full flex items-center justify-center mb-10 border border-brand-100 shadow-inner dark:bg-brand-500/10 dark:border-brand-500/20">
                        <Package className="w-12 h-12 text-brand-300 dark:text-brand-400" />
                    </div>
                    <h3 className="text-3xl font-black text-text-primary mb-4 tracking-tight">Empty Repository</h3>
                    <p className="text-text-tertiary text-lg max-w-sm leading-relaxed">No reusable templates found. Create your first template to simplify your automated responses.</p>
                </div>
            ) : (
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
                                        icon={<SquarePen className="w-4 h-4" />}
                                        label="แก้ไข"
                                        variant="default"
                                        onClick={() => handleEdit(obj)}
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

            {/* Form Modal */}
            <Modal
                isOpen={showForm}
                onClose={resetForm}
                title={editingId ? 'Edit Object' : 'New Template'}
                maxWidth="4xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="ro-field-object-id" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Universal ID *</label>
                            <input
                                id="ro-field-object-id"
                                type="text"
                                value={formData.object_id}
                                onChange={(e) => setFormData({ ...formData, object_id: e.target.value })}
                                disabled={!!editingId}
                                className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface disabled:opacity-50 transition-all font-mono"
                                placeholder="flex_welcome"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="ro-field-name" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Internal Name *</label>
                            <input
                                id="ro-field-name"
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all"
                                placeholder="Welcome Message 2.0"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="ro-field-object-type" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Message Protocol *</label>
                            <div className="relative">
                                <select
                                    id="ro-field-object-type"
                                    value={formData.object_type}
                                    onChange={(e) => handleTypeChange(e.target.value)}
                                    className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-text-primary font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all cursor-pointer"
                                >
                                    {OBJECT_TYPES.map(t => (
                                        <option key={t} value={t} className="bg-surface text-text-primary">{t.toUpperCase()}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary">
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="ro-field-category" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Grouping Category</label>
                            <input
                                id="ro-field-category"
                                type="text"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all"
                                placeholder="Marketing / Support"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="ro-field-alt-text" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Alt Text (Mobile/Tablet accessibility)</label>
                        <input
                            id="ro-field-alt-text"
                            type="text"
                            value={formData.alt_text}
                            onChange={(e) => setFormData({ ...formData, alt_text: e.target.value })}
                            className="w-full px-4 py-3 bg-bg border border-border-default rounded-xl text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all"
                            placeholder="Brief description of the message"
                        />
                    </div>

                    {/* Content editor (left) + live preview (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
                        <div className="space-y-4 min-w-0">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Content</label>
                                {isStructured && (
                                    <button
                                        type="button"
                                        onClick={handleToggleRawMode}
                                        className="text-xs font-bold text-brand-600 hover:text-brand-500 transition-colors"
                                    >
                                        {rawMode ? '↩ ใช้ตัวแก้ไขฟอร์ม' : '</> แก้แบบ JSON'}
                                    </button>
                                )}
                            </div>

                            {showStructuredEditor && formData.object_type === 'template' && (
                                <TemplateEditor payload={parsedPayload} onChange={updatePayload} />
                            )}
                            {showStructuredEditor && formData.object_type === 'text_v2' && (
                                <TextV2Editor payload={parsedPayload} onChange={updatePayload} />
                            )}
                            {!showStructuredEditor && (
                                <textarea
                                    value={formData.payload}
                                    onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                                    rows={12}
                                    className="w-full px-6 py-4 bg-gray-900 border border-gray-800 rounded-xl text-green-400 font-mono text-xs focus:outline-none focus:border-brand-500/50 transition-all overscroll-contain"
                                    placeholder="{ ... }"
                                    required
                                />
                            )}

                            <QuickReplyEditor
                                value={parsedPayload.quickReply as QuickReply | undefined}
                                onChange={handleQuickReplyChange}
                            />
                        </div>

                        <div className="lg:sticky lg:top-0 h-fit space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Live Preview</label>
                            <div className="rounded-xl border border-border-default bg-[#8aa6c8] dark:bg-[#39414d] p-4 overflow-x-auto">
                                <MessagePreview
                                    objectType={formData.object_type}
                                    payload={parsedPayload}
                                    altText={formData.alt_text}
                                />
                            </div>
                        </div>
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
