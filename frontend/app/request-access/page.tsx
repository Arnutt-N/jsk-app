'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { readErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS = [
  { value: 'AGENT', label: 'เจ้าหน้าที่ (Operator)' },
  { value: 'DIRECTOR', label: 'ผู้อำนวยการ (Director)' },
  { value: 'HEAD', label: 'หัวหน้าฝ่าย (Head)' },
];

export default function RequestAccessPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    display_name: '',
    username: '',
    email: '',
    phone_number: '',
    requested_role: 'AGENT',
    reason: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.display_name.trim() || !form.username.trim()) {
      setError('กรุณากรอกชื่อที่แสดงและชื่อผู้ใช้ที่ต้องการ');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: form.display_name.trim(),
          username: form.username.trim(),
          email: form.email.trim() || null,
          phone_number: form.phone_number.trim() || null,
          requested_role: form.requested_role,
          reason: form.reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const msg = await readErrorMessage(res, 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        setError(msg);
        return;
      }
      setDone(true);
      toast({ title: 'สำเร็จ', description: 'ส่งคำขอแล้ว รอแอดมินอนุมัติ', variant: 'success' });
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-900">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>ขอใช้งานระบบหลังบ้าน</CardTitle>
            <CardDescription>กรอกข้อมูลเพื่อให้แอดมินอนุมัติบัญชีพนักงาน</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="space-y-4 text-center py-6">
                <Alert variant="success" className="rounded-xl">
                  <span className="text-sm font-semibold">ส่งคำขอแล้ว รอแอดมินอนุมัติ</span>
                </Alert>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-400"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  กลับไปหน้าล็อกอิน
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="display_name">
                    ชื่อที่แสดง <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="display_name"
                    placeholder="เช่น สมหญิง ใจดี"
                    value={form.display_name}
                    onChange={set('display_name')}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">
                    ชื่อผู้ใช้ที่ต้องการ <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="username"
                    placeholder="เช่น somying01 (ภาษาอังกฤษ ตัวเลข)"
                    value={form.username}
                    onChange={set('username')}
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">อีเมล (สำหรับรับลิงก์รีเซ็ตรหัสผ่าน)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={form.email}
                    onChange={set('email')}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">เบอร์โทร (ถ้ามี)</Label>
                  <Input
                    id="phone"
                    placeholder="08x-xxx-xxxx"
                    value={form.phone_number}
                    onChange={set('phone_number')}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">ตำแหน่งที่ขอ</Label>
                  <Select id="role" value={form.requested_role} onChange={set('requested_role')} options={ROLE_OPTIONS} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">เหตุผล / หน่วยงาน</Label>
                  <textarea
                    id="reason"
                    rows={3}
                    placeholder="เช่น เจ้าหน้าที่รับเรื่อง กลุ่มงาน..."
                    value={form.reason}
                    onChange={set('reason')}
                    className={cn(
                      'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm',
                      'dark:bg-slate-800/50 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500'
                    )}
                  />
                </div>
                {error && (
                  <Alert variant="danger" className="rounded-xl">
                    <span className="text-sm font-semibold">{error}</span>
                  </Alert>
                )}
                <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={submitting} loadingText="กำลังส่งคำขอ">
                  <UserPlus className="w-4 h-4 mr-2" />
                  ส่งคำขอใช้งาน
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm font-bold text-slate-500 hover:text-blue-700 transition-colors">
            กลับไปหน้าล็อกอิน
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
