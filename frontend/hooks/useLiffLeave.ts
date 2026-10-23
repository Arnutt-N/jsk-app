'use client';

import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';

export interface LiffLeave {
  leaveOpen: boolean;
  requestLeave: () => void;
  cancelLeave: () => void;
  confirmLeave: () => void;
  closeWindow: (fallbackUrl?: string) => void;
}

export function useLiffLeave(homePath = '/'): LiffLeave {
  const [leaveOpen, setLeaveOpen] = useState(false);

  const requestLeave = useCallback(() => setLeaveOpen(true), []);
  const cancelLeave = useCallback(() => setLeaveOpen(false), []);

  const confirmLeave = useCallback(() => {
    setLeaveOpen(false);
    if (typeof window !== 'undefined' && window.liff?.isInClient?.()) {
      try {
        window.liff.closeWindow();
      } catch (e) {
        logger.error('Close window failed:', e);
      }
      return;
    }
    window.location.href = homePath;
  }, [homePath]);

  // Shared success-screen close: in-LINE closes the client; outside LINE
  // tries window.close() then an explicit fallback URL (unlike confirmLeave
  // above, which navigates home for the mid-form cancel flow).
  const closeWindow = useCallback((fallbackUrl?: string) => {
    if (typeof window === 'undefined') return;
    try {
      if (window.liff?.isInClient?.()) {
        window.liff.closeWindow();
        return;
      }
    } catch (e) {
      logger.error('Close window failed:', e);
    }
    try {
      window.close();
    } catch (e) {
      logger.error('Window close failed:', e);
    }
    const target =
      fallbackUrl ??
      (process.env.NEXT_PUBLIC_LIFF_ID
        ? `https://line.me/R/app/${process.env.NEXT_PUBLIC_LIFF_ID}`
        : undefined);
    if (target) window.location.href = target;
  }, []);

  return { leaveOpen, requestLeave, cancelLeave, confirmLeave, closeWindow };
}
