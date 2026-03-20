'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useSearchParams } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';
import { useLiveChatSocket } from '@/hooks/useLiveChatSocket';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import type {
  ConnectionState,
  ConversationUpdatePayload,
  Message,
  SessionTransferredPayload,
} from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import type { Conversation, CurrentChat, Session } from '../_types';

// State shape exposed via context (matches Zustand store)
interface ChatState {
  conversations: Conversation[];
  selectedId: string | null;
  currentChat: CurrentChat | null;
  messages: Message[];
  loading: boolean;
  backendOnline: boolean;
  filterStatus: string | null;
  searchQuery: string;
  inputText: string;
  sending: boolean;
  claiming: boolean;
  showCustomerPanel: boolean;
  activeActionMenu: string | null;
  showTransferDialog: boolean;
  showCannedPicker: boolean;
  soundEnabled: boolean;
  pendingMessages: Set<string>;
  failedMessages: Map<string, string>;
  hasMoreHistory: boolean;
  isLoadingHistory: boolean;
}

interface LiveChatContextValue {
  state: ChatState;
  wsStatus: ConnectionState;
  isMobileView: boolean;
  typingUsersCount: number;
  focusedMessageId: number | null;
  isHumanMode: boolean;
  selectedConversation: Conversation | null;
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
const API_BASE = '/api/v1';

// Helper to get current store state without subscribing
const getStore = () => useLiveChatStore.getState();

const mergeSession = (existing: Session | undefined, incoming?: Session): Session | undefined => {
  if (!incoming) return existing;
  return {
    id: incoming.id ?? existing?.id ?? 0,
    status: incoming.status ?? existing?.status ?? 'WAITING',
    started_at: incoming.started_at ?? existing?.started_at,
    operator_id: incoming.operator_id ?? existing?.operator_id,
  };
};

const mergeConversationUpdate = (
  existing: CurrentChat | null,
  data: ConversationUpdatePayload,
  unreadCount: number,
): CurrentChat => ({
  line_user_id: data.line_user_id,
  display_name: data.display_name ?? existing?.display_name ?? '',
  picture_url: data.picture_url ?? existing?.picture_url ?? '',
  friend_status: existing?.friend_status ?? 'ACTIVE',
  chat_mode: data.chat_mode ?? existing?.chat_mode ?? 'BOT',
  session: mergeSession(existing?.session, data.session),
  last_message: data.last_message ?? existing?.last_message,
  unread_count: unreadCount,
  tags: data.tags ?? existing?.tags,
  messages: data.messages ?? existing?.messages,
});

const readErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail;
      if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
      if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    } catch {
      // Fall through to text parsing and the default fallback.
    }
  }

  try {
    const text = (await response.text()).trim();
    if (text) return text;
  } catch {
    // Ignore body parsing errors and use the fallback message.
  }

  return fallbackMessage;
};

