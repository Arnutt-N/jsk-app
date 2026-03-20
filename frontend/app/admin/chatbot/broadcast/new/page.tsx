'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    FileText,
    Image as ImageIcon,
    Code2,
    Send,
    Clock,
    Users,
    Eye,
} from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';

type MessageType = 'text' | 'image' | 'flex';

interface BroadcastDraft {
    title: string;
    message_type: MessageType;
    content: Record<string, unknown>;
    target_audience: 'all' | 'specific';
}

const STEPS = [
    { label: 'เลือกประเภท', icon: <FileText className="w-4 h-4" /> },
    { label: 'เขียนข้อความ', icon: <Code2 className="w-4 h-4" /> },
    { label: 'เลือกกลุ่มเป้าหมาย', icon: <Users className="w-4 h-4" /> },
    { label: 'ตรวจสอบและส่ง', icon: <Eye className="w-4 h-4" /> },
];

const TYPE_OPTIONS: { type: MessageType; label: string; desc: string; icon: React.ReactNode }[] = [
    { type: 'text', label: 'ข้อความ', desc: 'ส่งข้อความตัวอักษรธรรมดา', icon: <FileText className="w-8 h-8" /> },
    { type: 'image', label: 'รูปภาพ', desc: 'ส่งรูปภาพพร้อม URL', icon: <ImageIcon className="w-8 h-8" /> },
    { type: 'flex', label: 'Flex Message', desc: 'ส่ง Flex Message ด้วย JSON', icon: <Code2 className="w-8 h-8" /> },
];

