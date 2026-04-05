'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertCircle } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
        <AlertCircle className="h-8 w-8 text-danger" />
      </div>
      <h2 className="text-xl font-bold text-text-primary">เกิดข้อผิดพลาด</h2>
      <p className="max-w-md text-sm text-text-secondary">
        ระบบเกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง
      </p>
      <Button onClick={reset} variant="primary" size="md">
        ลองใหม่
      </Button>
    </div>
  );
}
