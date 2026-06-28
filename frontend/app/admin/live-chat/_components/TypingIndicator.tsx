'use client';

import React from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function TypingIndicator({ visible }: { visible: boolean }) {
  const reduced = useReducedMotion();
  if (!visible) return null;
  return (
    <div className="flex items-center gap-2 text-text-tertiary text-xs thai-text" aria-live="polite">
      <div className="flex gap-1">
        <span className={`w-1.5 h-1.5 bg-border-hover rounded-full ${reduced ? '' : 'animate-typing-bounce'}`} style={{ animationDelay: '0ms' }} />
        <span className={`w-1.5 h-1.5 bg-border-hover rounded-full ${reduced ? '' : 'animate-typing-bounce'}`} style={{ animationDelay: '150ms' }} />
        <span className={`w-1.5 h-1.5 bg-border-hover rounded-full ${reduced ? '' : 'animate-typing-bounce'}`} style={{ animationDelay: '300ms' }} />
      </div>
      <span className="thai-no-break">Someone is typing...</span>
    </div>
  );
}
