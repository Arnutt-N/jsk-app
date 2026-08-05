'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useLiveChatSocket } from '@/hooks/useLiveChatSocket';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import type { ConnectionState, PresencePayload } from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import type { ClaimContender, Conversation } from '../_types';
import { formatTime } from '../_hooks/liveChatApi';
import { useMediaQuery } from '../_hooks/useMediaQuery';
import { useLiveChatActions } from '../_hooks/useLiveChatActions';
import { useConversationSync } from '../_hooks/useConversationSync';
import { useMessageFlow } from '../_hooks/useMessageFlow';
import { useChatRoom } from '../_hooks/useChatRoom';
import { useSessionEvents } from '../_hooks/useSessionEvents';

interface LiveChatContextValue {
  wsStatus: ConnectionState;
  isMobileView: boolean;
  typingUsersCount: number;
  focusedMessageId: number | null;
  isHumanMode: boolean;
  selectedConversation: Conversation | null;
  currentUserId: number;
  onlineOperators: PresencePayload['operators'];
  claimContenders: Record<string, ClaimContender>;
  getClaimContender: (lineUserId: string) => ClaimContender | undefined;
  setSearchQuery: (value: string) => void;
  setFilterStatus: (value: string | null) => void;
  setInputText: (value: string) => void;
  setShowCustomerPanel: (value: boolean) => void;
  setActiveActionMenu: (value: string | null) => void;
  setShowTransferDialog: (value: boolean) => void;
  setShowCannedPicker: (value: boolean) => void;
  setSoundEnabled: (value: boolean) => void;
  selectConversation: (id: string | null) => void;
  jumpToMessage: (lineUserId: string, messageId: number) => void;
  clearFocusedMessage: () => void;
  fetchConversations: () => Promise<void>;
  fetchChatDetail: (id: string, includeMessages?: boolean) => Promise<void>;
  markConversationRead: (id: string, readAt?: string) => Promise<boolean>;
  sendMessage: (text: string) => Promise<void>;
  sendMedia: (file: File) => Promise<void>;
  claimSession: () => Promise<void>;
  closeSession: () => Promise<void>;
  transferSession: (toOperatorId: number, reason?: string) => Promise<void>;
  toggleMode: (mode: 'BOT' | 'HUMAN') => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  reconnect: () => void;
  retryMessage: (tempId: string) => void;
  startTyping: (lineUserId: string) => void;
  formatTime: (value: string) => string;
}

const LiveChatContext = createContext<LiveChatContextValue | undefined>(undefined);

