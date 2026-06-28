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
  PresencePayload,
  SessionTransferredPayload,
} from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import type { Conversation, CurrentChat, Session } from '../_types';
import { API_BASE } from '../_lib/constants';
import { useMediaQuery } from '../_hooks/useMediaQuery';

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

/**
 * Move (or insert) the updated conversation to the top of the list in a single
 * pass, preserving the relative order of the remaining conversations. A
 * not-present id is simply prepended (matching the old "new conversation"
 * branch). Pure + immutable: returns a new array, never mutates the input.
 */
export function reorderConversationsToTop<T extends { line_user_id: string }>(list: T[], updated: T): T[] {
  const next: T[] = [updated];
  for (let i = 0; i < list.length; i++) {
    if (list[i].line_user_id !== updated.line_user_id) next.push(list[i]);
  }
  return next;
}

const mergeSession = (existing: Session | undefined, incoming?: Session): Session | undefined => {
  if (!incoming) return existing;
  return {
    id: incoming.id ?? existing?.id ?? 0,
    status: incoming.status ?? existing?.status ?? 'WAITING',
    started_at: incoming.started_at ?? existing?.started_at,
    operator_id: incoming.operator_id ?? existing?.operator_id,
  };
};

/**
 * Resolve an operator's human-readable name from the presence list, normalizing
 * the string presence id against the numeric operator id. Falls back to the
 * `Operator #id` convention shared with the backend payload.
 */
export const resolveOperatorName = (
  operators: PresencePayload['operators'],
  operatorId: number,
): string => {
  const match = operators.find((op) => Number(op.id) === operatorId);
  return match?.display_name || match?.name || `Operator #${operatorId}`;
};

/**
 * Immutably drop a key from a record. Returns the same reference when the key is
 * absent so React can bail out of a no-op state update.
 */
export const removeKey = <V,>(record: Record<string, V>, key: string): Record<string, V> => {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
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

  // Subscribe only to the store slices still consumed by derived values
  // (selectedConversation, isHumanMode) and effects. All other UI fields
  // (inputText, sending, pickers, etc.) are read directly from the store by
  // the components that need them, so the provider does not re-render on them.
  const conversations = store((s) => s.conversations);
  const selectedId = store((s) => s.selectedId);
  const currentChat = store((s) => s.currentChat);
  const messages = store((s) => s.messages);

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
  const isMobileView = useMediaQuery('(max-width: 767px)');
  const [typingUsersCount, setTypingUsersCount] = React.useState(0);
  const [focusedMessageId, setFocusedMessageId] = React.useState<number | null>(null);
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
      // Fire toast if not viewing this conversation. Resolve the customer's
      // display name from the live store snapshot (operator_name is wrong on an
      // INCOMING message); carry lineUserId so the toast can open the room.
      if (message.line_user_id !== selectedIdRef.current) {
        const customerName = getStore().conversations.find(
          (c) => c.line_user_id === message.line_user_id,
        )?.display_name;
        getStore().addNotification({
          title: customerName || 'ข้อความใหม่',
          message: message.content?.substring(0, 100) || 'New message received',
          avatar: undefined,
          type: 'message',
          lineUserId: message.line_user_id,
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
    getStore().setConversations(reorderConversationsToTop(getStore().conversations, updated));
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
      await Promise.all([fetchChatDetail(s.selectedId, true), fetchConversations()]);
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
      await Promise.all([fetchChatDetail(s.selectedId, true), fetchConversations()]);
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
    return d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
  }, []);

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
    formatTime,
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
