'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/app/admin/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';
import ReplyObjectForm, { EMPTY_REPLY_OBJECT_FORM, formatErrorDetail, type ReplyObjectFormData } from '@/components/admin/ReplyObjectForm';
import { formToPayload } from '@/lib/reply-objects';

const API_BASE = '/api/v1';
export default function NewReplyObjectPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        if (user?.role === 'VIEWER') {
            router.replace('/admin/reply-objects');
        }
    }, [router, user]);

    const handleSave = async (data: ReplyObjectFormData): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/admin/reply-objects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, payload: formToPayload(data) }),
            });
            if (res.ok) {
                toast({ title: 'สร้างเทมเพลตแล้ว', variant: 'success' });
                router.push('/admin/reply-objects');
                return true;
            }
            const error = await res.json().catch(() => ({} as { detail?: unknown }));
            toast({
              title: 'ผิดพลาด',
              description: formatErrorDetail(error.detail, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'),
              variant: 'error',
            });
            return false;
        } catch (err) {
            logger.error('Error creating reply object:', err);
            toast({ title: 'ผิดพลาด', description: 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', variant: 'error' });
            return false;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 thai-text">
            <PageHeader title="New Template" subtitle="สร้างเทมเพลตข้อความสำหรับเรียกใช้ซ้ำ">
                <Button variant="outline" size="sm" onClick={() => router.push('/admin/reply-objects')}>
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    กลับรายการ
                </Button>
            </PageHeader>
            <div className="bg-surface rounded-2xl border border-border-default p-6">
                <ReplyObjectForm
                    initial={EMPTY_REPLY_OBJECT_FORM}
                    lockObjectId={false}
                    submitLabel="สร้างเทมเพลต"
                    onSave={handleSave}
                    onCancel={() => router.push('/admin/reply-objects')}
                />
            </div>
        </div>
    );
}
