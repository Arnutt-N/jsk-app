'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Zap,
    Check,
    X,
    SquarePen,
    CheckCircle2,
    Loader2,
    Send,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import PageHeader from '@/app/admin/components/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface TelegramConfig {
    bot_token_masked: string;
    chat_id: string;
    is_connected: boolean;
    credential_id: number | null;
}

interface TestResult {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
}

export default function TelegramSettingsPage() {
    const router = useRouter();
    const { token } = useAuth();
    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }, [token]);
    const [config, setConfig] = useState<TelegramConfig | null>(null);
    const [form, setForm] = useState({ bot_token: '', chat_id: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [showTestModal, setShowTestModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_BASE = '/api/v1';

    const fetchConfig = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/admin/settings/telegram`, { headers: authHeaders });
            if (res.ok) {
                const data: TelegramConfig = await res.json();
                setConfig(data);
                if (!data.is_connected) setIsEditing(true);
            } else {
                setError('ไม่สามารถโหลดข้อมูลได้');
            }
        } catch (err) {
            console.error('Failed to fetch Telegram config', err);
            setError('ไม่สามารถโหลดข้อมูลได้');
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        setProcessing('SAVE');
        try {
            const res = await fetch(`${API_BASE}/admin/settings/telegram`, {
                method: 'PUT',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                await fetchConfig();
                setIsEditing(false);
                setForm({ bot_token: '', chat_id: '' });
                setShowSaveModal(true);
            } else {
                const err = await res.json();
                alert(err.detail || 'Save failed');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setProcessing(null);
        }
    };

    const handleTest = async () => {
        setProcessing('TEST');
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/admin/settings/telegram/test`, {
                method: 'POST',
                headers: authHeaders,
            });
            const data: TestResult = await res.json();
            setTestResult(data);
            setShowTestModal(true);
        } catch (err) {
            setTestResult({ success: false, message: String(err) });
            setShowTestModal(true);
        } finally {
            setProcessing(null);
        }
    };

    if (loading) return <LoadingSpinner label="Loading Telegram settings..." />;

    return (
        <div className="thai-text space-y-5 animate-in fade-in duration-500">
            {error && <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl text-sm mb-4">{error}</div>}

            <PageHeader title="Telegram Settings" subtitle="ตั้งค่าการเชื่อมต่อ Telegram Bot">
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                    onClick={() => router.push('/admin/settings')}
                >
                    กลับ
                </Button>
            </PageHeader>

            {/* Status */}
            {config && (
                <div className="flex items-center gap-3">
                    <Send className="w-5 h-5 text-brand-500" />
                    <span className="text-sm font-medium text-text-secondary">สถานะ:</span>
                    <Badge variant={config.is_connected ? 'success' : 'gray'} size="sm">
                        {config.is_connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                    </Badge>
                    {config.is_connected && !isEditing && (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={handleTest}
                            disabled={processing === 'TEST'}
                            leftIcon={
                                processing === 'TEST' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Zap className="w-3 h-3" />
                                )
                            }
                        >
                            ทดสอบการเชื่อมต่อ
                        </Button>
                    )}
                </div>
            )}

            {/* Settings Card */}
            <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-border-default bg-bg">
                    <h2 className="font-bold text-text-primary">Connection Settings</h2>
                    {!isEditing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<SquarePen className="w-4 h-4" />}
                            onClick={() => setIsEditing(true)}
                        >
                            แก้ไข
                        </Button>
                    )}
                </div>

                <div className={`p-6 space-y-6 ${!isEditing ? 'opacity-75 pointer-events-none' : ''}`}>
                    {/* Bot Token */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-text-secondary">
                            โทเค็นบอท (Bot Token)
                        </label>
                        {isEditing ? (
                            <input
                                type="password"
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all"
                                value={form.bot_token}
                                onChange={(e) => setForm({ ...form, bot_token: e.target.value })}
                                placeholder="123456:ABC-DEF..."
                            />
                        ) : (
                            <p className="text-sm text-text-secondary font-mono">
                                {config?.bot_token_masked || '----'}
                            </p>
                        )}
                    </div>

                    {/* Chat ID */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-text-secondary">
                            Chat ID / Group ID
                        </label>
                        {isEditing ? (
                            <input
                                type="text"
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all"
                                value={form.chat_id}
                                onChange={(e) => setForm({ ...form, chat_id: e.target.value })}
                                placeholder="-1001234567890"
                            />
                        ) : (
                            <p className="text-sm text-text-secondary font-mono">
                                {config?.chat_id || '----'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                {isEditing && (
                    <div className="p-6 border-t border-border-default bg-bg flex justify-end gap-3">
                        {config?.is_connected && (
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setIsEditing(false);
                                    setForm({ bot_token: '', chat_id: '' });
                                }}
                            >
                                ยกเลิก
                            </Button>
                        )}
                        <Button
                            onClick={handleSave}
                            disabled={!form.bot_token || !form.chat_id || processing === 'SAVE'}
                            leftIcon={
                                processing === 'SAVE' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )
                            }
                        >
                            {processing === 'SAVE' ? 'กำลังบันทึก...' : 'บันทึก'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Test Result Modal */}
            <Modal
                isOpen={showTestModal}
                onClose={() => setShowTestModal(false)}
                title={testResult?.success ? 'Connection Successful' : 'Connection Failed'}
                maxWidth="sm"
            >
                <div className="flex flex-col items-center text-center p-4 pt-2">
                    {testResult?.success ? (
                        <>
                            <div className="w-14 h-14 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4 dark:bg-emerald-500/10">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <p className="text-text-secondary mb-6">{testResult.message}</p>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3 dark:bg-red-500/10">
                                <X className="w-6 h-6" />
                            </div>
                            <p className="text-sm text-text-secondary mb-4 break-all">{testResult?.message}</p>
                        </>
                    )}
                    <Button className="w-full" onClick={() => setShowTestModal(false)}>
                        Close
                    </Button>
                </div>
            </Modal>

            {/* Save Success Modal */}
            <Modal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                title="Saved Successfully"
                maxWidth="sm"
            >
                <div className="flex flex-col items-center text-center p-4 pt-2">
                    <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-4 dark:bg-brand-500/10 dark:text-brand-400">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <p className="text-text-secondary mb-6">
                        บันทึกข้อมูล Telegram Bot เรียบร้อยแล้ว
                    </p>
                    <Button className="w-full" onClick={() => setShowSaveModal(false)}>
                        OK
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
