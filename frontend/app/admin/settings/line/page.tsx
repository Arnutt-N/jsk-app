"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Zap, Check, X, SquarePen, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import PageHeader from '@/app/admin/components/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface SettingItem {
    key: string;
    value?: string;
}

interface ValidationResult {
    success: boolean;
    botInfo?: {
        displayName?: string;
        userId?: string;
    };
    error?: string;
}

export default function LineSettingsPage() {
    const router = useRouter();
    const [settings, setSettings] = useState({
        LINE_CHANNEL_ACCESS_TOKEN: '',
        LINE_CHANNEL_SECRET: '',
    });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null); // 'CONNECT' | 'SAVE'
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [canSave, setCanSave] = useState(false);

    // Modals
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

    const API_BASE = '/api/v1';

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/settings`);
            if (res.ok) {
                const data = await res.json();
                const settingsData = Array.isArray(data) ? (data as SettingItem[]) : [];
                const mapped = {
                    LINE_CHANNEL_ACCESS_TOKEN: settingsData.find((s) => s.key === 'LINE_CHANNEL_ACCESS_TOKEN')?.value || '',
                    LINE_CHANNEL_SECRET: settingsData.find((s) => s.key === 'LINE_CHANNEL_SECRET')?.value || '',
                };
                setSettings(mapped);
                if (!mapped.LINE_CHANNEL_ACCESS_TOKEN || !mapped.LINE_CHANNEL_SECRET) {
                    setIsEditing(true);
                }
            }
        } catch (error) {
            console.error("Failed to fetch settings", error);
        } finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Warn on browser refresh/close
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isEditing) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isEditing]);

    const handleNavigationAttempt = (href: string) => {
        if (isEditing) {
            setPendingNavigation(href);
            setShowUnsavedModal(true);
        } else {
            router.push(href);
        }
    };

    const confirmNavigation = () => {
        if (pendingNavigation) {
            router.push(pendingNavigation);
        }
    };

    const handleConnect = async () => {
        setProcessing('CONNECT');
        setValidationResult(null);
        setCanSave(false);

        try {
            const res = await fetch(`${API_BASE}/admin/settings/line/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_access_token: settings.LINE_CHANNEL_ACCESS_TOKEN })
            });
            const data = await res.json();

            if (res.ok) {
                setValidationResult({ success: true, botInfo: data.data });
                setCanSave(true);
            } else {
                setValidationResult({ success: false, error: data.detail || 'Validation failed' });
                setCanSave(false);
            }
            setShowStatusModal(true);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Network error';
            setValidationResult({ success: false, error: errorMessage });
            setShowStatusModal(true);
            setCanSave(false);
        } finally {
            setProcessing(null);
        }
    };

    const handleSave = async () => {
        setProcessing('SAVE');
        try {
            await fetch(`${API_BASE}/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'LINE_CHANNEL_ACCESS_TOKEN', value: settings.LINE_CHANNEL_ACCESS_TOKEN, description: 'LINE API Access Token' })
            });

            await fetch(`${API_BASE}/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'LINE_CHANNEL_SECRET', value: settings.LINE_CHANNEL_SECRET, description: 'LINE API Channel Secret' })
            });

            await fetchSettings();
            setIsEditing(false);
            setCanSave(false);
            setShowSaveSuccessModal(true);
        } catch {
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setProcessing(null);
        }
    };

    if (loading) {
        return <LoadingSpinner label="Loading settings..." />;
    }

    return (
        <div className="thai-text space-y-5 animate-in fade-in duration-500">
            {/* Header */}
            <PageHeader title="LINE Messaging Settings" subtitle="ตั้งค่า Credentials สำหรับ LINE Official Account">
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                    onClick={() => handleNavigationAttempt('/admin')}
                >
                    กลับ
                </Button>
            </PageHeader>

            {/* Warning Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 dark:bg-amber-500/10 dark:border-amber-500/20">
                <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold text-amber-800 text-sm dark:text-amber-300">ข้อมูลสำคัญ</p>
                    <p className="text-amber-700 text-sm dark:text-amber-400">Credentials เหล่านี้ให้สิทธิ์เข้าถึง LINE Official Account ของคุณอย่างเต็มรูปแบบ กรุณาเก็บรักษาเป็นความลับ</p>
                </div>
            </div>

            {/* Settings Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50 dark:bg-gray-800/50 dark:border-gray-700">
                    <h2 className="font-bold text-gray-800 dark:text-gray-100">Connection Settings</h2>
                    {!isEditing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<SquarePen className="w-4 h-4" />}
                            onClick={() => { setIsEditing(true); setValidationResult(null); setCanSave(false); }}
                        >
                            Edit
                        </Button>
                    )}
                </div>

                <div className={`p-6 space-y-6 ${!isEditing ? 'opacity-75 pointer-events-none' : ''}`}>
                    {/* Channel Access Token */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Channel Access Token (Long-lived)
                        </label>
                        <input
                            type="password"
                            disabled={!isEditing}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all disabled:opacity-75 disabled:cursor-not-allowed dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                            value={settings.LINE_CHANNEL_ACCESS_TOKEN}
                            onChange={(e) => { setSettings({ ...settings, LINE_CHANNEL_ACCESS_TOKEN: e.target.value }); setCanSave(false); }}
                            placeholder="Enter your Channel Access Token"
                        />
                    </div>

                    {/* Channel Secret */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Channel Secret
                        </label>
                        <input
                            type="password"
                            disabled={!isEditing}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all disabled:opacity-75 disabled:cursor-not-allowed dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                            value={settings.LINE_CHANNEL_SECRET}
                            onChange={(e) => { setSettings({ ...settings, LINE_CHANNEL_SECRET: e.target.value }); setCanSave(false); }}
                            placeholder="Enter your Channel Secret"
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                {isEditing && (
                    <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 dark:bg-gray-800/50 dark:border-gray-700">
                        <Button
                            variant="outline"
                            onClick={handleConnect}
                            disabled={processing === 'CONNECT'}
                            leftIcon={processing === 'CONNECT'
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Zap className="w-4 h-4" />
                            }
                        >
                            {processing === 'CONNECT' ? 'Connecting...' : 'Connect'}
                        </Button>

                        <Button
                            onClick={handleSave}
                            disabled={!canSave || processing === 'SAVE'}
                            leftIcon={processing === 'SAVE'
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Check className="w-4 h-4" />
                            }
                        >
                            {processing === 'SAVE' ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Connection Status Modal */}
            <Modal
                isOpen={showStatusModal}
                onClose={() => setShowStatusModal(false)}
                title={validationResult?.success ? "Connection Successful" : "Connection Failed"}
                maxWidth="sm"
            >
                <div className="flex flex-col items-center text-center p-4 pt-2">
                    {validationResult?.success ? (
                        <>
                            <div className="w-14 h-14 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4 dark:bg-emerald-500/10">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <div className="w-full bg-gray-50 border border-gray-100 rounded-lg p-4 text-left mb-6 dark:bg-gray-800 dark:border-gray-700">
                                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1 dark:text-gray-500">Authenticated As</p>
                                <p className="font-bold text-gray-700 text-lg dark:text-gray-200">{validationResult.botInfo?.displayName}</p>
                                <p className="text-xs text-gray-400 font-mono truncate dark:text-gray-500">{validationResult.botInfo?.userId}</p>
                            </div>
                            <Button className="w-full" onClick={() => setShowStatusModal(false)}>
                                Close
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3 dark:bg-red-500/10">
                                <X className="w-6 h-6" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-800 mb-1 dark:text-gray-200">Connection Failed</h4>
                            <p className="text-sm text-gray-500 mb-4 px-2 break-all dark:text-gray-400">
                                {validationResult?.error}
                            </p>
                            <Button variant="ghost" onClick={() => setShowStatusModal(false)}>
                                Close
                            </Button>
                        </>
                    )}
                </div>
            </Modal>

            {/* Unsaved Changes Modal */}
            <Modal
                isOpen={showUnsavedModal}
                onClose={() => setShowUnsavedModal(false)}
                title="Unsaved Changes"
                maxWidth="sm"
            >
                <div className="text-center p-2">
                    <p className="text-gray-600 mb-6 text-sm dark:text-gray-400">
                        You have unsaved changes. Are you sure you want to leave?
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Button variant="ghost" onClick={() => setShowUnsavedModal(false)}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={confirmNavigation}>
                            Discard
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Save Success Modal */}
            <Modal
                isOpen={showSaveSuccessModal}
                onClose={() => setShowSaveSuccessModal(false)}
                title="Saved Successfully"
                maxWidth="sm"
            >
                <div className="flex flex-col items-center text-center p-4 pt-2">
                    <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-4 dark:bg-brand-500/10 dark:text-brand-400">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <p className="text-gray-600 mb-6 dark:text-gray-400">
                        บันทึกข้อมูลการเชื่อมต่อเรียบร้อยแล้ว
                    </p>
                    <Button className="w-full" onClick={() => setShowSaveSuccessModal(false)}>
                        OK
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
