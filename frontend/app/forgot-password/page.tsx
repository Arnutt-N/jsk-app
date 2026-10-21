'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, MailQuestion } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { readErrorMessage } from '@/lib/api-error';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้หรืออีเมล');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      if (!res.ok) {
        const msg = await readErrorMessage(res, 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        setError(msg);
        return;
      }
      setDone(true);
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-900">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>ลืมรหัสผ่าน</CardTitle>
            <CardDescription>กรอกชื่อผู้ใช้หรืออีเมล ระบบจะส่งลิงก์ตั้งรหัสใหม่ไปทางอีเมล</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="space-y-4 text-center py-4">
                <Alert variant="success" className="rounded-xl">
                  <span className="text-sm font-semibold">ถ้ามีบัญชีที่ตรงกัน ระบบส่งลิงก์ไปทางอีเมลแล้ว (ลิงก์ใช้ได้ 30 นาที)</span>
                </Alert>
                <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-400">
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  กลับไปหน้าล็อกอิน
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="identifier">
                    ชื่อผู้ใช้หรืออีเมล <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="identifier"
                    placeholder="กรอกชื่อผู้ใช้หรืออีเมลของคุณ"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                {error && (
                  <Alert variant="danger" className="rounded-xl">
                    <span className="text-sm font-semibold">{error}</span>
                  </Alert>
                )}
                <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={submitting} loadingText="กำลังส่งลิงก์">
                  <MailQuestion className="w-4 h-4 mr-2" />
                  ส่งลิงก์รีเซ็ตรหัสผ่าน
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
