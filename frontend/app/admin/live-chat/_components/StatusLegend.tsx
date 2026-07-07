'use client';

import React from 'react';

export function StatusLegend() {
  return (
    <div className="px-4 py-2 border-t border-white/10">
      <div className="text-[10px] tracking-wide text-sidebar-text-muted font-semibold uppercase mb-2">
        สถานะ
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-sidebar-text-muted">
          <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span>Active — กำลังให้บริการ</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-sidebar-text-muted">
          <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span>Waiting — รอเจ้าหน้าที่</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-sidebar-text-muted">
          <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
          <span>Offline — ปิดการให้บริการ</span>
        </div>
      </div>
    </div>
  );
}
