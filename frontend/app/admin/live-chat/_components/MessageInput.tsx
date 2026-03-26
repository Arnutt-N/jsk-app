'use client';

import React, { useRef } from 'react';
import {
  Bot,
  ImageIcon,
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

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const btnClass = (active: boolean) =>
    `p-2 rounded-lg transition-colors ${active ? 'bg-brand-50 text-brand-600' : 'text-text-tertiary hover:text-text-primary hover:bg-muted'}`;

  return (
    <footer className="bg-surface border-t border-border-default relative thai-text">
      {/* Bot mode indicator */}
      {!isHumanMode && (
        <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
          <span className="px-3 py-1.5 bg-black/75 text-white backdrop-blur-sm text-xs font-semibold rounded-full shadow-lg flex items-center gap-1.5 thai-no-break animate-fade-in-up">
            <Bot className="w-3.5 h-3.5" />Bot is handling
          </span>
        </div>
      )}

      {/* Popups Container (Absolute positioning) */}
      <div className="absolute bottom-full left-0 mb-2 px-2 flex flex-col gap-2 z-20">
        <CannedResponsePicker
          isOpen={showCannedPicker}
          onClose={onCloseCanned}
          onSelect={onSelectCanned}
          inputText={inputText}
        />
        {showEmojiPicker && <EmojiPicker onSelect={handleEmojiSelect} />}
        {showStickerPicker && <StickerPicker onSelect={(pkg, id) => { onInputChange(`[sticker:${pkg}:${id}]`); closeAllPickers(); }} />}
      </div>

      {/* Quick replies bar */}
      {showQuickReplies && <QuickReplies onSelect={handleQuickReplySelect} />}

      {/* Toolbar & Input */}
      <div className={`p-3 space-y-3 ${!isHumanMode ? 'opacity-60 pointer-events-none grayscale' : ''}`}>

        {/* Top Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button type="button" onClick={toggleEmojiPicker} className={btnClass(showEmojiPicker)} title="Emoji">
              <Smile className="w-5 h-5" />
            </button>
            <button type="button" onClick={toggleStickerPicker} className={btnClass(showStickerPicker)} title="Stickers">
              <Sticker className="w-5 h-5" />
            </button>
            <button type="button" onClick={openFilePicker} className={btnClass(false)} title="Upload Image">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button type="button" onClick={openFilePicker} className={btnClass(false)} title="Upload File">
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-border-default mx-1" />
            <button
              type="button"
              onClick={toggleQuickReplies}
              className={btnClass(showQuickReplies)}
              title="Quick Replies"
            >
              <Zap className="w-5 h-5" />
            </button>
            <button type="button" onClick={onToggleCannedPicker} className={btnClass(showCannedPicker)} title="Canned Responses">
              <MessageSquareText className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={onToggleSound} className={btnClass(!soundEnabled)} title={soundEnabled ? 'Mute' : 'Unmute'}>
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Input Field Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="relative flex items-end gap-2"
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
              disabled={!isHumanMode || sending}
              placeholder="Type a message..."
              rows={inputExpanded ? 4 : 1}
              className="w-full bg-bg border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 focus:bg-surface resize-none transition-all shadow-sm thai-no-break custom-scrollbar"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            {/* Expand Toggle */}
            <button
              type="button"
              onClick={toggleInputExpanded}
              className="absolute right-2 top-2 p-1 text-text-tertiary hover:text-text-primary rounded"
            >
              {inputExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || sending || !isHumanMode}
            className={`p-3 rounded-xl shadow-sm transition-all flex-shrink-0 ${inputText.trim() && isHumanMode
                ? 'bg-brand-600 text-white hover:bg-brand-700 hover:shadow active:scale-95'
                : 'bg-muted text-text-tertiary cursor-not-allowed'
              }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </footer>
  );
}
