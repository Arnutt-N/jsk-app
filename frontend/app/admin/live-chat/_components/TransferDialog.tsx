'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowRightLeft } from 'lucide-react';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  onTransfer: (toOperatorId: number, reason?: string) => void;
}

export function TransferDialog({ open, onClose, onTransfer }: TransferDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Transfer session">
      <div ref={dialogRef} className="bg-white rounded-2xl shadow-2xl w-96 p-5 border border-slate-100/60 thai-text">
        <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2 thai-no-break">
          <ArrowRightLeft className="w-4 h-4 text-amber-500" />Transfer Session
        </h3>
        <form onSubmit={(e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const operatorId = parseInt((form.elements.namedItem('operatorId') as HTMLInputElement).value, 10);
          const reason = (form.elements.namedItem('reason') as HTMLInputElement).value;
          if (operatorId > 0) {
            onTransfer(operatorId, reason || undefined);
            onClose();
          }
        }}>
          <label className="block text-xs text-slate-500 mb-1 thai-no-break" htmlFor="transfer-operator">Operator ID</label>
          <input ref={firstFieldRef} id="transfer-operator" name="operatorId" type="number" min="1" required className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm mb-3 focus-ring focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 transition-all thai-no-break" placeholder="Enter operator ID" />
          <label className="block text-xs text-slate-500 mb-1 thai-no-break" htmlFor="transfer-reason">Reason (optional)</label>
          <input id="transfer-reason" name="reason" type="text" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm mb-4 focus-ring focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 transition-all thai-no-break" placeholder="Why transfer?" />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all focus-ring thai-no-break">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs text-white bg-gradient-to-br from-amber-500 to-amber-600 hover:shadow-lg rounded-xl font-semibold transition-all active:scale-[0.97] focus-ring thai-no-break">Transfer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
