'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Plus,
    Zap,
    Check,
    X,
    Trash2,
    SquarePen,
    CheckCircle2,
    Loader2,
    Puzzle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ActionIconButton } from '@/components/ui/ActionIconButton';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import PageHeader from '@/app/admin/components/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Integration {
    id: number;
    name: string;
    integration_type: string;
    url: string;
    api_key_masked: string;
    headers: Record<string, string> | null;
    is_connected: boolean;
}

interface TestResult {
    success: boolean;
    message: string;
}

const emptyForm = {
    name: '',
    integration_type: 'webhook' as string,
    url: '',
    api_key: '',
    headers_json: '',
};

export default function CustomIntegrationsPage() {
    const router = useRouter();
    const { token } = useAuth();
    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }, [token]);
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [processing, setProcessing] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [showTestModal, setShowTestModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);

    const API_BASE = '/api/v1';

    const fetchIntegrations = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/settings/integrations`, { headers: authHeaders });
            if (res.ok) setIntegrations(await res.json());
        } catch (err) {
            console.error('Failed to fetch integrations', err);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authHeaders]);

    useEffect(() => {
        fetchIntegrations();
    }, [fetchIntegrations]);

    const resetForm = () => {
        setForm({ ...emptyForm });
        setEditingId(null);
        setShowForm(false);
    };

    const startEdit = (item: Integration) => {
        setForm({
            name: item.name,
            integration_type: item.integration_type,
            url: item.url,
            api_key: '',
            headers_json: item.headers ? JSON.stringify(item.headers, null, 2) : '',
        });
        setEditingId(item.id);
        setShowForm(true);
    };

    const handleSave = async () => {
        setProcessing('SAVE');
        try {
            let headers: Record<string, string> | undefined;
            if (form.headers_json.trim()) {
                try {
                    headers = JSON.parse(form.headers_json);
                } catch {
                    alert('Headers JSON ไม่ถูกต้อง');
                    setProcessing(null);
                    return;
                }
            }

            const payload: Record<string, unknown> = {
                name: form.name,
                integration_type: form.integration_type,
                url: form.url,
            };
            if (form.api_key) payload.api_key = form.api_key;
            if (headers) payload.headers = headers;

            const isUpdate = editingId !== null;
            const url = isUpdate
                ? `${API_BASE}/admin/settings/integrations/${editingId}`
                : `${API_BASE}/admin/settings/integrations`;

            const res = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                await fetchIntegrations();
                resetForm();
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

    const handleDelete = async () => {
        if (deleteId === null) return;
        setProcessing('DELETE');
        try {
            const res = await fetch(`${API_BASE}/admin/settings/integrations/${deleteId}`, {
                method: 'DELETE',
                headers: authHeaders,
            });
            if (!res.ok) throw new Error('Delete failed');
            await fetchIntegrations();
        } catch {
            alert('เกิดข้อผิดพลาดในการลบ');
        } finally {
            setProcessing(null);
            setShowDeleteModal(false);
            setDeleteId(null);
        }
    };

    const handleTest = async (id: number) => {
        setProcessing(`TEST_${id}`);
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/admin/settings/integrations/${id}/test`, {
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

    if (loading) return <LoadingSpinner label="Loading integrations..." />;

    return (
        <div className="thai-text space-y-6 animate-in fade-in duration-500">
            <PageHeader
                title="Custom Integrations"
                subtitle="จัดการ API / Webhook integrations ที่กำหนดเอง"
            >
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                    onClick={() => router.push('/admin/settings')}
                >
                    กลับ
                </Button>
            </PageHeader>

            {/* Add Button */}
            {!showForm && (
                <Button
                    variant="primary"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => {
                        resetForm();
                        setShowForm(true);
                    }}
                >
                    เพิ่ม Integration
                </Button>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <Card>
                    <CardHeader divider>
                        <CardTitle>{editingId ? 'แก้ไข Integration' : 'เพิ่ม Integration ใหม่'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-5">
                        {/* Name */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-text-secondary">
                                ชื่อ (Name)
                            </label>
                            <input
                                type="text"
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. Google Sheets Sync"
                            />
                        </div>

                        {/* Type */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-text-secondary">
                                ประเภท (Type)
                            </label>
                            <select
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all"
                                value={form.integration_type}
                                onChange={(e) =>
                                    setForm({ ...form, integration_type: e.target.value })
                                }
                            >
                                <option value="webhook">Webhook</option>
                                <option value="api">API</option>
                            </select>
                        </div>

                        {/* URL */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-text-secondary">
                                URL
                            </label>
                            <input
                                type="url"
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all"
                                value={form.url}
                                onChange={(e) => setForm({ ...form, url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>

                        {/* API Key */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-text-secondary">
                                API Key (ไม่บังคับ)
                            </label>
                            <input
                                type="password"
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all"
                                value={form.api_key}
                                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                                placeholder="Optional"
                            />
                        </div>

                        {/* Headers */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-text-secondary">
                                Headers (JSON, ไม่บังคับ)
                            </label>
                            <textarea
                                className="w-full bg-bg border border-border-default rounded-xl px-4 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-brand-500/30 focus:border-transparent outline-none transition-all font-mono min-h-[80px] resize-y"
                                value={form.headers_json}
                                onChange={(e) => setForm({ ...form, headers_json: e.target.value })}
                                placeholder='{"X-Custom-Header": "value"}'
                            />
                        </div>
                    </CardContent>
                    <CardFooter divider align="end" className="flex-col sm:flex-row">
                        <Button variant="ghost" onClick={resetForm}>
                            ยกเลิก
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!form.name || !form.url || processing === 'SAVE'}
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
                    </CardFooter>
                </Card>
            )}

            {/* Integration List */}
            {integrations.length === 0 && !showForm ? (
                <Card padding="xl">
                    <div className="flex flex-col items-center text-center py-8">
                        <Puzzle className="w-12 h-12 text-text-tertiary mb-4" />
                        <p className="text-text-secondary font-medium">ยังไม่มี Custom Integrations</p>
                        <p className="text-sm text-text-tertiary mt-1">
                            กดปุ่ม &quot;เพิ่ม Integration&quot; เพื่อเริ่มต้น
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {integrations.map((item) => (
                        <Card key={item.id}>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                                            <Puzzle className="w-5 h-5 text-brand-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-text-primary truncate">
                                                {item.name}
                                            </p>
                                            <p className="text-xs text-text-tertiary font-mono truncate">
                                                {item.url}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                        <Badge
                                            variant={item.is_connected ? 'success' : 'gray'}
                                            size="xs"
                                        >
                                            {item.integration_type}
                                        </Badge>
                                        <ActionIconButton
                                            icon={processing === `TEST_${item.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                            label="ทดสอบ"
                                            variant="warning"
                                            onClick={() => handleTest(item.id)}
                                            disabled={processing === `TEST_${item.id}`}
                                        />
                                        <ActionIconButton
                                            icon={<SquarePen className="w-4 h-4" />}
                                            label="แก้ไข"
                                            variant="default"
                                            onClick={() => startEdit(item)}
                                        />
                                        <ActionIconButton
                                            icon={<Trash2 className="w-4 h-4" />}
                                            label="ลบ"
                                            variant="danger"
                                            onClick={() => {
                                                setDeleteId(item.id);
                                                setShowDeleteModal(true);
                                            }}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Test Result Modal */}
            <Modal
                isOpen={showTestModal}
                onClose={() => setShowTestModal(false)}
                title={testResult?.success ? 'Test Passed' : 'Test Failed'}
                maxWidth="sm"
            >
                <div className="flex flex-col items-center text-center p-4 pt-2">
                    {testResult?.success ? (
                        <div className="w-14 h-14 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4 dark:bg-emerald-500/10">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                    ) : (
                        <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3 dark:bg-red-500/10">
                            <X className="w-6 h-6" />
                        </div>
                    )}
                    <p className="text-sm text-text-secondary mb-4 break-all">
                        {testResult?.message}
                    </p>
                    <Button className="w-full" onClick={() => setShowTestModal(false)}>
                        Close
                    </Button>
                </div>
            </Modal>

            {/* Delete Confirmation */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="ยืนยันการลบ"
                maxWidth="sm"
            >
                <div className="text-center p-2">
                    <p className="text-text-secondary mb-6 text-sm">
                        คุณต้องการลบ Integration นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
                            ยกเลิก
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            disabled={processing === 'DELETE'}
                            leftIcon={
                                processing === 'DELETE' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )
                            }
                        >
                            ลบ
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