export default function BroadcastCreatePage() {
    const router = useRouter();
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<BroadcastDraft>({
        title: '',
        message_type: 'text',
        content: {},
        target_audience: 'all',
    });

    // Separate state for form fields to avoid re-render issues
    const [textContent, setTextContent] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imagePreviewUrl, setImagePreviewUrl] = useState('');
    const [flexJson, setFlexJson] = useState('');
    const [flexAltText, setFlexAltText] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');

    const canProceed = (): boolean => {
        switch (step) {
            case 0: return !!draft.message_type;
            case 1: {
                if (!draft.title.trim()) return false;
                if (draft.message_type === 'text') return !!textContent.trim();
                if (draft.message_type === 'image') return !!imageUrl.trim();
                if (draft.message_type === 'flex') return !!flexJson.trim();
                return false;
            }
            case 2: return true;
            case 3: return true;
            default: return false;
        }
    };

    const buildContent = (): Record<string, unknown> => {
        switch (draft.message_type) {
            case 'text': return { text: textContent };
            case 'image': return { original_url: imageUrl, preview_url: imagePreviewUrl || imageUrl };
            case 'flex': {
                try {
                    return { alt_text: flexAltText || draft.title, flex: JSON.parse(flexJson) };
                } catch {
                    return { alt_text: flexAltText || draft.title, flex: {} };
                }
            }
            default: return {};
        }
    };

    const handleSaveDraft = async () => {
        setSaving(true);
        try {
            const body = {
                title: draft.title,
                message_type: draft.message_type,
                content: buildContent(),
                target_audience: draft.target_audience,
            };
            const res = await fetch(`${API_BASE}/admin/broadcasts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Failed to save');
            const data = await res.json();
            router.push(`/admin/chatbot/broadcast/${data.id}`);
        } catch (err) {
            console.error(err);
            alert('บันทึกไม่สำเร็จ');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAndSend = async () => {
        setSaving(true);
        try {
            const body = {
                title: draft.title,
                message_type: draft.message_type,
                content: buildContent(),
                target_audience: draft.target_audience,
            };
            const createRes = await fetch(`${API_BASE}/admin/broadcasts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!createRes.ok) throw new Error('Failed to create');
            const created = await createRes.json();

            const sendRes = await fetch(`${API_BASE}/admin/broadcasts/${created.id}/send`, { method: 'POST' });
            if (!sendRes.ok) {
                const err = await sendRes.json();
                throw new Error(err.detail || 'Failed to send');
            }
            router.push('/admin/chatbot/broadcast');
        } catch (err: unknown) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAndSchedule = async () => {
        if (!scheduleDate) { alert('กรุณาเลือกวันเวลาที่ต้องการส่ง'); return; }
        setSaving(true);
        try {
            const body = {
                title: draft.title,
                message_type: draft.message_type,
                content: buildContent(),
                target_audience: draft.target_audience,
            };
            const createRes = await fetch(`${API_BASE}/admin/broadcasts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!createRes.ok) throw new Error('Failed to create');
            const created = await createRes.json();

            const schedRes = await fetch(`${API_BASE}/admin/broadcasts/${created.id}/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduled_at: new Date(scheduleDate).toISOString() }),
            });
            if (!schedRes.ok) throw new Error('Failed to schedule');
            router.push('/admin/chatbot/broadcast');
        } catch (err) {
            console.error(err);
            alert('ตั้งเวลาไม่สำเร็จ');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="สร้างข้อความ Broadcast" subtitle="สร้างข้อความใหม่เพื่อส่งถึงผู้ติดตาม LINE OA">
                <Button variant="outline" size="sm" onClick={() => router.push('/admin/chatbot/broadcast')} className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    กลับ
                </Button>
            </PageHeader>

            {/* Stepper */}
            <Card glass className="border-none shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        {STEPS.map((s, i) => (
                            <div key={i} className="flex items-center flex-1">
                                <button
                                    onClick={() => { if (i < step) setStep(i); }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                                        i === step
                                            ? 'bg-brand-500 text-white shadow-md'
                                            : i < step
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 cursor-pointer hover:bg-green-200'
                                                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                                    }`}
                                >
                                    {i < step ? <Check className="w-4 h-4" /> : s.icon}
                                    <span className="hidden sm:inline">{s.label}</span>
                                </button>
                                {i < STEPS.length - 1 && (
                                    <div className={`flex-1 h-0.5 mx-2 rounded ${i < step ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Step content */}
            <Card glass className="border-none shadow-sm">
                <CardContent className="p-6">
                    {/* Step 0: Choose type */}
                    {step === 0 && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-text-primary">เลือกประเภทข้อความ</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {TYPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.type}
                                        onClick={() => setDraft(d => ({ ...d, message_type: opt.type }))}
                                        className={`p-6 rounded-2xl border-2 transition-all text-left ${
                                            draft.message_type === opt.type
                                                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-md'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                    >
                                        <div className={`mb-3 ${draft.message_type === opt.type ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}>
                                            {opt.icon}
                                        </div>
                                        <div className="text-sm font-bold text-text-primary">{opt.label}</div>
                                        <div className="text-xs text-text-tertiary mt-1">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 1: Compose message */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-text-primary">เขียนข้อความ</h2>

                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-1.5">ชื่อแคมเปญ *</label>
                                <Input
                                    value={draft.title}
                                    onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
                                    placeholder="เช่น แจ้งข่าวสารประจำเดือน"
                                />
                            </div>

                            {draft.message_type === 'text' && (
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1.5">เนื้อหาข้อความ *</label>
                                    <Textarea
                                        value={textContent}
                                        onChange={(e) => setTextContent(e.target.value)}
                                        placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                                        size="lg"
                                    />
                                    <p className="text-xs text-text-tertiary mt-1">{textContent.length} / 5000 ตัวอักษร</p>
                                </div>
                            )}

                            {draft.message_type === 'image' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">URL รูปภาพ (HTTPS) *</label>
                                        <Input
                                            value={imageUrl}
                                            onChange={(e) => setImageUrl(e.target.value)}
                                            placeholder="https://example.com/image.jpg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">URL รูปภาพตัวอย่าง (ไม่บังคับ)</label>
                                        <Input
                                            value={imagePreviewUrl}
                                            onChange={(e) => setImagePreviewUrl(e.target.value)}
                                            placeholder="https://example.com/preview.jpg"
                                        />
                                    </div>
                                    {imageUrl && (
                                        <div className="mt-4">
                                            <p className="text-xs text-text-tertiary mb-2">ตัวอย่าง:</p>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={imageUrl} alt="Preview" className="max-w-xs rounded-xl border border-gray-200 dark:border-gray-700" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {draft.message_type === 'flex' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">Alt Text</label>
                                        <Input
                                            value={flexAltText}
                                            onChange={(e) => setFlexAltText(e.target.value)}
                                            placeholder="ข้อความสำรอง (แสดงเมื่อเปิดดูไม่ได้)"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">Flex JSON *</label>
                                        <Textarea
                                            value={flexJson}
                                            onChange={(e) => setFlexJson(e.target.value)}
                                            placeholder='{"type": "bubble", "body": { ... }}'
                                            size="lg"
                                            className="font-mono text-xs"
                                        />
                                        {flexJson && (() => { try { JSON.parse(flexJson); return <p className="text-xs text-green-600 mt-1">JSON ถูกต้อง</p>; } catch { return <p className="text-xs text-red-500 mt-1">JSON ไม่ถูกต้อง</p>; } })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Target audience */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-text-primary">เลือกกลุ่มเป้าหมาย</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setDraft(d => ({ ...d, target_audience: 'all' }))}
                                    className={`p-6 rounded-2xl border-2 transition-all text-left ${
                                        draft.target_audience === 'all'
                                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-md'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <Users className={`w-8 h-8 mb-3 ${draft.target_audience === 'all' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`} />
                                    <div className="text-sm font-bold text-text-primary">ผู้ติดตามทั้งหมด</div>
                                    <div className="text-xs text-text-tertiary mt-1">ส่งถึงผู้ติดตาม LINE OA ทุกคน (Broadcast API)</div>
                                </button>
                                <div
                                    className="p-6 rounded-2xl border-2 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed text-left"
                                >
                                    <Users className="w-8 h-8 mb-3 text-gray-300" />
                                    <div className="text-sm font-bold text-text-primary">เฉพาะกลุ่ม</div>
                                    <div className="text-xs text-text-tertiary mt-1">เลือกส่งเฉพาะผู้ใช้ที่ระบุ (เร็วๆ นี้)</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Review & Send */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-text-primary">ตรวจสอบและส่ง</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Summary */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-text-tertiary">ชื่อแคมเปญ</label>
                                        <p className="text-sm font-bold text-text-primary">{draft.title}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-tertiary">ประเภทข้อความ</label>
                                        <p className="text-sm font-medium text-text-primary">
                                            {draft.message_type === 'text' ? 'ข้อความ' : draft.message_type === 'image' ? 'รูปภาพ' : 'Flex Message'}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-text-tertiary">กลุ่มเป้าหมาย</label>
                                        <p className="text-sm font-medium text-text-primary">
                                            {draft.target_audience === 'all' ? 'ผู้ติดตามทั้งหมด' : 'เฉพาะกลุ่ม'}
                                        </p>
                                    </div>
                                </div>

                                {/* Content Preview */}
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
                                    <label className="text-xs text-text-tertiary mb-2 block">ตัวอย่างเนื้อหา</label>
                                    {draft.message_type === 'text' && (
                                        <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
                                            <p className="text-sm text-text-primary whitespace-pre-wrap">{textContent}</p>
                                        </div>
                                    )}
                                    {draft.message_type === 'image' && imageUrl && (
                                        <div className="bg-white dark:bg-gray-700 rounded-xl p-2 shadow-sm">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={imageUrl} alt="Preview" className="rounded-lg max-w-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        </div>
                                    )}
                                    {draft.message_type === 'flex' && (
                                        <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
                                            <pre className="text-xs font-mono text-text-secondary overflow-auto max-h-48">{flexJson}</pre>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Schedule option */}
                            <div className="border-t border-gray-100 dark:border-gray-700 pt-6 space-y-4">
                                <label className="text-xs text-text-tertiary">ตั้งเวลาส่ง (ไม่บังคับ)</label>
                                <Input
                                    type="datetime-local"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-3 pt-4">
                                <Button variant="outline" onClick={handleSaveDraft} disabled={saving} className="gap-2">
                                    <FileText className="w-4 h-4" />
                                    {saving ? 'กำลังบันทึก...' : 'บันทึกแบบร่าง'}
                                </Button>
                                {scheduleDate ? (
                                    <Button onClick={handleSaveAndSchedule} disabled={saving} className="gap-2">
                                        <Clock className="w-4 h-4" />
                                        {saving ? 'กำลังตั้งเวลา...' : 'ตั้งเวลาส่ง'}
                                    </Button>
                                ) : (
                                    <Button onClick={handleSaveAndSend} disabled={saving} className="gap-2">
                                        <Send className="w-4 h-4" />
                                        {saving ? 'กำลังส่ง...' : 'ส่งเลย'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Navigation buttons */}
            {step < 3 && (
                <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        ย้อนกลับ
                    </Button>
                    <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="gap-2">
                        ถัดไป
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