export function LiveChatProvider({ children }: { children: React.ReactNode }) {
  // ── Zustand store ──
  const store = useLiveChatStore;

  // Subscribe only to the store slices still consumed by derived values
  // (selectedConversation, isHumanMode) and effects, plus the WS session
  // fields exposed on the context value. All other UI fields (inputText,
  // sending, pickers, etc.) are read directly from the store by the
  // components that need them, so the provider does not re-render on them.
  const selectedId = store((s) => s.selectedId);
  const currentChat = store((s) => s.currentChat);
  const wsStatus = store((s) => s.wsStatus);
  const typingUsersCount = store((s) => s.typingUsersCount);
  const onlineOperators = store((s) => s.onlineOperators);
  const claimContenders = store((s) => s.claimContenders);

  const { user, token } = useAuth();
  const { playNotification, setEnabled } = useNotificationSound();

  const selectedIdRef = useRef<string | null>(null);
  const wsStatusRef = useRef<ConnectionState>('disconnected');
  const wsSendMessageRef = useRef<(text: string, tempId?: string) => boolean>(() => false);
  const isMobileView = useMediaQuery('(max-width: 767px)');

  // AuthContext stores `user.id` as a string; operator ids on sessions/presence
  // are numeric. Normalize once so every comparison stays numeric.
  const currentUserId = Number(user?.id ?? 0);

  const getClaimContender = useCallback(
    (lineUserId: string): ClaimContender | undefined => claimContenders[lineUserId],
    [claimContenders],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Reset per-session transient state on unmount (navigation away).
  useEffect(() => {
    return () => {
      useLiveChatStore.getState().resetTransient();
    };
  }, []);

  // ── Stable store-delegating setters (exposed on the context value) ──
  const {
    setSearchQuery,
    setFilterStatus,
    setInputText,
    setShowCustomerPanel,
    setActiveActionMenu,
    setShowTransferDialog,
    setShowCannedPicker,
    setSoundEnabled,
  } = useLiveChatActions(setEnabled);

  // ── Conversation sync (list + detail + selection + polling) ──
  const {
    fetchConversations,
    fetchChatDetail,
    markConversationRead,
    refreshConversationState,
    handleConversationUpdate,
    selectConversation,
    jumpToMessage,
    clearFocusedMessage,
    focusedMessageId,
    selectedConversation,
  } = useConversationSync({ selectedIdRef, wsStatusRef });

  const {
    sendMessage,
    sendMedia,
    loadOlderMessages,
    handleNewMessage,
    handleMessageSent,
    handleMessageAck,
    handleMessageFailed,
    fetchMessagesPage,
  } = useMessageFlow({
    selectedIdRef,
    wsStatusRef,
    wsSendMessageRef,
    playNotification,
    userDisplayName: user?.display_name,
    fetchChatDetail,
    fetchConversations,
    markConversationRead,
  });

  // ── WS session-event handlers (status, typing, claim/close/transfer,
  // presence, errors) — write to the store, single source of truth ──
  const {
    clearTyping,
    onTyping,
    onSessionClaimed,
    onSessionClosed,
    onSessionTransferred,
    onPresenceUpdate,
    onError,
    onConnectionChange,
  } = useSessionEvents({ fetchConversations, fetchChatDetail, wsStatusRef, selectedIdRef, currentUserId });

  // Clear typing indicators when switching rooms.
  useEffect(() => {
    clearTyping();
  }, [selectedId, clearTyping]);

  const adminId = user?.id || '1';
  const {
    joinRoom,
    leaveRoom,
    sendMessage: wsSendMessage,
    startTyping,
    claimSession: wsClaimSession,
    closeSession: wsCloseSession,
    transferSession: wsTransferSession,
    isConnected: wsConnected,
    reconnect,
    retryMessage,
  } = useLiveChatSocket({
    adminId,
    token: token ?? undefined,
    onNewMessage: handleNewMessage,
    onMessageSent: handleMessageSent,
    onMessageAck: (tempId) => handleMessageAck(tempId),
    onMessageFailed: handleMessageFailed,
    onTyping,
    onSessionClaimed,
    onSessionClosed,
    onSessionTransferred,
    onPresenceUpdate,
    onError,
    onConversationUpdate: handleConversationUpdate,
    onConnectionChange,
  });

  // Bridge the socket's sendMessage into useMessageFlow, which is composed
  // before the socket exists (it supplies the socket's message handlers).
  // Pure ref-sync; sendMessage reads `.current` at call time, after mount.
  useEffect(() => {
    wsSendMessageRef.current = wsSendMessage;
  }, [wsSendMessage]);

  const { claimSession, closeSession, transferSession, toggleMode } = useChatRoom({
    selectedId,
    wsStatus,
    selectedIdRef,
    wsStatusRef,
    fetchChatDetail,
    markConversationRead,
    refreshConversationState,
    fetchMessagesPage,
    joinRoom,
    leaveRoom,
    wsClaimSession,
    wsCloseSession,
    wsTransferSession,
    wsConnected,
  });

  const isHumanMode = currentChat?.chat_mode === 'HUMAN';

  // Memoize the context value so consumers only re-render when one of the
  // exposed derived values or callbacks actually changes identity. Without
  // this, a fresh object literal each render forces every consumer to
  // re-render even when nothing it reads has changed.
  const value = useMemo<LiveChatContextValue>(() => ({
    wsStatus,
    isMobileView,
    typingUsersCount,
    focusedMessageId,
    isHumanMode,
    selectedConversation,
    currentUserId,
    onlineOperators,
    claimContenders,
    getClaimContender,
    setSearchQuery,
    setFilterStatus,
    setInputText,
    setShowCustomerPanel,
    setActiveActionMenu,
    setShowTransferDialog,
    setShowCannedPicker,
    setSoundEnabled,
    selectConversation,
    jumpToMessage,
    clearFocusedMessage,
    fetchConversations,
    fetchChatDetail,
    markConversationRead,
    sendMessage,
    sendMedia,
    claimSession,
    closeSession,
    transferSession,
    toggleMode,
    loadOlderMessages,
    reconnect,
    retryMessage,
    startTyping,
    formatTime,
  }), [
    wsStatus,
    isMobileView,
    typingUsersCount,
    focusedMessageId,
    isHumanMode,
    selectedConversation,
    currentUserId,
    onlineOperators,
    claimContenders,
    getClaimContender,
    setSearchQuery,
    setFilterStatus,
    setInputText,
    setShowCustomerPanel,
    setActiveActionMenu,
    setShowTransferDialog,
    setShowCannedPicker,
    setSoundEnabled,
    selectConversation,
    jumpToMessage,
    clearFocusedMessage,
    fetchConversations,
    fetchChatDetail,
    markConversationRead,
    sendMessage,
    sendMedia,
    claimSession,
    closeSession,
    transferSession,
    toggleMode,
    loadOlderMessages,
    reconnect,
    retryMessage,
    startTyping,
  ]);

  return <LiveChatContext.Provider value={value}>{children}</LiveChatContext.Provider>;
}

export function useLiveChatContext() {
  const context = useContext(LiveChatContext);
  if (!context) {
    throw new Error('useLiveChatContext must be used within LiveChatProvider');
  }
  return context;
}
