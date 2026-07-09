'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ImageIcon,
  Lock,
  MessageSquareText,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Smile,
  Sticker,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';

import { CannedResponsePicker } from '@/components/admin/CannedResponsePicker';
import { useLiveChatStore } from '../_store/liveChatStore';
import { EmojiPicker } from './EmojiPicker';
import { StickerPicker } from './StickerPicker';
import { QuickReplies } from './QuickReplies';

interface MessageInputProps {
  inputText: string;
  sending: boolean;
  isHumanMode: boolean;
  showCannedPicker: boolean;
  soundEnabled: boolean;
  /** operator_id that currently owns the session (undefined = unowned/waiting). */
  sessionOwnerId?: number;
  /** Human-readable name of the session owner, for the ownership banner. */
  sessionOwnerName?: string;
  /** The signed-in operator's numeric id, used to decide ownership. */
  currentUserId: number;
  /** Take over an other-owned room (transfers the session to the current user). */
  onTakeOver?: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSendFile: (file: File) => void;
  onToggleCannedPicker: () => void;
  onSelectCanned: (content: string) => void;
  onCloseCanned: () => void;
  onToggleSound: () => void;
  onTyping: () => void;
}

export function MessageInput({
  inputText,
  sending,
  isHumanMode,
  showCannedPicker,
  soundEnabled,
  sessionOwnerId,
  sessionOwnerName,
  currentUserId,
  onTakeOver,
  onInputChange,
  onSend,
  onSendFile,
  onToggleCannedPicker,
  onSelectCanned,
  onCloseCanned,
  onToggleSound,
  onTyping,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI extension state from Zustand
  const showEmojiPicker = useLiveChatStore((s) => s.showEmojiPicker);
  const showStickerPicker = useLiveChatStore((s) => s.showStickerPicker);
  const showQuickReplies = useLiveChatStore((s) => s.showQuickReplies);
  const inputExpanded = useLiveChatStore((s) => s.inputExpanded);
  const toggleEmojiPicker = useLiveChatStore((s) => s.toggleEmojiPicker);
  const toggleStickerPicker = useLiveChatStore((s) => s.toggleStickerPicker);
  const toggleQuickReplies = useLiveChatStore((s) => s.toggleQuickReplies);
  const toggleInputExpanded = useLiveChatStore((s) => s.toggleInputExpanded);
  const closeAllPickers = useLiveChatStore((s) => s.closeAllPickers);

  // M17: ownership gate. A session with no owner (waiting) is open to anyone;
  // once an operator owns it, only that operator may type. Backend already
  // enforces this (_require_active_session_owner) — this is the UX affordance.
  //
  // L9.2 (bug #5): Ownership check race. After claimSession completes, the
  // backend takes 100-500ms to propagate session.operator_id. During that
  // window isOwner is true (no owner) so the input enables, but sends fail
  // silently because the backend hasn't confirmed ownership yet. Fix: track
  // the session being claimed and keep the input disabled until the backend
  // confirms (sessionOwnerId === currentUserId) or a 2s safety timeout fires.
  const claiming = useLiveChatStore((s) => s.claiming);
  const selectedId = useLiveChatStore((s) => s.selectedId);

  // Track the session the current user just claimed, to bridge the gap
  // between claim completion and backend propagation. Uses the React-sanctioned
  // "adjust state during render" pattern (not effects) to avoid cascading
  // renders — see https://react.dev/learn/you-might-not-need-an-effect
  const [prevClaiming, setPrevClaiming] = useState(false);
  const [pendingClaimSession, setPendingClaimSession] = useState<string | null>(null);

  // Detect claim start → record which session is being claimed
  if (claiming && !prevClaiming && selectedId) {
    setPrevClaiming(true);
    setPendingClaimSession(selectedId);
  }
  // Detect claim end → update tracker (pendingClaimSession stays set until
  // the backend confirms or the safety timeout fires)
  if (!claiming && prevClaiming) {
    setPrevClaiming(false);
  }
  // Clear once the backend confirms ownership
  if (sessionOwnerId === currentUserId && pendingClaimSession !== null) {
    setPendingClaimSession(null);
  }
  // Clear when switching away from the claimed session
  if (pendingClaimSession && pendingClaimSession !== selectedId) {
    setPendingClaimSession(null);
  }

  // Safety fallback: if the backend never confirms (claim failed, WS dropped),
  // clear after 2s so the input isn't permanently locked. setState is inside
  // setTimeout (async), so it doesn't trigger the set-state-in-effect rule.
  useEffect(() => {
    if (pendingClaimSession && !claiming) {
      const timer = setTimeout(() => setPendingClaimSession(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [pendingClaimSession, claiming]);

  const isClaimPending = pendingClaimSession === selectedId;
  const isOwner = !sessionOwnerId || sessionOwnerId === currentUserId;
  // Keep input disabled while claiming OR during the post-claim propagation
  // window (isClaimPending) to prevent "type but can't send" UX confusion.
  const inputLocked = !isOwner || claiming || isClaimPending;
  const showOwnershipBanner = isHumanMode && !isOwner;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    onInputChange(inputText + emoji);
    closeAllPickers();
    textareaRef.current?.focus();
  };

  const handleQuickReplySelect = (message: string) => {
    onInputChange(message);
    closeAllPickers();
    textareaRef.current?.focus();
  };

  // M19: the two preset surfaces — Quick Replies (Zap, system preset) and
  // Canned Responses (MessageSquareText) — are mutually exclusive; only one
  // may be open at a time. Coordinate via existing actions/props only.
  const handleToggleQuickReplies = () => {
    // Opening Quick Replies closes the canned picker.
    if (!showQuickReplies) {
      onCloseCanned();
    }
    toggleQuickReplies();
  };

  const handleToggleCannedPicker = () => {
    // Opening the canned picker closes Quick Replies (and emoji/sticker).
    if (!showCannedPicker) {
      closeAllPickers();
    }
    onToggleCannedPicker();
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const btnClass = (active: boolean) =>
    `p-2 rounded-lg transition-colors focus-ring ${active ? 'bg-brand-50 text-brand-600' : 'text-text-tertiary hover:text-text-primary hover:bg-muted'}`;

  return (
    <footer className="bg-surface border-t border-border-default relative thai-text">
      {/* Bot mode indicator — inline bar */}
      {!isHumanMode && (
        <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-info/10 border-b border-info/20 text-info text-xs font-semibold thai-no-break">
          <Bot className="w-3.5 h-3.5" />
          Bot กำลังตอบอัตโนมัติ
        </div>
      )}

      {/* M17: ownership banner — shown when another operator owns this session.
          Mirrors the bot-mode inline bar; the take-over button transfers the
          session to the current operator. */}
      {showOwnershipBanner && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/20 text-warning-text text-xs font-semibold thai-no-break"
        >
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>
            Claimed by {sessionOwnerName || 'operator อื่น'} — ห้องนี้กำลังถูกดูแลโดยคนอื่น
          </span>
          {onTakeOver && (
            <button
              type="button"
              onClick={onTakeOver}
              className="ml-1 px-2 py-0.5 rounded-md bg-warning/20 hover:bg-warning/30 text-warning-text font-semibold transition-colors focus-ring shrink-0"
            >
              รับช่วงต่อ
            </button>
          )}
        </div>
      )}

      {/* Canned responses popup — root ของมันเป็น absolute bottom-full left-0 right-0
          จึงต้อง position กับ footer (relative) โดยตรงเพื่อให้กว้างเต็มช่องพิมพ์;
          ถ้าวางใน popups container ด้านล่าง (shrink-to-fit, ไม่มี width) จะถูกบีบเหลือ ~0px */}
      <CannedResponsePicker
        isOpen={showCannedPicker}
        onClose={onCloseCanned}
        onSelect={onSelectCanned}
        inputText={inputText}
      />

      {/* Popups Container (Absolute positioning) */}
      <div className="absolute bottom-full left-0 mb-2 px-2 flex flex-col gap-2 z-20">
        {showEmojiPicker && <EmojiPicker onSelect={handleEmojiSelect} />}
        {showStickerPicker && <StickerPicker onSelect={(pkg, id) => { onInputChange(`[sticker:${pkg}:${id}]`); closeAllPickers(); }} />}
      </div>

      {/* Quick replies bar */}
      {showQuickReplies && <QuickReplies onSelect={handleQuickReplySelect} />}

      {/* Toolbar & Input */}
      <div className={`p-3 space-y-3 ${!isHumanMode || inputLocked ? 'opacity-60 pointer-events-none grayscale' : ''}`}>

        {/* Top Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleEmojiPicker}
              className={btnClass(showEmojiPicker)}
              title="Emoji"
              aria-label="แทรกอิโมจิ"
              aria-pressed={showEmojiPicker}
            >
              <Smile className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggleStickerPicker}
              className={btnClass(showStickerPicker)}
              title="Stickers"
              aria-label="แทรกสติกเกอร์"
              aria-pressed={showStickerPicker}
            >
              <Sticker className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              className={btnClass(false)}
              title="Upload Image"
              aria-label="อัปโหลดรูปภาพ"
            >
              <ImageIcon className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              className={btnClass(false)}
              title="Upload File"
              aria-label="แนบไฟล์"
            >
              <Paperclip className="w-5 h-5" aria-hidden />
            </button>
            <div className="w-px h-5 bg-border-default mx-1" />
            <button
              type="button"
              onClick={handleToggleQuickReplies}
              className={btnClass(showQuickReplies)}
              title="ข้อความด่วน (ค่าตั้งต้นระบบ)"
              aria-label="ข้อความด่วน (ค่าตั้งต้นระบบ)"
              aria-pressed={showQuickReplies}
            >
              <Zap className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleToggleCannedPicker}
              className={btnClass(showCannedPicker)}
              title="ข้อความสำเร็จรูป"
              aria-label="ข้อความสำเร็จรูป"
              aria-pressed={showCannedPicker}
            >
              <MessageSquareText className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleSound}
              className={btnClass(!soundEnabled)}
              title={soundEnabled ? 'Mute' : 'Unmute'}
              aria-label={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
              aria-pressed={!soundEnabled}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" aria-hidden /> : <VolumeX className="w-4 h-4" aria-hidden />}
            </button>
          </div>
        </div>

        {/* Input Field Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="relative flex items-start gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSendFile(file);
              e.currentTarget.value = '';
            }}
          />
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                onInputChange(e.target.value);
                onTyping();
              }}
              onKeyDown={handleKeyDown}
              disabled={!isHumanMode || sending || inputLocked}
              placeholder="Type a message..."
              rows={inputExpanded ? 4 : 1}
              className="w-full bg-bg border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 focus:bg-surface resize-none transition-colors shadow-sm thai-no-break custom-scrollbar"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            {/* Expand Toggle */}
            <button
              type="button"
              onClick={toggleInputExpanded}
              className="absolute right-2 top-2 p-1.5 inline-flex items-center justify-center text-text-tertiary hover:text-text-primary rounded focus-ring"
              aria-label={inputExpanded ? 'ย่อกล่องข้อความ' : 'ขยายกล่องข้อความ'}
              aria-expanded={inputExpanded}
            >
              {inputExpanded ? <Minimize2 className="w-3 h-3" aria-hidden /> : <Maximize2 className="w-3 h-3" aria-hidden />}
            </button>
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || sending || !isHumanMode || inputLocked}
            aria-label="ส่งข้อความ"
            className={`p-3 rounded-xl shadow-sm transition-[background-color,box-shadow,transform] flex-shrink-0 ${inputText.trim() && isHumanMode && !inputLocked
                ? 'bg-brand-600 text-white hover:bg-brand-700 hover:shadow active:scale-95'
                : 'bg-muted text-text-tertiary cursor-not-allowed'
              }`}
          >
            <Send className="w-5 h-5 translate-x-[1px]" aria-hidden />
          </button>
        </form>
      </div>
    </footer>
  );
}
