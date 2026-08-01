'use client';

import React, { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  Bot,
  CheckCheck,
  Clock,
  Eye,
  MoreVertical,
  Pin,
  PinOff,
  ShieldAlert,
  Star,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';

import type { Conversation } from '../_types';
import { getAvatarFallbackUrl } from '@/lib/constants/live-chat-avatar';
import { PRESENCE_DOT_CLASS, PRESENCE_LABEL, getSessionPresence } from '@/lib/constants/live-chat-presence';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatWaiting, getWaitingSeconds, getWaitingTier } from '@/lib/waiting-time';

/** How often the WAITING badge refreshes so the elapsed label stays current. */
const WAITING_REFRESH_MS = 30_000;

/** Token-based badge classes per SLA tier, with a selected-row variant that
 *  stays legible on the brand gradient background. */
const WAITING_BADGE_CLASS: Record<'amber' | 'red', { default: string; selected: string }> = {
  amber: {
    default: 'bg-warning/15 text-warning-text',
    selected: 'bg-white/15 text-warning-light',
  },
  red: {
    default: 'bg-danger/15 text-danger-text',
    selected: 'bg-white/15 text-danger-light',
  },
};

interface ConversationItemProps {
  optionId: string;
  conversation: Conversation;
  selected: boolean;
  formattedTime?: string;
  onSelect: (lineUserId: string) => void;
  onMenuToggle: (lineUserId: string) => void;
  onMarkRead: () => void;
  onTogglePin: (lineUserId: string) => void;
  onToggleMute: (lineUserId: string) => void;
  onToggleSpam: (lineUserId: string) => void;
  onArchive: (lineUserId: string) => void;
  onDeleteRequest: (lineUserId: string) => void;
}

