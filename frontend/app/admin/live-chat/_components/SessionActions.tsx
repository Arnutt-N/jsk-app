'use client';

import React from 'react';
import { ArrowRightLeft, CheckCircle2, Lock, RefreshCw, Users } from 'lucide-react';

import type { Session } from '../_types';

interface SessionActionsProps {
  session?: Session;
  claiming: boolean;
  /**
   * Set when another operator currently holds/contends the claim for this room
   * (broadcast-driven, never optimistic). When present, the Claim button is
   * replaced by a disabled lock so this operator cannot race the claim.
   */
  claimedByOther?: { name: string };
  onClaim: () => void;
  onClose: () => void;
  onTransfer: () => void;
}

export function SessionActions({ session, claiming, claimedByOther, onClaim, onClose, onTransfer }: SessionActionsProps) {
  // When another operator holds/contends this room the lock takes precedence
  // over the status-derived actions. onSessionClaimed flips the room to ACTIVE
  // AND records the contender in the same broadcast, so gating the lock on
  // status==='WAITING' would make it unreachable (the room is already ACTIVE by
  // the time the contender is set) — and a non-owner would otherwise see the
  // owner's Transfer/Done. Showing the lock here matches the M16 design intent.
  if (claimedByOther) {
    return (
      <div role="group" aria-label="การจัดการสาย" className="flex items-center gap-2 thai-text">
        <button
          disabled
          className="px-3 py-1.5 bg-muted text-text-tertiary rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed"
          aria-label={`${claimedByOther.name} กำลังรับเรื่อง`}
        >
          <Lock className="w-4 h-4" />
          <span className="thai-no-break">{claimedByOther.name} กำลังรับเรื่อง...</span>
        </button>
      </div>
    );
  }

  return (
    <div role="group" aria-label="การจัดการสาย" className="flex items-center gap-2 thai-text">
      {session?.status === 'WAITING' && (
        <button
          onClick={onClaim}
          disabled={claiming}
          className={`px-3 py-1.5 text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all focus-ring ${claiming ? 'bg-brand-600/70 cursor-wait' : 'gradient-active hover:shadow-lg active:scale-[0.97]'}`}
          aria-label="รับสาย"
        >
          {claiming ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          <span className="thai-no-break">{claiming ? 'กำลังรับสาย…' : 'รับสาย'}</span>
        </button>
      )}
      {session?.status === 'ACTIVE' && (
        <>
          <button onClick={onTransfer} className="px-3 py-1.5 bg-warning hover:bg-warning-dark text-white rounded-full text-xs font-semibold flex items-center gap-1.5 focus-ring" aria-label="โอนสาย">
            <ArrowRightLeft className="w-4 h-4" /><span className="thai-no-break">โอนสาย</span>
          </button>
          <button onClick={onClose} className="px-3 py-1.5 bg-success hover:bg-success-dark text-white rounded-full text-xs font-semibold flex items-center gap-1.5 focus-ring" aria-label="ปิดสาย">
            <CheckCircle2 className="w-4 h-4" /><span className="thai-no-break">ปิดสาย</span>
          </button>
        </>
      )}
    </div>
  );
}
