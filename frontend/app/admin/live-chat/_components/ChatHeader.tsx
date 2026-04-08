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
  const isBot = currentChat?.chat_mode === 'BOT';
  const isActive = currentChat?.session?.status === 'ACTIVE';
  const isVip = currentChat?.tags?.some((tag) => tag.name.toUpperCase() === 'VIP');

  const statusColor = isActive ? 'bg-online' : currentChat ? 'bg-away' : 'bg-offline';
  const displayName = currentChat?.display_name || 'Unknown User';
  const fallback = displayName.charAt(0) || 'U';

  return (
    <header className="h-20 border-b border-border-default bg-white/80 backdrop-blur-sm px-5 thai-text">
      <div className="flex h-full items-center justify-between">
        {/* Left: back + avatar + name + mode label */}
        <div className="flex items-center gap-3">
          {isMobileView && (
            <button
              onClick={onBackToList}
              className="rounded-xl border border-border-default p-2 text-text-tertiary transition-colors hover:bg-muted"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <button
            className="relative cursor-pointer"
            onClick={onToggleCustomerPanel}
            aria-label="Toggle customer panel"
          >
            <Avatar
              size="lg"
              src={currentChat?.picture_url}
              alt={displayName}
              fallback={fallback}
              className="border-2 border-white ring-2 ring-brand-500/20"
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${statusColor}`}
            />
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <p className="thai-no-break text-base font-bold text-text-primary">{displayName}</p>
              {isVip && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
            </div>
            <p className="thai-no-break text-xs text-text-tertiary">
              {isBot ? 'Bot Mode' : 'Manual Mode'}
            </p>
          </div>
        </div>

        {/* Right: mode toggle + session actions + panel toggle */}
        <div className="flex items-center gap-2">
          {/* Two-button segmented mode control */}
          <div className="hidden md:flex items-center gap-1 p-1 bg-muted rounded-full">
            <button
              onClick={() => onToggleMode('BOT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                isBot
                  ? 'gradient-active text-white shadow-md shadow-brand-900/20'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
              aria-label="Switch to Bot mode"
              aria-pressed={isBot}
            >
              <Zap className="h-3.5 w-3.5" />
              Bot
            </button>
            <button
              onClick={() => onToggleMode('HUMAN')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                !isBot
                  ? 'gradient-active text-white shadow-md shadow-brand-900/20'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
              aria-label="Switch to Manual mode"
              aria-pressed={!isBot}
            >
              <User className="h-3.5 w-3.5" />
              Manual
            </button>
          </div>

          <div className="mx-1 hidden h-6 w-px bg-border-default sm:block" />

          <SessionActions
            session={currentChat?.session}
            claiming={claiming}
            onClaim={onClaim}
            onClose={onClose}
            onTransfer={onTransfer}
          />

          <button
            onClick={onToggleCustomerPanel}
            className={`rounded-xl border p-2 transition-colors ${
              showCustomerPanel
                ? 'border-brand-200 bg-brand-50 text-brand-600'
                : 'border-border-default bg-surface text-text-tertiary hover:bg-muted'
            }`}
            aria-label={showCustomerPanel ? 'Hide customer panel' : 'Show customer panel'}
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
