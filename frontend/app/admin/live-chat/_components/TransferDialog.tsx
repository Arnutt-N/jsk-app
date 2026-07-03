'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Search } from 'lucide-react';

import type { OperatorOption } from '../_types';
import { getAvatarFallbackUrl } from '@/lib/constants/live-chat-avatar';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  onTransfer: (toOperatorId: number, reason?: string) => void;
  operators: OperatorOption[];
  loading?: boolean;
}

/** Token-based status-dot class per roster status. */
const STATUS_DOT: Record<OperatorOption['status'], string> = {
  online: 'bg-online',
  away: 'bg-away',
  offline: 'bg-offline',
};

export function TransferDialog({ open, onClose, onTransfer, operators, loading }: TransferDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [manualId, setManualId] = useState('');

  // Reset form state when the dialog (re)opens — "adjust state during render"
  // pattern (React-recommended, compiler-safe) instead of setState-in-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSearch('');
      setSelectedId(null);
      setReason('');
      setManualId('');
    }
  }

  // Focus capture/restore keyed on `open` ONLY — a dependency on onClose
  // identity would re-run the cleanup (and steal focus mid-typing) every time
  // the parent re-renders with an inline callback, e.g. on each live-chat
  // WS update. Same fix as Modal.tsx.
  useEffect(() => {
    if (!open) return;
    // Capture the trigger so focus can be restored when the dialog closes
    // (WCAG 2.4.3 Focus Order) — mirrors MobileDrawer.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter((op) => op.display_name.toLowerCase().includes(q));
  }, [operators, search]);

  const manualIdNum = parseInt(manualId, 10);
  const hasManualId = Number.isFinite(manualIdNum) && manualIdNum > 0;
  const hasValidTarget = (selectedId !== null && selectedId > 0) || hasManualId;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Prefer the picker selection; fall back to the advanced numeric input so
    // transfer still works if the roster failed to load (offline-resilient).
    const targetId = selectedId !== null && selectedId > 0 ? selectedId : manualIdNum;
    if (!Number.isFinite(targetId) || targetId <= 0) return;
    onTransfer(targetId, reason.trim() || undefined);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Transfer session"
        className="bg-surface rounded-2xl shadow-2xl w-96 p-5 border border-border-default thai-text focus:outline-none"
      >
        <h3 className="font-semibold text-text-primary text-sm mb-3 flex items-center gap-2 thai-no-break">
          <ArrowRightLeft className="w-4 h-4 text-warning" />Transfer Session
        </h3>
        <form onSubmit={handleSubmit}>
          {/* Searchable operator picker */}
          <label className="block text-xs text-text-secondary mb-1 thai-no-break" htmlFor="transfer-search">
            เลือกผู้ดูแล
          </label>
          <div className="relative mb-2">
            <Search aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            <input
              ref={firstFieldRef}
              id="transfer-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาผู้ดูแล..."
              className="w-full pl-8 pr-3 py-2 border border-border-default rounded-xl text-sm bg-surface text-text-primary placeholder:text-text-tertiary focus-ring focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 transition-all thai-no-break"
            />
          </div>

          <div role="listbox" aria-label="รายชื่อผู้ดูแล" className="max-h-56 overflow-y-auto space-y-1 mb-3">
            {loading ? (
              <p className="text-xs text-text-tertiary px-1 py-4 text-center thai-no-break">กำลังโหลด...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-text-tertiary px-1 py-4 text-center thai-no-break">ไม่พบผู้ดูแล</p>
            ) : (
              filtered.map((op) => {
                const isSelected = op.id === selectedId;
                return (
                  <button
                    type="button"
                    key={op.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedId(op.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors focus-ring ${
                      isSelected ? 'bg-brand-50 ring-1 ring-brand-500/40 dark:bg-brand-500/10' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getAvatarFallbackUrl(op.display_name, 32)}
                        alt={op.display_name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <span
                        aria-hidden
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${STATUS_DOT[op.status]}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{op.display_name}</p>
                      <p className="text-xs text-text-tertiary truncate thai-no-break">
                        {op.online
                          ? `${op.status === 'away' ? 'ไม่ว่าง' : 'ออนไลน์'} · ${op.active_chats} แชท`
                          : '(ออฟไลน์)'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <label className="block text-xs text-text-secondary mb-1 thai-no-break" htmlFor="transfer-reason">
            Reason (optional)
          </label>
          <input
            id="transfer-reason"
            name="reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-border-default rounded-xl text-sm mb-3 bg-surface text-text-primary placeholder:text-text-tertiary focus-ring focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 transition-all thai-no-break"
            placeholder="Why transfer?"
          />

          {/* Advanced fallback: raw numeric ID, resilient when roster fails to load */}
          <details className="mb-4">
            <summary className="text-xs text-text-secondary cursor-pointer select-none thai-no-break rounded focus-ring">
              ▸ Advanced: enter ID manually
            </summary>
            <div className="mt-2">
              <label className="block text-xs text-text-secondary mb-1 thai-no-break" htmlFor="transfer-operator">
                Operator ID
              </label>
              <input
                id="transfer-operator"
                name="operatorId"
                type="number"
                min="1"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                className="w-full px-3 py-2 border border-border-default rounded-xl text-sm bg-surface text-text-primary placeholder:text-text-tertiary focus-ring focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 transition-all thai-no-break"
                placeholder="Enter operator ID"
              />
            </div>
          </details>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-text-secondary bg-muted hover:bg-muted/70 rounded-xl transition-all focus-ring thai-no-break"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasValidTarget}
              className="px-4 py-2 text-xs text-white bg-warning hover:bg-warning/90 rounded-xl font-semibold transition-all active:scale-[0.97] focus-ring thai-no-break disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              Transfer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
