'use client';

import React from 'react';

interface UnreadDividerProps {
  count?: number;
}

export function UnreadDivider({ count }: UnreadDividerProps) {
  return (
    <div className="flex items-center gap-3 my-4 px-4" role="separator" aria-label={`${count || ''} ข้อความใหม่ที่ยังไม่ได้อ่าน`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <span className="text-xs font-semibold text-brand-500 px-3 py-1 bg-brand-500/10 rounded-full border border-brand-500/20 whitespace-nowrap">
        {count ? `${count} ข้อความใหม่` : 'ข้อความใหม่'}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
    </div>
  );
}
