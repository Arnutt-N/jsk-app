'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import type { QuickReply } from '@/lib/line/message-types';
import { TemplateEditor } from '@/app/admin/reply-objects/_components/editors/TemplateEditor';
import { TextV2Editor } from '@/app/admin/reply-objects/_components/editors/TextV2Editor';
import { QuickReplyEditor } from '@/app/admin/reply-objects/_components/QuickReplyEditor';
import { MessagePreview } from '@/app/admin/reply-objects/_components/preview/MessagePreview';
import {
    safeParsePayload,
    defaultPayloadForType,
    ensureEditorKeys,
    stripEditorKeys,
    findInvalidActionUri,
    URI_SCHEME_ERROR_TH,
} from '@/app/admin/reply-objects/_components/payload-utils';

export const OBJECT_TYPES = [
    'text', 'text_v2', 'flex', 'template',
    'image', 'sticker', 'video', 'audio', 'location', 'imagemap',
];

// Types that have a dedicated structured editor (vs. the raw JSON textarea).
const STRUCTURED_TYPES = new Set(['template', 'text_v2']);

export interface ReplyObjectFormData {
    object_id: string;
    name: string;
    category: string;
    object_type: string;
    payload: string;
    alt_text: string;
}

export const EMPTY_REPLY_OBJECT_FORM: ReplyObjectFormData = {
  object_id: '',
  name: '',
  category: '',
  object_type: 'flex',
  payload: '{}',
  alt_text: '',
};

/**
 * FastAPI validation errors (422) return `detail` as an ARRAY of error objects,
 * not a string. Normalize any shape into a single string so the toast never
 * receives an object/array (which throws "Objects are not valid as a React child").
 */
export function formatErrorDetail(detail: unknown, fallback = 'Error saving'): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
      .filter(Boolean);
    if (msgs.length > 0) return msgs.join('; ');
  }
  return fallback;
}

interface ReplyObjectFormProps {
    initial: ReplyObjectFormData;
    /** Edit mode locks the universal ID (it is the record key). */
    lockObjectId: boolean;
    submitLabel: string;
    /** Parent performs the API call; return true on success. */
    onSave: (data: ReplyObjectFormData) => Promise<boolean>;
    onCancel: () => void;
}

/**
 * Shared create/edit form for reply objects. Used by the full `new` page and
 * the edit modal so both stay identical without duplicating 150 lines.
 */
export function ReplyObjectForm({ initial, lockObjectId, submitLabel, onSave, onCancel }: ReplyObjectFormProps) {
    const { toast } = useToast();
    const [formData, setFormData] = useState<ReplyObjectFormData>(initial);
    const [rawMode, setRawMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // Parsed payload — single source of truth stays the JSON string in formData.
    const parsedPayload = useMemo(() => safeParsePayload(formData.payload), [formData.payload]);
    const isStructured = STRUCTURED_TYPES.has(formData.object_type);
    const showStructuredEditor = isStructured && !rawMode;

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(formData.payload);
        } catch {
            toast({ title: 'ผิดพลาด', description: 'Invalid JSON payload', variant: 'error' });
            return;
        }
        // sec-1: defense-in-depth — block uri actions outside the scheme
        // allowlist (https/http/tel/mailto/line) before they reach the API.
        const invalidUri = findInvalidActionUri(parsed);
        if (invalidUri) {
            toast({ title: 'ผิดพลาด', description: `${URI_SCHEME_ERROR_TH} (${invalidUri})`, variant: 'error' });
            return;
        }
        setSaving(true);
        try {
            const ok = await onSave({
                ...formData,
                // Strip internal editor keys so the saved LINE payload shape
                // never changes (react-2 backward-compatibility guarantee).
                payload: JSON.stringify(stripEditorKeys(parsed)),
            });
            if (!ok) setSaving(false);
        } catch (error) {
            logger.error('Error saving reply object:', error);
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label htmlFor="ro-field-object-id" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Universal ID *</label>
                    <Input
                        id="ro-field-object-id"
                        type="text"
                        value={formData.object_id}
                        onChange={(e) => setFormData({ ...formData, object_id: e.target.value })}
                        disabled={lockObjectId}
                        className="font-bold font-mono"
                        placeholder="flex_welcome"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="ro-field-name" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Internal Name *</label>
                    <Input
                        id="ro-field-name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="font-bold"
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
                            className="w-full h-10 px-4 py-0 bg-surface border border-border-default rounded-xl text-sm text-text-primary font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all cursor-pointer"
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
                    <Input
                        id="ro-field-category"
                        type="text"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="font-bold"
                        placeholder="Marketing / Support"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label htmlFor="ro-field-alt-text" className="text-[10px] font-black uppercase tracking-widest text-text-tertiary ml-1">Alt Text (Mobile/Tablet accessibility)</label>
                <Input
                    id="ro-field-alt-text"
                    type="text"
                    value={formData.alt_text}
                    onChange={(e) => setFormData({ ...formData, alt_text: e.target.value })}
                    className="font-bold"
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

                    <p className="text-[11px] leading-relaxed text-text-tertiary ml-1">
                        อ้างถึงในคำตอบด้วยรหัส เช่น <code className="font-mono">$jsk_menu</code> (วางท้ายข้อความ คั่นด้วยเว้นวรรค) — การ์ด flex ที่อ้างถึงจะส่งทั้งก้อน ไม่ถูกตัด · หลีกเลี่ยงตัวเลขหลัง $ เช่น <code className="font-mono">$100</code> (จะหายไป)
                    </p>

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
                <Button type="submit" className="flex-1" disabled={saving}>
                    {submitLabel}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

export default ReplyObjectForm;
