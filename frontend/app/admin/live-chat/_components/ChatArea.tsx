'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Bell, MessageSquare, RefreshCw, Wifi, WifiOff } from 'lucide-react';

import { ProfileDropdown } from './ProfileDropdown';

import type { Message } from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import { useLiveChatContext } from '../_context/LiveChatContext';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';

function getSenderLabel(message: Message, displayName?: string) {
  if (message.direction === 'INCOMING') return displayName || 'User';
  if (message.sender_role === 'BOT') return 'Bot';
  return message.operator_name || 'Admin';
}

const VIRTUALIZATION_THRESHOLD = 200;
const VIRTUAL_ESTIMATED_ROW_HEIGHT = 88;
const VIRTUAL_OVERSCAN = 12;

export function ChatArea() {
  // Read state from Zustand
  const conversations = useLiveChatStore((s) => s.conversations);
  const selectedId = useLiveChatStore((s) => s.selectedId);
  const currentChat = useLiveChatStore((s) => s.currentChat);
  const messages = useLiveChatStore((s) => s.messages);
  const claiming = useLiveChatStore((s) => s.claiming);
  const showCustomerPanel = useLiveChatStore((s) => s.showCustomerPanel);
  const inputText = useLiveChatStore((s) => s.inputText);
  const sending = useLiveChatStore((s) => s.sending);
  const showCannedPicker = useLiveChatStore((s) => s.showCannedPicker);
  const soundEnabled = useLiveChatStore((s) => s.soundEnabled);
  const pendingMessages = useLiveChatStore((s) => s.pendingMessages);
  const failedMessages = useLiveChatStore((s) => s.failedMessages);
  const hasMoreHistory = useLiveChatStore((s) => s.hasMoreHistory);
  const isLoadingHistory = useLiveChatStore((s) => s.isLoadingHistory);

  // API methods and non-store state from Context
  const {
    wsStatus,
    isMobileView,
    typingUsersCount,
    focusedMessageId,
    clearFocusedMessage,
    isHumanMode,
    sendMessage,
    sendMedia,
    claimSession,
    closeSession,
    toggleMode,
    setInputText,
    setShowTransferDialog,
    setShowCannedPicker,
    setShowCustomerPanel,
    setSoundEnabled,
    startTyping,
    loadOlderMessages,
    retryMessage,
    selectConversation,
  } = useLiveChatContext();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historySentinelRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  // Helper to check if user is near bottom of scroll container
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Only auto-scroll if near bottom (not when user scrolled up to read older messages)
  useEffect(() => {
    if (isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    setViewportHeight(container.clientHeight);
    const observer = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedId]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const idx = messages.findIndex((m) => m.id === focusedMessageId);
    if (idx < 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = Math.max(
      0,
      idx * VIRTUAL_ESTIMATED_ROW_HEIGHT - container.clientHeight / 2,
    );
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`message-${focusedMessageId}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clearFocusedMessage();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [clearFocusedMessage, focusedMessageId, messages]);

  useEffect(() => {
    if (!historySentinelRef.current || !selectedId) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (!hasMoreHistory || isLoadingHistory) return;
      const container = messagesContainerRef.current;
      const prevHeight = container?.scrollHeight || 0;
      await loadOlderMessages();
      requestAnimationFrame(() => {
        if (!container) return;
        const delta = container.scrollHeight - prevHeight;
        container.scrollTop += delta;
      });
    }, { root: messagesContainerRef.current, threshold: 0.1 });
    observer.observe(historySentinelRef.current);
    return () => observer.disconnect();
  }, [loadOlderMessages, hasMoreHistory, isLoadingHistory, selectedId]);

  const connectionStatus = useMemo(() => {
    switch (wsStatus) {
      case 'connected':
        return { icon: Wifi, className: 'bg-online/10 text-online', label: 'Connected' };
      case 'connecting':
      case 'authenticating':
        return { icon: Wifi, className: 'bg-away/10 text-away', label: 'Connecting...' };
      case 'reconnecting':
        return { icon: WifiOff, className: 'bg-away/10 text-away', label: 'Reconnecting...' };
      default:
        return { icon: WifiOff, className: 'bg-offline/10 text-offline', label: 'Offline' };
    }
  }, [wsStatus]);

  const virtualEnabled = messages.length > VIRTUALIZATION_THRESHOLD;
  const visibleWindow = useMemo(() => {
    const total = messages.length;
    if (!virtualEnabled || total === 0) {
      return { startIndex: 0, endIndex: total, topPadding: 0, bottomPadding: 0 };
    }
    const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_ESTIMATED_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ESTIMATED_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
    const end = Math.min(total, start + visibleCount);
    return {
      startIndex: start,
      endIndex: end,
      topPadding: start * VIRTUAL_ESTIMATED_ROW_HEIGHT,
      bottomPadding: Math.max(0, (total - end) * VIRTUAL_ESTIMATED_ROW_HEIGHT),
    };
  }, [scrollTop, messages.length, viewportHeight, virtualEnabled]);

  // Empty state (no conversation selected)
  if (!selectedId) {
    const ConnIcon = connectionStatus.icon;
    const waitingCount = conversations.filter((c) => c.session?.status === 'WAITING').length;
    const activeCount = conversations.filter((c) => c.session?.status === 'ACTIVE').length;
    return (
      <div className="flex-1 flex flex-col">
        <header className="h-20 px-5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-border-default flex items-center justify-between">
          <span className="font-semibold text-text-primary text-sm">Live Chat Console</span>
          <div className="flex items-center gap-2.5">
            {/* Connection status pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                wsStatus === 'connected'
                  ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20'
                  : wsStatus === 'disconnected'
                    ? 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border-red-200 dark:border-red-500/20'
                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
              }`}
              aria-live="polite"
            >
              <span className="relative flex h-2 w-2">
                {wsStatus === 'connected' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  wsStatus === 'connected' ? 'bg-green-500' :
                  wsStatus === 'disconnected' ? 'bg-red-500' : 'bg-amber-500'
                }`} />
              </span>
              {connectionStatus.label}
            </div>

            {/* Notification bell — waiting conversations */}
            <button
              className="relative p-2 rounded-xl text-text-tertiary hover:text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all cursor-pointer"
              aria-label={`${waitingCount} conversations waiting`}
              title={`${waitingCount} รอรับเรื่อง`}
            >
              <Bell className="w-5 h-5" />
              {waitingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-900 animate-pulse">
                  {waitingCount}
                </span>
              )}
            </button>

            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <ProfileDropdown />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center bg-bg thai-text">
          <div className="text-center p-8">
            <div className="w-20 h-20 bg-surface rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4 border border-border-default">
              <MessageSquare className="w-9 h-9 text-brand-500" />
            </div>
            <p className="text-text-primary font-semibold text-base mb-1 thai-no-break">Select a Conversation</p>
            <p className="text-text-tertiary text-sm">Choose from the sidebar to start chatting</p>
            <div className="flex gap-6 justify-center mt-6">
              <div>
                <div className="text-2xl font-bold text-text-primary">{waitingCount}</div>
                <div className="text-xs text-text-tertiary">Waiting</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text-primary">{activeCount}</div>
                <div className="text-xs text-text-tertiary">Active</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-bg min-w-0 relative z-10">
      <ChatHeader
        currentChat={currentChat}
        claiming={claiming}
        isMobileView={isMobileView}
        showCustomerPanel={showCustomerPanel}
        onBackToList={() => selectConversation(null)}
        onToggleMode={toggleMode}
        onClaim={claimSession}
        onClose={closeSession}
        onTransfer={() => setShowTransferDialog(true)}
        onToggleCustomerPanel={() => setShowCustomerPanel(!showCustomerPanel)}
      />
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-bg custom-scrollbar"
        aria-live="polite"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div ref={historySentinelRef} />
        {virtualEnabled && <div aria-hidden style={{ height: `${visibleWindow.topPadding}px` }} />}
        {isLoadingHistory && <div className="text-center text-xs text-text-tertiary py-2">Loading older messages...</div>}

        {/* Date separator */}
        <div className="flex items-center gap-3 pb-3">
          <div className="flex-1 h-px bg-border-default" />
          <span className="px-3 py-1 bg-surface text-text-tertiary text-xs font-medium rounded-full shadow-sm border border-border-default">
            {currentChat?.session?.started_at
              ? new Date(currentChat.session.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : 'Today'}
          </span>
          <div className="flex-1 h-px bg-border-default" />
        </div>

        {messages
          .slice(visibleWindow.startIndex, visibleWindow.endIndex)
          .map((message, visibleIdx) => {
          const idx = visibleWindow.startIndex + visibleIdx;
          const prev = messages[idx - 1];
          const next = messages[idx + 1];
          const showSender = !prev || prev.direction !== message.direction || prev.sender_role !== message.sender_role;
          const showAvatar = !next || next.direction !== message.direction || next.sender_role !== message.sender_role;
          const pending = !!(message.temp_id && pendingMessages.has(message.temp_id));
          const failed = !!(message.temp_id && failedMessages.has(message.temp_id));
          return (
            <MessageBubble
              key={message.id || message.temp_id}
              message={message}
              elementId={message.id ? `message-${message.id}` : undefined}
              isPending={pending}
              isFailed={failed}
              senderLabel={getSenderLabel(message, currentChat?.display_name)}
              showSender={showSender}
              showAvatar={showAvatar}
              incomingAvatar={currentChat?.picture_url}
              onRetry={retryMessage}
            />
          );
        })}
        {virtualEnabled && <div aria-hidden style={{ height: `${visibleWindow.bottomPadding}px` }} />}
        <TypingIndicator visible={typingUsersCount > 0} />
        <div ref={messagesEndRef} />
      </div>
      {/* Inline connection warning — above message input */}
      {wsStatus !== 'connected' && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-500/10 border-t border-amber-200 dark:border-amber-500/20 flex items-center gap-2.5 thai-text">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm text-amber-700 dark:text-amber-300 flex-1">
            {wsStatus === 'reconnecting'
              ? 'กำลังเชื่อมต่อใหม่...'
              : 'ขาดการเชื่อมต่อ — ข้อความจะถูกเก็บไว้ส่งภายหลัง'}
          </span>
          {(wsStatus === 'disconnected') && (
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              ลองใหม่
            </button>
          )}
        </div>
      )}
      <MessageInput
        inputText={inputText}
        sending={sending}
        isHumanMode={isHumanMode}
        showCannedPicker={showCannedPicker}
        soundEnabled={soundEnabled}
        onInputChange={setInputText}
        onSend={() => sendMessage(inputText)}
        onSendFile={sendMedia}
        onToggleCannedPicker={() => setShowCannedPicker(!showCannedPicker)}
        onSelectCanned={(content) => setInputText(content)}
        onCloseCanned={() => setShowCannedPicker(false)}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onTyping={() => {
          if (selectedId && wsStatus === 'connected') startTyping(selectedId);
        }}
      />
    </main>
  );
}
