'use client';

import React from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Star,
  User,
  Zap,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { CurrentChat } from '../_types';
import { useLiveChatContext } from '../_context/LiveChatContext';
import { SessionActions } from './SessionActions';
import { ProfileDropdown } from './ProfileDropdown';

interface ChatHeaderProps {
  currentChat: CurrentChat | null;
  claiming: boolean;
  isMobileView: boolean;
  showCustomerPanel: boolean;
  onBackToList: () => void;
  onToggleMode: (mode: 'BOT' | 'HUMAN') => void | Promise<void>;
  onClaim: () => void;
  onClose: () => void;
  onTransfer: () => void;
  onToggleCustomerPanel: () => void;
}

export function ChatHeader({
  currentChat,
  claiming,
  isMobileView,
  showCustomerPanel,
  onBackToList,
  onToggleMode,
  onClaim,
  onClose,
  onTransfer,
  onToggleCustomerPanel,
}: ChatHeaderProps) {
  const { currentUserId, getClaimContender } = useLiveChatContext();
  const isBot = currentChat?.chat_mode === 'BOT';
  const isActive = currentChat?.session?.status === 'ACTIVE';
  const isVip = currentChat?.tags?.some((tag) => tag.name.toUpperCase() === 'VIP');

  // M18: drive chat mode from the session lifecycle. While a session exists, mode
  // is dictated by Claim/Done (SessionActions), so the manual Bot|Manual toggle is
  // hidden to remove the conflicting control. The toggle returns only when there is
  // no session (free BOT/HUMAN choice). Mode reverts to BOT automatically on close.
  const hasSession = !!currentChat?.session;
  const sessionStatus = currentChat?.session?.status;

  // Reflect the broadcast claim-contention lock: show "X กำลังรับเรื่อง..." only
  // when someone ELSE holds/contends the claim for this room (M16). The contender
  // map already clears on close/transfer (context-owned), so we just read state.
  const contender = currentChat ? getClaimContender(currentChat.line_user_id) : undefined;
  const claimedByOther =
    contender && contender.operatorId !== currentUserId ? { name: contender.name } : undefined;

  const statusColor = isActive ? 'bg-online' : currentChat ? 'bg-away' : 'bg-offline';
  const statusLabel = isActive ? 'ออนไลน์' : currentChat ? 'กำลังรอ' : 'ออฟไลน์';
  const displayName = currentChat?.display_name || 'Unknown User';
  const fallback = displayName.charAt(0) || 'U';

  // M18/L10: Thai, session-aware helper text under the name. This replaces the
  // hidden toggle's affordance during a session. No session → mode choice text.
  const modeLabel = hasSession
    ? sessionStatus === 'ACTIVE'
      ? 'กำลังสนทนา'
      : 'รอรับสาย'
    : isBot
      ? 'โหมดบอท'
      : 'โหมดเจ้าหน้าที่';

  return (
    <header className="h-20 border-b border-border-default bg-white/80 backdrop-blur-sm px-5 thai-text">
      <div className="flex h-full items-center justify-between">
        {/* Left: back + avatar + name + mode label */}
        <div className="flex items-center gap-3">
          {isMobileView && (
            <button
              onClick={onBackToList}
              className="rounded-xl border border-border-default p-2 text-text-tertiary transition-colors hover:bg-muted focus-ring"
              aria-label="กลับไปรายการสนทนา"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <button
            className="relative cursor-pointer focus-ring rounded-full"
            onClick={onToggleCustomerPanel}
            aria-label="เปิด/ปิดแผงข้อมูลลูกค้า"
          >
            <Avatar
              size="lg"
              src={currentChat?.picture_url}
              alt={displayName}
              fallback={fallback}
              className="border-2 border-white ring-2 ring-brand-500/20"
            />
            <span
              aria-hidden
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${statusColor}`}
            />
            <span className="sr-only">{statusLabel}</span>
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <p className="thai-no-break break-words text-base font-bold text-text-primary">{displayName}</p>
              {isVip && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
            </div>
            <p role="status" aria-live="polite" aria-atomic="true" className="thai-text thai-no-break text-xs text-text-tertiary">
              {modeLabel}
            </p>
          </div>
        </div>

        {/* Right: mode toggle + session actions + panel toggle */}
        <div className="flex items-center gap-2">
          {/* M18: segmented Bot|Manual toggle shows ONLY when there is no session
              (free choice). During a session, Claim/Done dictate the mode, so the
              toggle AND its adjacent divider hide together to avoid a control
              conflict and an orphan separator. */}
          {!hasSession && (
            <>
              {/* Two-button segmented mode control */}
              <div className="hidden md:flex items-center gap-1 p-1 bg-muted rounded-full">
                <button
                  onClick={() => onToggleMode('BOT')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors duration-200 focus-ring thai-text ${
                    isBot
                      ? 'gradient-active text-white shadow-md shadow-brand-900/20'
                      : 'text-text-tertiary hover:text-text-primary'
                  }`}
                  aria-label="สลับเป็นโหมดบอท"
                  aria-pressed={isBot}
                >
                  <Zap className="h-3.5 w-3.5" />
                  บอท
                </button>
                <button
                  onClick={() => onToggleMode('HUMAN')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors duration-200 focus-ring thai-text ${
                    !isBot
                      ? 'gradient-active text-white shadow-md shadow-brand-900/20'
                      : 'text-text-tertiary hover:text-text-primary'
                  }`}
                  aria-label="สลับเป็นโหมดเจ้าหน้าที่"
                  aria-pressed={!isBot}
                >
                  <User className="h-3.5 w-3.5" />
                  เจ้าหน้าที่
                </button>
              </div>

              <div className="mx-1 hidden h-6 w-px bg-border-default sm:block" />
            </>
          )}

          <SessionActions
            session={currentChat?.session}
            claiming={claiming}
            claimedByOther={claimedByOther}
            onClaim={onClaim}
            onClose={onClose}
            onTransfer={onTransfer}
          />

          <button
            onClick={onToggleCustomerPanel}
            className={`rounded-xl border p-2 transition-colors focus-ring ${
              showCustomerPanel
                ? 'border-brand-200 bg-brand-50 text-brand-600'
                : 'border-border-default bg-surface text-text-tertiary hover:bg-muted'
            }`}
            aria-label={showCustomerPanel ? 'ซ่อนแผงข้อมูลลูกค้า' : 'แสดงแผงข้อมูลลูกค้า'}
          >
            {showCustomerPanel ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          <div className="mx-1 hidden h-6 w-px bg-border-default sm:block" />
          <ProfileDropdown />
        </div>
      </div>
    </header>
  );
}
