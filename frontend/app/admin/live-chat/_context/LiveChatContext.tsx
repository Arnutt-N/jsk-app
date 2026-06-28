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
import type {
  ConnectionState,
  PresencePayload,
  SessionTransferredPayload,
} from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import type { Conversation } from '../_types';
import { resolveOperatorName, removeKey, formatTime } from '../_hooks/liveChatApi';
import { useMediaQuery } from '../_hooks/useMediaQuery';
import { useLiveChatActions } from '../_hooks/useLiveChatActions';
import { useConversationSync } from '../_hooks/useConversationSync';
import { useMessageFlow } from '../_hooks/useMessageFlow';
import { useChatRoom } from '../_hooks/useChatRoom';

interface ClaimContender {
  operatorId: number;
  name: string;
}

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

// Helper to get current store state without subscribing
const getStore = () => useLiveChatStore.getState();

export function LiveChatProvider({ children }: { children: React.ReactNode }) {
  // ── Zustand store ──
  const store = useLiveChatStore;

  // Subscribe only to the store slices still consumed by derived values
  // (selectedConversation, isHumanMode) and effects. All other UI fields
  // (inputText, sending, pickers, etc.) are read directly from the store by
  // the components that need them, so the provider does not re-render on them.
  const selectedId = store((s) => s.selectedId);
  const currentChat = store((s) => s.currentChat);

  const { user, token } = useAuth();
  const { playNotification, setEnabled } = useNotificationSound();

  const selectedIdRef = useRef<string | null>(null);
  const wsStatusRef = useRef<ConnectionState>('disconnected');
  const wsSendMessageRef = useRef<(text: string, tempId?: string) => void>(() => {});
  const typingUsersRef = useRef<Set<string>>(new Set());
  const [wsStatus, setWsStatus] = React.useState<ConnectionState>('disconnected');
  const isMobileView = useMediaQuery('(max-width: 767px)');
  const [typingUsersCount, setTypingUsersCount] = React.useState(0);
  // Multi-operator presence + claim contention (Phase 6).
  const [onlineOperators, setOnlineOperators] = React.useState<PresencePayload['operators']>([]);
  const [claimContenders, setClaimContenders] = React.useState<Record<string, ClaimContender>>({});

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

  useEffect(() => {
    wsStatusRef.current = wsStatus;
  }, [wsStatus]);

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
  });

  const handleSessionTransferred = useCallback((payload: SessionTransferredPayload) => {
    const chat = getStore().currentChat;
    if (chat?.line_user_id !== payload.line_user_id) return;
    getStore().setCurrentChat({
      ...chat,
      session: chat.session
        ? { ...chat.session, operator_id: payload.to_operator_id }
        : undefined,
    });
    fetchConversations();
  }, [fetchConversations]);

  const adminId = user?.id || '1';

  // Stable identity so useLiveChatSocket's status effect only fires on an
  // actual connectionState change, not on every provider re-render. Reads the
  // previous status from wsStatusRef so it needs no reactive deps (getStore is
  // module-level, setWsStatus and wsStatusRef are stable).
  const handleConnectionChange = useCallback((status: ConnectionState) => {
    const wasOffline = wsStatusRef.current !== 'connected';
    setWsStatus(status);
    if (status === 'connected') {
      getStore().setBackendOnline(true);
      if (wasOffline) {
        getStore().addNotification({
          title: 'Connected',
          message: 'WebSocket connection restored',
          type: 'system',
        });
      }
    }
  }, []);
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
    onTyping: (_lineUserId, admin, isTyping) => {
      const next = new Set(typingUsersRef.current);
      if (isTyping) next.add(admin);
      else next.delete(admin);
      typingUsersRef.current = next;
      setTypingUsersCount(next.size);
    },
    onSessionClaimed: (lineUserId, operatorId) => {
      const chat = getStore().currentChat;
      if (chat?.line_user_id === lineUserId) {
        getStore().setCurrentChat({
          ...chat,
          session: chat.session
            ? { ...chat.session, status: 'ACTIVE', operator_id: operatorId }
            : undefined,
        });
      }
      const operatorName = resolveOperatorName(onlineOperators, operatorId);
      // Reflect (or clear) the contention lock for this room. When I am the
      // claimer the lock is mine — clear it so I am not shown a lock on my own
      // room; otherwise record who took it so other operators see it disabled.
      setClaimContenders((prev) =>
        operatorId === currentUserId
          ? removeKey(prev, lineUserId)
          : { ...prev, [lineUserId]: { operatorId, name: operatorName } },
      );
      const roomName =
        chat?.line_user_id === lineUserId
          ? chat?.display_name
          : getStore().conversations.find((c) => c.line_user_id === lineUserId)?.display_name;
      getStore().addNotification({
        title: 'Session Claimed',
        message: roomName
          ? `${operatorName} รับเรื่อง '${roomName}' ไปแล้ว`
          : `${operatorName} รับเรื่องไปแล้ว`,
        type: 'system',
      });
      fetchConversations();
    },
    onSessionClosed: (lineUserId) => {
      const chat = getStore().currentChat;
      if (chat?.line_user_id === lineUserId) {
        getStore().setCurrentChat({ ...chat, chat_mode: 'BOT', session: undefined });
      }
      setClaimContenders((prev) => removeKey(prev, lineUserId));
      fetchConversations();
    },
    onSessionTransferred: (payload: SessionTransferredPayload) => {
      handleSessionTransferred(payload);
      setClaimContenders((prev) => removeKey(prev, payload.line_user_id));
      getStore().addNotification({
        title: 'Session Transferred',
        message: `Session transferred to operator #${payload.to_operator_id}`,
        type: 'system',
      });
    },
    onPresenceUpdate: (operators) => setOnlineOperators(operators),
    onError: (message) => {
      const normalized = (message || '').toLowerCase();
      const isClaimConflict =
        normalized.includes('already claimed') ||
        normalized.includes('session_not_found') ||
        normalized.includes('session not found');
      if (!isClaimConflict) return;
      // A claim lost the race on the backend — reset the local in-flight state
      // and surface an in-context toast that names the room when we know it.
      getStore().setClaiming(false);
      const roomName = getStore().currentChat?.display_name;
      getStore().addNotification({
        title: 'Claim unavailable',
        message: roomName
          ? `ไม่สามารถรับเรื่อง '${roomName}' ได้ — มีผู้อื่นรับไปแล้ว`
          : message || 'Session already claimed by another operator.',
        type: 'system',
      });
    },
    onConversationUpdate: handleConversationUpdate,
    onConnectionChange: handleConnectionChange,
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
