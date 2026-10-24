'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { readErrorMessage } from '@/lib/api-error';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('ลิงก์ไม่ถูกต้อง กรุณากดลิงก์จากอีเมลอีกครั้ง');
      return;
    }
    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const msg = await readErrorMessage(res, 'ตั้งรหัสผ่านไม่สำเร็จ ลิงก์อาจหมดอายุแล้ว');
        setError(msg);
        return;
      }
      router.replace('/login');
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ตั้งรหัสผ่านใหม่</CardTitle>
        <CardDescription>ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">
              รหัสผ่านใหม่ <span className="text-danger">*</span>
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {password && <PasswordStrengthMeter password={password} />}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">
              ยืนยันรหัสผ่านใหม่ <span className="text-danger">*</span>
            </Label>
            <Input
              id="confirm"
              type="password"
              placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && (
            <Alert variant="danger" className="rounded-xl">
              <span className="text-sm font-semibold">{error}</span>
            </Alert>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={submitting} loadingText="กำลังบันทึก">
            <KeyRound className="w-4 h-4 mr-2" />
            ตั้งรหัสผ่านใหม่
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-900">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-700 transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" />
            กลับไปหน้าล็อกอิน
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