export function LiveChatProvider({ children }: { children: React.ReactNode }) {
  // ── Zustand store ──
  const store = useLiveChatStore;

  // Subscribe to state slices needed for Context compatibility & effects
  const conversations = store((s) => s.conversations);
  const selectedId = store((s) => s.selectedId);
  const currentChat = store((s) => s.currentChat);
  const messages = store((s) => s.messages);
  const loading = store((s) => s.loading);
  const backendOnline = store((s) => s.backendOnline);
  const filterStatus = store((s) => s.filterStatus);
  const searchQuery = store((s) => s.searchQuery);
  const inputText = store((s) => s.inputText);
  const sending = store((s) => s.sending);
  const claiming = store((s) => s.claiming);
  const showCustomerPanel = store((s) => s.showCustomerPanel);
  const activeActionMenu = store((s) => s.activeActionMenu);
  const showTransferDialog = store((s) => s.showTransferDialog);
  const showCannedPicker = store((s) => s.showCannedPicker);
  const soundEnabled = store((s) => s.soundEnabled);
  const pendingMessages = store((s) => s.pendingMessages);
  const failedMessages = store((s) => s.failedMessages);
  const hasMoreHistory = store((s) => s.hasMoreHistory);
  const isLoadingHistory = store((s) => s.isLoadingHistory);

  const { user, token } = useAuth();
  const searchParams = useSearchParams();
  const { playNotification, setEnabled } = useNotificationSound();

  const selectedIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const wsStatusRef = useRef<ConnectionState>('disconnected');
  const firstLoadRef = useRef<boolean>(true);
  const initializedRef = useRef<boolean>(false);
  const typingUsersRef = useRef<Set<string>>(new Set());
  const [wsStatus, setWsStatus] = React.useState<ConnectionState>('disconnected');
  const [isMobileView, setIsMobileView] = React.useState(false);
  const [typingUsersCount, setTypingUsersCount] = React.useState(0);
  const [focusedMessageId, setFocusedMessageId] = React.useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileView(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    messagesRef.current = messages;
  }, [selectedId, messages]);

  useEffect(() => {
    wsStatusRef.current = wsStatus;
  }, [wsStatus]);

  // ── Simple state setters (delegate to store) ──
  const setSearchQuery = useCallback((value: string) => {
    getStore().setSearchQuery(value);
  }, []);

  const setFilterStatus = useCallback((value: string | null) => {
    getStore().setFilterStatus(value);
  }, []);

  const setInputText = useCallback((value: string) => {
    getStore().setInputText(value);
  }, []);

  const setShowCustomerPanel = useCallback((value: boolean) => {
    getStore().setShowCustomerPanel(value);
  }, []);

  const setActiveActionMenu = useCallback((value: string | null) => {
    getStore().setActiveActionMenu(value);
  }, []);

  const setShowTransferDialog = useCallback((value: boolean) => {
    getStore().setShowTransferDialog(value);
  }, []);

  const setShowCannedPicker = useCallback((value: boolean) => {
    getStore().setShowCannedPicker(value);
  }, []);

  const setSoundEnabled = useCallback((value: boolean) => {
    getStore().setSoundEnabled(value);
    setEnabled(value);
  }, [setEnabled]);

  // ── API methods ──
  const fetchConversations = useCallback(async () => {
    const currentFilter = getStore().filterStatus;
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations${currentFilter ? `?status=${currentFilter}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        getStore().setConversations(data.conversations || data || []);
        getStore().setBackendOnline(true);
      } else {
        getStore().setBackendOnline(false);
      }
    } catch {
      getStore().setBackendOnline(false);
    } finally {
      getStore().setLoading(false);
    }
  }, []);

  const fetchChatDetail = useCallback(async (id: string, includeMessages = true) => {
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as CurrentChat;
      if (selectedIdRef.current !== id) return;
      getStore().setCurrentChat(data);
      if (includeMessages) {
        const nextMessages = data.messages || [];
        getStore().setMessages(nextMessages);
        getStore().setHasMoreHistory(nextMessages.length >= 50);
      }
      getStore().setBackendOnline(true);
    } catch {
      getStore().setBackendOnline(false);
    }
  }, []);

  const refreshConversationState = useCallback(async (lineUserId: string, includeMessages = false) => {
    await fetchChatDetail(lineUserId, includeMessages);
    await fetchConversations();
  }, [fetchChatDetail, fetchConversations]);

  const fetchMessagesPage = useCallback(async (id: string, beforeId?: number) => {
    const query = new URLSearchParams();
    query.set('limit', '50');
    if (beforeId) query.set('before_id', String(beforeId));
    const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${id}/messages?${query.toString()}`);
    if (!res.ok) throw new Error('failed to load messages');
    return res.json() as Promise<{ messages: Message[]; has_more: boolean }>;
  }, []);

  const handleMessageAck = useCallback((tempId: string) => {
    getStore().removePending(tempId);
    getStore().clearFailed(tempId);
  }, []);

  const handleNewMessage = useCallback((message: Message) => {
    if (message.direction === 'INCOMING') {
      playNotification();
      // Fire toast if not viewing this conversation
      if (message.line_user_id !== selectedIdRef.current) {
        getStore().addNotification({
          title: message.operator_name || 'New Message',
          message: message.content?.substring(0, 100) || 'New message received',
          avatar: undefined,
          type: 'message',
        });
      }
    }
    if (message.line_user_id !== selectedIdRef.current) return;
    const currentMessages = messagesRef.current;
    const exists = currentMessages.some((m) => m.id === message.id || (message.temp_id && m.temp_id === message.temp_id));
    if (exists) {
      const next = currentMessages.map((m) => ((m.temp_id && m.temp_id === message.temp_id) ? message : m));
      getStore().setMessages(next);
      return;
    }
    getStore().addMessage(message);
  }, [playNotification]);

  const handleMessageSent = useCallback((message: Message) => {
    handleNewMessage(message);
    if (message.temp_id) handleMessageAck(message.temp_id);
    getStore().setSending(false);
    getStore().setInputText('');
  }, [handleMessageAck, handleNewMessage]);

  const handleConversationUpdate = useCallback((data: ConversationUpdatePayload) => {
    const currentSelectedId = selectedIdRef.current;
    const isSelected = currentSelectedId === data.line_user_id;
    const list = [...getStore().conversations];
    const idx = list.findIndex((c) => c.line_user_id === data.line_user_id);
    let unread = 0;
    if (typeof data.unread_count === 'number') {
      unread = data.unread_count;
    } else if (!isSelected) {
      unread = idx === -1 ? 1 : (list[idx]?.unread_count || 0) + 1;
    }
    const existingConversation = idx >= 0 ? list[idx] : null;
    const baseChat = currentSelectedId === data.line_user_id
      ? getStore().currentChat
      : existingConversation
        ? ({ ...existingConversation, messages: undefined } as CurrentChat)
        : null;
    const updated = mergeConversationUpdate(
      baseChat,
      data,
      unread,
    );
    if (idx === -1) {
      getStore().setConversations([updated, ...list]);
    } else {
      list.splice(idx, 1);
      getStore().setConversations([updated, ...list]);
    }
    if (isSelected) {
      const currentChat = mergeConversationUpdate(getStore().currentChat, data, unread);
      getStore().setCurrentChat(currentChat);
      if (data.messages) {
        getStore().setMessages(data.messages);
      }
    }
  }, []);

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
    onMessageFailed: (tempId, error) => {
      getStore().removePending(tempId);
      getStore().setFailed(tempId, error);
      getStore().setSending(false);
    },
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
      getStore().addNotification({
        title: 'Session Claimed',
        message: `Operator #${operatorId} claimed a session`,
        type: 'system',
      });
      fetchConversations();
    },
    onSessionClosed: (lineUserId) => {
      const chat = getStore().currentChat;
      if (chat?.line_user_id === lineUserId) {
        getStore().setCurrentChat({ ...chat, chat_mode: 'BOT', session: undefined });
      }
      fetchConversations();
    },
    onSessionTransferred: (payload: SessionTransferredPayload) => {
      handleSessionTransferred(payload);
      getStore().addNotification({
        title: 'Session Transferred',
        message: `Session transferred to operator #${payload.to_operator_id}`,
        type: 'system',
      });
    },
    onConversationUpdate: handleConversationUpdate,
    onConnectionChange: (status) => {
      const wasOffline = wsStatus !== 'connected';
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
    },
  });

  const selectConversation = useCallback((id: string | null) => {
    getStore().selectChat(id);
    if (id) {
      window.history.replaceState(null, '', `/admin/live-chat?chat=${id}`);
      const next = getStore().conversations.map((c) => (
        c.line_user_id === id ? { ...c, unread_count: 0 } : c
      ));
      getStore().setConversations(next);
    } else {
      window.history.replaceState(null, '', '/admin/live-chat');
      getStore().setCurrentChat(null);
      getStore().setMessages([]);
    }
  }, []);

  const jumpToMessage = useCallback((lineUserId: string, messageId: number) => {
    setFocusedMessageId(messageId);
    selectConversation(lineUserId);
  }, [selectConversation]);

  const clearFocusedMessage = useCallback(() => {
    setFocusedMessageId(null);
  }, []);

  useEffect(() => {
    if (!initializedRef.current) {
      const chatId = searchParams.get('chat');
      if (chatId) getStore().selectChat(chatId);
      initializedRef.current = true;
    }
  }, [searchParams]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => {
      if (wsStatusRef.current !== 'connected') fetchConversations();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    getStore().setMessages([]);
    firstLoadRef.current = true;
    fetchChatDetail(selectedId, false).then(async () => {
      const page = await fetchMessagesPage(selectedId);
      if (selectedIdRef.current !== selectedId) return;
      getStore().setMessages(page.messages || []);
      getStore().setHasMoreHistory(page.has_more);
    }).catch(() => undefined);
  }, [fetchChatDetail, fetchMessagesPage, selectedId]);

  useEffect(() => {
    if (!selectedId || wsStatus !== 'connected') return;
    joinRoom(selectedId);
    return () => leaveRoom();
  }, [joinRoom, leaveRoom, selectedId, wsStatus]);

  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      if (wsStatusRef.current === 'connected') return;
      fetchChatDetail(selectedId, false);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchChatDetail, selectedId]);

  const sendMessage = useCallback(async (text: string) => {
    const s = getStore();
    if (!s.selectedId || !text.trim() || s.sending) return;
    s.setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: 0,
      line_user_id: s.selectedId,
      direction: 'OUTGOING',
      content: text,
      message_type: 'text',
      sender_role: 'ADMIN',
      operator_name: user?.display_name || 'Admin',
      created_at: new Date().toISOString(),
      temp_id: tempId,
    };
    s.addMessage(optimistic);
    s.addPending(tempId);

    if (wsStatusRef.current === 'connected') {
      wsSendMessage(text, tempId);
      // Fallback: fail the optimistic message if the WS ack never arrives.
      setTimeout(() => {
        const store = getStore();
        if (store.pendingMessages.has(tempId)) {
          store.removePending(tempId);
          store.setFailed(tempId, 'Message acknowledgment timed out');
        }
        if (store.sending) {
          store.setSending(false);
        }
      }, 10000);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('send failed');
      await fetchChatDetail(s.selectedId, true);
      await fetchConversations();
      handleMessageAck(tempId);
      getStore().setInputText('');
    } catch {
      getStore().setFailed(tempId, 'Failed to send');
      getStore().removePending(tempId);
    } finally {
      getStore().setSending(false);
    }
  }, [fetchChatDetail, fetchConversations, handleMessageAck, user?.display_name, wsSendMessage]);

  const sendMedia = useCallback(async (file: File) => {
    const s = getStore();
    if (!s.selectedId || s.sending) return;
    s.setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/media`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('media send failed');
      await fetchChatDetail(s.selectedId, true);
      await fetchConversations();
    } catch {
      getStore().setBackendOnline(false);
    } finally {
      getStore().setSending(false);
    }
  }, [fetchChatDetail, fetchConversations]);

  const claimSession = useCallback(async () => {
    const s = getStore();
    if (!s.selectedId || s.claiming) return;
    s.setClaiming(true);
    try {
      if (wsStatusRef.current === 'connected') {
        wsClaimSession();
      } else {
        const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/claim`, { method: 'POST' });
        if (!res.ok) {
          throw new Error(await readErrorMessage(res, 'Failed to claim session'));
        }
        await refreshConversationState(s.selectedId, false);
      }
    } catch (error) {
      getStore().addNotification({
        title: 'Claim unavailable',
        message: error instanceof Error && error.message ? error.message : 'Failed to claim session.',
        type: 'system',
      });
    } finally {
      getStore().setClaiming(false);
    }
  }, [refreshConversationState, wsClaimSession]);

  const closeSession = useCallback(async () => {
    const s = getStore();
    if (!s.selectedId) return;
    if (wsStatusRef.current === 'connected') {
      wsCloseSession();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/close`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to close session'));
      }
      await refreshConversationState(s.selectedId, false);
    } catch (error) {
      getStore().addNotification({
        title: 'Close unavailable',
        message: error instanceof Error && error.message ? error.message : 'Failed to close session.',
        type: 'system',
      });
    }
  }, [refreshConversationState, wsCloseSession]);

  const transferSession = useCallback(async (toOperatorId: number, reason?: string) => {
    const s = getStore();
    if (!s.selectedId) return;
    const lineUserId = s.selectedId;
    const canUseSocket = wsConnected && wsStatusRef.current === 'connected';

    if (canUseSocket) {
      const dispatched = wsTransferSession(toOperatorId, reason);
      if (dispatched) {
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${encodeURIComponent(lineUserId)}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_operator_id: toOperatorId,
          reason,
        }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to transfer session'));
      }

      await refreshConversationState(lineUserId, false);
      getStore().addNotification({
        title: 'Session Transferred',
        message: `Session transferred to operator #${toOperatorId}.`,
        type: 'system',
      });
    } catch (error) {
      getStore().addNotification({
        title: 'Transfer unavailable',
        message: error instanceof Error && error.message
          ? error.message
          : canUseSocket
            ? 'Transfer could not be completed. Please try again.'
            : 'Transfer requires an active WebSocket connection or a reachable backend endpoint.',
        type: 'system',
      });
    }
  }, [refreshConversationState, wsConnected, wsTransferSession]);

  const toggleMode = useCallback(async (mode: 'BOT' | 'HUMAN') => {
    const s = getStore();
    if (!s.selectedId) return;
    const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (res.ok) await fetchChatDetail(s.selectedId, false);
  }, [fetchChatDetail]);

  const loadOlderMessages = useCallback(async () => {
    const s = getStore();
    if (!s.selectedId || s.isLoadingHistory || !s.hasMoreHistory) return;
    const current = messagesRef.current;
    const oldest = current[0];
    if (!oldest?.id) {
      s.setHasMoreHistory(false);
      return;
    }
    s.setIsLoadingHistory(true);
    try {
      const page = await fetchMessagesPage(s.selectedId, oldest.id);
      getStore().prependMessages(page.messages || []);
      getStore().setHasMoreHistory(page.has_more);
    } finally {
      getStore().setIsLoadingHistory(false);
    }
  }, [fetchMessagesPage]);

  const selectedConversation = useMemo(() => (
    conversations.find((c) => c.line_user_id === selectedId) || null
  ), [conversations, selectedId]);

  const isHumanMode = currentChat?.chat_mode === 'HUMAN';

  const formatTime = useCallback((value: string) => {
    const d = new Date(value);
    const now = new Date();
    const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    if (hours < 48) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  // Build state object from Zustand subscriptions for backward compat
  const state: ChatState = useMemo(() => ({
    conversations,
    selectedId,
    currentChat,
    messages,
    loading,
    backendOnline,
    filterStatus,
    searchQuery,
    inputText,
    sending,
    claiming,
    showCustomerPanel,
    activeActionMenu,
    showTransferDialog,
    showCannedPicker,
    soundEnabled,
    pendingMessages,
    failedMessages,
    hasMoreHistory,
    isLoadingHistory,
  }), [
    conversations, selectedId, currentChat, messages, loading, backendOnline,
    filterStatus, searchQuery, inputText, sending, claiming, showCustomerPanel,
    activeActionMenu, showTransferDialog, showCannedPicker, soundEnabled,
    pendingMessages, failedMessages, hasMoreHistory, isLoadingHistory,
  ]);

  const value: LiveChatContextValue = {
    state,
    wsStatus,
    isMobileView,
    typingUsersCount,
    focusedMessageId,
    isHumanMode,
    selectedConversation,
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
  };

  return <LiveChatContext.Provider value={value}>{children}</LiveChatContext.Provider>;
}

export function useLiveChatContext() {
  const context = useContext(LiveChatContext);
  if (!context) {
    throw new Error('useLiveChatContext must be used within LiveChatProvider');
  }
  return context;
}
