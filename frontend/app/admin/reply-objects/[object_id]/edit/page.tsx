'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';
import ReplyObjectForm, { formatErrorDetail, type ReplyObjectFormData } from '@/components/admin/ReplyObjectForm';

const API_BASE = '/api/v1';

export default function EditReplyObjectPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const objectId = Array.isArray(params.object_id) ? params.object_id[0] : (params.object_id as string);
    const [initial, setInitial] = useState<ReplyObjectFormData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchObject = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects/${objectId}`);
            if (res.ok) {
                const obj = await res.json();
                const p = obj.payload;
                const isPlain = p !== null && typeof p === 'object' && !Array.isArray(p);
                setInitial({
                    object_id: obj.object_id,
                    name: obj.name,
                    category: obj.category || '',
                    object_type: obj.object_type,
                    payload: isPlain ? JSON.stringify(p, null, 2) : p ? JSON.stringify(p, null, 2) : '{}',
                    alt_text: obj.alt_text || '',
                });
            } else {
                toast({ title: 'ผิดพลาด', description: 'ไม่พบเทมเพลตนี้', variant: 'error' });
                router.push('/admin/reply-objects');
            }
        } catch (err) {
            logger.error('Error loading reply object:', err);
            toast({ title: 'ผิดพลาด', description: 'โหลดข้อมูลไม่สำเร็จ', variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [objectId, router, toast]);

    useEffect(() => {
        if (user?.role === 'VIEWER') {
            router.replace('/admin/reply-objects');
            return;
        }
        void fetchObject();
    }, [fetchObject, router, user]);

    const handleSave = async (data: ReplyObjectFormData): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects/${objectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, payload: JSON.parse(data.payload) }),
            });
            if (res.ok) {
                toast({ title: 'บันทึกการแก้ไขแล้ว', variant: 'success' });
                router.push('/admin/reply-objects');
                return true;
            }
            const error = await res.json().catch(() => ({} as { detail?: unknown }));
            toast({ title: 'ผิดพลาด', description: formatErrorDetail(error.detail), variant: 'error' });
            return false;
        } catch (err) {
            logger.error('Error saving reply object:', err);
            toast({ title: 'ผิดพลาด', description: formatErrorDetail(undefined), variant: 'error' });
            return false;
        }
    };

    if (loading) return <LoadingSpinner label="กำลังโหลด..." />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="Edit Template" subtitle={`แก้ไขเทมเพลต $${objectId}`}>
                <Button variant="outline" size="sm" onClick={() => router.push('/admin/reply-objects')}>
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    กลับรายการ
                </Button>
            </PageHeader>
            <div className="bg-surface rounded-2xl border border-border-default p-6">
                {initial && (
                    <ReplyObjectForm
                        key={objectId}
                        initial={initial}
                        lockObjectId
                        submitLabel="บันทึกการแก้ไข"
                        onSave={handleSave}
                        onCancel={() => router.push('/admin/reply-objects')}
                    />
                )}
            </div>
        </div>
    );
}
