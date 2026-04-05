'use client';

import { useEffect } from 'react';

export default function LiffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[liff] Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center">
      <h2 className="text-lg font-bold text-gray-900">เกิดข้อผิดพลาด</h2>
      <p className="text-sm text-gray-500">กรุณาปิดแล้วเปิดแอปใหม่อีกครั้ง</p>
      <button
        onClick={reset}
        className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white"
      >
        ลองใหม่
      </button>
    </div>
  );
}
