'use client';

import { useCallback, useState } from 'react';
import { logger } from '@/lib/logger';

export interface LiffLeave {
  leaveOpen: boolean;
  requestLeave: () => void;
  cancelLeave: () => void;
  confirmLeave: () => void;
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

  return { leaveOpen, requestLeave, cancelLeave, confirmLeave };
}
