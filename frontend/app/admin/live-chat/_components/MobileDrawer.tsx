'use client';

import React, { useEffect, useRef } from 'react';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: React.ReactNode;
  label?: string;
}

export function MobileDrawer({ open, onClose, titleId, children }: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus capture/restore keyed on `open` ONLY — depending on onClose identity
  // would re-run the cleanup and steal focus whenever the parent re-renders
  // with an inline callback (e.g. on live-chat WS updates). Same fix as Modal.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-[88%] max-w-sm focus:outline-none"
      >
        {children}
      </div>
    </div>
  );
}
