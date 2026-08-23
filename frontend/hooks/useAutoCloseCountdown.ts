'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Countdown that drives the LIFF auto-close behaviour on the success screen.
 * Ticks down once per second while `enabled`; invokes `onClose` at zero.
 * `onClose` is read through a ref so callers may pass inline closures without
 * resetting the pending timer on every render.
 */
export function useAutoCloseCountdown(
  enabled: boolean,
  onClose: () => void,
  initialSeconds: number = 5
): { timeLeft: number; resetCountdown: () => void } {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled) return;
    if (timeLeft <= 0) {
      onCloseRef.current();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [enabled, timeLeft]);

  const resetCountdown = () => setTimeLeft(initialSeconds);

  return { timeLeft, resetCountdown };
}