export const ConversationItem = memo(function ConversationItem({
  optionId,
  conversation,
  selected,
  formattedTime,
  onSelect,
  onMenuToggle,
  onMarkRead,
  onTogglePin,
  onToggleMute,
  onToggleSpam,
  onArchive,
  onDeleteRequest,
}: ConversationItemProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const handleSelect = React.useCallback(() => onSelect(conversation.line_user_id), [onSelect, conversation.line_user_id]);
  const handleMenuToggle = React.useCallback(() => onMenuToggle(conversation.line_user_id), [onMenuToggle, conversation.line_user_id]);
  const isWaiting = conversation.session?.status === 'WAITING';
  const presence = getSessionPresence(conversation.session?.status);
  const isVip = conversation.tags?.some((t) => t.name.toUpperCase() === 'VIP');
  const isBot = conversation.chat_mode === 'BOT';
  const isPinned = conversation.is_pinned === true;
  const isMuted = conversation.is_muted === true;
  const isSpam = conversation.is_spam === true;
  // Archive (hide) only makes sense once the session is closed.
  const isClosed = !conversation.session || conversation.session.status === 'CLOSED';

  // Waiting-time badge (M15): only for WAITING sessions that carry a started_at.
  const waitingStartedAt = isWaiting ? conversation.session?.started_at : undefined;
  // Tick state forces a re-render so the elapsed label refreshes; the value
  // itself is unused (the real value is computed fresh during render).
  const [, refreshWaiting] = React.useState(0);
  React.useEffect(() => {
    if (!waitingStartedAt) {
      // Return undefined instead of early return to ensure cleanup always runs
      return undefined;
    }
    const id = setInterval(() => refreshWaiting((n) => n + 1), WAITING_REFRESH_MS);
    return () => clearInterval(id);
  }, [waitingStartedAt]);
  const waitingSeconds = waitingStartedAt ? getWaitingSeconds(waitingStartedAt) : 0;
  const waitingTier = getWaitingTier(waitingSeconds);

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const statusLabel = PRESENCE_LABEL[presence];

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={selected}
      aria-label={`${conversation.display_name}, ${statusLabel}${conversation.unread_count > 0 ? `, ${conversation.unread_count} ข้อความใหม่` : ''}`}
      className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors thai-text border ${
        selected
          ? 'gradient-active text-white shadow-lg shadow-brand-900/30 border-transparent'
          : 'text-sidebar-text-muted hover:bg-white/5 border-transparent'
      }`}
      onClick={handleSelect}
    >
      {/* Avatar + status dot */}
      <div className="relative flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={conversation.picture_url || getAvatarFallbackUrl(conversation.display_name, 40)}
          className="w-10 h-10 rounded-full object-cover"
          alt={conversation.display_name}
        />
        <div
          aria-hidden
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar-bg ${PRESENCE_DOT_CLASS[presence]}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 min-w-0">
            <span className={`font-semibold truncate break-words text-sm ${selected ? 'text-white' : 'text-sidebar-fg'}`}>
              {conversation.display_name}
            </span>
            {isPinned && <Pin className="w-3 h-3 text-brand-400 flex-shrink-0" aria-label="ปักหมุดแล้ว" />}
            {isMuted && <VolumeX className="w-3 h-3 text-sidebar-text-muted flex-shrink-0" aria-label="ปิดเสียงแล้ว" />}
            {isVip && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
          </span>
          <span className={`text-2xs flex-shrink-0 thai-no-break ${selected ? 'text-white/80' : 'text-sidebar-text-muted'}`}>
            {formattedTime || ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`truncate break-words text-xs thai-no-break ${selected ? 'text-white/80' : 'text-sidebar-text-muted'}`}>
            {conversation.last_message?.content || 'No messages yet'}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Mode badge */}
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-2xs font-medium ${
              selected
                ? 'bg-white/15 text-white'
                : isBot
                  ? 'bg-info/15 text-info'
                  : 'bg-online/15 text-online'
            }`}>
              {isBot ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
              {isBot ? 'Bot' : 'Manual'}
            </span>
            {/* Spam badge */}
            {isSpam && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-2xs font-medium bg-danger/15 text-danger-text"
                aria-label="ทำเครื่องหมายว่าเป็นสแปม"
              >
                <ShieldAlert className="w-2.5 h-2.5" />
                สแปม
              </span>
            )}
            {/* Waiting-time badge (amber ≥5m, red ≥15m) */}
            {waitingStartedAt && waitingTier !== 'normal' && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-2xs font-medium tabular-nums ${
                  WAITING_BADGE_CLASS[waitingTier][selected ? 'selected' : 'default']
                }`}
                aria-label={`รอคิว ${formatWaiting(waitingSeconds)}`}
              >
                <Clock className="w-2.5 h-2.5" />
                {formatWaiting(waitingSeconds)}
              </span>
            )}
            {/* Unread badge */}
            {conversation.unread_count > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 bg-danger text-white text-2xs font-bold rounded-full flex items-center justify-center tabular-nums">
                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        {!!conversation.tags?.length && (
          <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
            {conversation.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium text-white thai-no-break"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {conversation.tags.length > 2 && (
              <span className={`text-2xs ${selected ? 'text-white/80' : 'text-sidebar-text-muted'}`}>+{conversation.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Menu button + dropdown */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
            handleMenuToggle();
          }}
          className={`p-1.5 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-ring ${selected ? 'text-white/80 hover:text-white' : 'text-sidebar-text-muted hover:text-white'}`}
          aria-label={`Open actions for ${conversation.display_name}`}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: reduced ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -4 }}
              transition={{ duration: reduced ? 0 : 0.15, ease: [0, 0, 0.2, 1] }}
              className="absolute right-0 top-full mt-1 w-44 bg-surface rounded-xl shadow-2xl border border-border-default overflow-hidden z-50"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); handleSelect(); }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-muted w-full text-left cursor-pointer focus-ring"
              >
                <Eye className="w-3.5 h-3.5 text-text-tertiary" />
                ดูประวัติแชท
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMarkRead(); }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-muted w-full text-left cursor-pointer focus-ring"
              >
                <CheckCheck className="w-3.5 h-3.5 text-text-tertiary" />
                ทำเครื่องหมายว่าอ่านแล้ว
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onTogglePin(conversation.line_user_id); }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-muted w-full text-left cursor-pointer focus-ring"
              >
                {isPinned ? <PinOff className="w-3.5 h-3.5 text-text-tertiary" /> : <Pin className="w-3.5 h-3.5 text-text-tertiary" />}
                {isPinned ? 'ถอนหมุด' : 'ปักหมุด'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleMute(conversation.line_user_id); }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-muted w-full text-left cursor-pointer focus-ring"
              >
                {isMuted ? <Volume2 className="w-3.5 h-3.5 text-text-tertiary" /> : <VolumeX className="w-3.5 h-3.5 text-text-tertiary" />}
                {isMuted ? 'เปิดเสียงแจ้งเตือน' : 'ปิดเสียงแจ้งเตือน'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleSpam(conversation.line_user_id); }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-muted w-full text-left cursor-pointer focus-ring"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-text-tertiary" />
                {isSpam ? 'ยกเลิกสแปม' : 'ทำเครื่องหมายว่าสแปม'}
              </button>
              <div className="border-t border-border-default my-1" />
              <button
                onClick={(e) => { e.stopPropagation(); if (isClosed) { setMenuOpen(false); onArchive(conversation.line_user_id); } }}
                disabled={!isClosed}
                aria-disabled={!isClosed}
                title={isClosed ? undefined : 'ปิด session ก่อนจึงจะซ่อนได้'}
                className={`flex items-center gap-2.5 px-3 py-2 text-xs w-full text-left focus-ring ${
                  isClosed
                    ? 'text-text-secondary hover:bg-muted cursor-pointer'
                    : 'text-text-tertiary opacity-50 cursor-not-allowed'
                }`}
              >
                <Archive className="w-3.5 h-3.5 text-text-tertiary" />
                ซ่อนสนทนา
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDeleteRequest(conversation.line_user_id); }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-danger hover:bg-danger/10 w-full text-left cursor-pointer focus-ring"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบ
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
