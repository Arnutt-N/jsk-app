'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface PanelErrorFallbackProps { label: string; reset: () => void; }

export function PanelErrorFallback({ label, reset }: PanelErrorFallbackProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center thai-text" role="alert">
      <AlertTriangle className="w-8 h-8 text-danger" />
      <p className="text-sm text-text-secondary">เกิดข้อผิดพลาดในส่วน{label}</p>
      <button onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-danger/10 hover:bg-danger/20 text-danger transition-colors cursor-pointer">
        <RefreshCw className="w-3.5 h-3.5" /> ลองใหม่
      </button>
    </div>
  );
}
