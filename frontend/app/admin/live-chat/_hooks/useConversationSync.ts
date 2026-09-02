'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useSearchParams } from 'next/navigation';

import type { ConnectionState, ConversationUpdatePayload } from '@/lib/websocket/types';
import type { CurrentChat } from '../_types';
import { useLiveChatStore } from '../_store/liveChatStore';
import { API_BASE } from '../_lib/constants';
import { mergeConversationUpdate, reorderConversationsToTop } from './liveChatApi';

const getStore = () => useLiveChatStore.getState();

interface UseConversationSyncParams {
  /** Current selected room id (read-only here). Owned by the provider. */
  selectedIdRef: RefObject<string | null>;
  /** Live WS connection state (read-only here). Owned by the provider. */
  wsStatusRef: RefObject<ConnectionState>;
}

/**
 * Owns conversation-list + detail synchronization for the live-chat console
 * (Phase 8 / Task 5): the list/detail fetches, the inbound `conversation_update`
 * handler, room selection (+ URL sync), focus/jump, the 5s polling fallback, the
 * deep-link initializer, and the derived `selectedConversation`. It is composed
 * first in the provider so `fetchChatDetail`/`fetchConversations` can be injected
 * down into useMessageFlow and useChatRoom (breaking the cross-hook cycle).
 * Behaviour is identical to the original provider methods — mechanical extraction.
 */
export function useConversationSync({ selectedIdRef, wsStatusRef }: UseConversationSyncParams) {
  const conversations = useLiveChatStore((s) => s.conversations);
  const selectedId = useLiveChatStore((s) => s.selectedId);
  const messages = useLiveChatStore((s) => s.messages);

  const searchParams = useSearchParams();
  const initializedRef = useRef<boolean>(false);
  const acknowledgedThroughRef = useRef<Record<string, string | undefined>>({});
  const messagesRef = useRef<typeof messages>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [focusedMessageId, setFocusedMessageId] = useState<number | null>(null);
  // Monotonic sequence for detail fetches: only the most recently issued call
  // may touch store state, so an older overlapping response that resolves
  // later is dropped instead of overwriting fresh data (review finding M8).
  const detailSeqRef = useRef(0);

  const fetchConversations = useCallback(async () => {
    const currentFilter = getStore().filterStatus;
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations${currentFilter ? `?status=${currentFilter}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        const fetched = data.conversations || data || [];
        getStore().setConversations(fetched);
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

  const markConversationRead = useCallback(async (lineUserId: string, readAt?: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${encodeURIComponent(lineUserId)}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(readAt ? { read_at: readAt } : {}),
      });
      if (!res.ok) return false;
      const response = (await res.json()) as { read_at?: string };
      const acknowledgedAt = response.read_at || readAt;
      const previousBoundary = acknowledgedThroughRef.current[lineUserId];
      if (
        acknowledgedAt
        && (!previousBoundary || Date.parse(acknowledgedAt) >= Date.parse(previousBoundary))
      ) {
        acknowledgedThroughRef.current[lineUserId] = acknowledgedAt;
      }

      const latestActivity = getStore().conversations.find(
        (conversation) => conversation.line_user_id === lineUserId,
      )?.last_user_activity_at;
      // A newer inbound message may arrive while this request is in flight.
      // Only clear the local badge when the successful acknowledgement covers
      // the latest activity still visible in the sidebar.
      if (!acknowledgedAt || !latestActivity || Date.parse(latestActivity) <= Date.parse(acknowledgedAt)) {
        getStore().markRead(lineUserId);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchChatDetail = useCallback(async (id: string, includeMessages = true) => {
    const seq = ++detailSeqRef.current;
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as CurrentChat;
      if (selectedIdRef.current !== id) return;
      if (seq !== detailSeqRef.current) return;
      getStore().setCurrentChat(data);
      if (includeMessages) {
        const nextMessages = data.messages || [];
        getStore().setMessages(nextMessages);
        getStore().setHasMoreHistory(nextMessages.length >= 50);
      }
      getStore().setBackendOnline(true);
    } catch {
      if (seq !== detailSeqRef.current) return;
      getStore().setBackendOnline(false);
    }
  }, [selectedIdRef]);

  const refreshConversationState = useCallback(async (lineUserId: string, includeMessages = false) => {
    await fetchChatDetail(lineUserId, includeMessages);
    await fetchConversations();
  }, [fetchChatDetail, fetchConversations]);

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
    } else {
      unread = idx === -1 ? 0 : (list[idx]?.unread_count || 0);
    }
    const acknowledgedThrough = acknowledgedThroughRef.current[data.line_user_id];
    if (
      acknowledgedThrough
      && data.last_user_activity_at
      && Date.parse(data.last_user_activity_at) <= Date.parse(acknowledgedThrough)
    ) {
      unread = 0;
    }
    const existingConversation = idx >= 0 ? list[idx] : null;
    // Prefer the SIDEBAR row as the merge base; fall back to `currentChat` only
    // when the room is not in the list yet (e.g. a `?chat=` deep link).
    // Basing the *selected* room on `currentChat` was the row-jump bug: the
    // JOIN_ROOM sync omits `last_message`, and so did the detail response that
    // fills `currentChat`, so the clicked row lost the very field the sidebar
    // sorts on and dropped to the bottom of the list.
    const baseChat = existingConversation
      ? ({ ...existingConversation, messages: undefined } as CurrentChat)
      : currentSelectedId === data.line_user_id
        ? getStore().currentChat
        : null;
    const updated = mergeConversationUpdate(
      baseChat,
      data,
      unread,
    );
    // Only reorder when the payload carries a new last_message (a real message
    // event). Updates without one (e.g. the JOIN_ROOM state sync) must not
    // change list position — otherwise clicking a user makes it jump.
    if (data.last_message) {
      getStore().setConversations(reorderConversationsToTop(getStore().conversations, updated));
    } else {
      const current = getStore().conversations;
      const pos = current.findIndex((c) => c.line_user_id === updated.line_user_id);
      if (pos >= 0) {
        const next = [...current];
        next[pos] = updated;
        getStore().setConversations(next);
      } else {
        getStore().setConversations([updated, ...current]);
      }
    }
    if (isSelected) {
      const updatedChat = mergeConversationUpdate(getStore().currentChat, data, unread);
      getStore().setCurrentChat(updatedChat);
      if (data.messages) {
        // Merge: preserve local optimistic messages still pending ack so they
        // don't flicker out and back in on every conversation_update event.
        const pending = getStore().pendingMessages;
        const optimisticMessages = messagesRef.current.filter(
          (m) => m.temp_id && pending.has(m.temp_id),
        );
        const serverIds = new Set(data.messages.map((m) => m.id));
        const survivingOptimistic = optimisticMessages.filter(
          (m) => !serverIds.has(m.id),
        );
        getStore().setMessages([...data.messages, ...survivingOptimistic]);
      }
    }
  }, [selectedIdRef]);

  const selectConversation = useCallback((id: string | null) => {
    getStore().selectChat(id);
    // Reset per-conversation transient state on switch (single atomic update).
    useLiveChatStore.setState({
      sending: false,
      inputText: '',
      showEmojiPicker: false,
      showStickerPicker: false,
      showQuickReplies: false,
      showTransferDialog: false,
      activeActionMenu: null,
      firstUnreadMessageId: null,
    });
    if (id) {
      window.history.replaceState(null, '', `/admin/live-chat?chat=${id}`);
      // L9.4 (unread divider): Capture the unread count before the room is
      // loaded. The badge is cleared only after an explicit read acknowledgement.
      const conv = getStore().conversations.find((c) => c.line_user_id === id);
      const unreadAtOpen = conv?.unread_count || 0;
      getStore().setInitialUnreadCount(unreadAtOpen);
    } else {
      window.history.replaceState(null, '', '/admin/live-chat');
      getStore().setCurrentChat(null);
      getStore().setMessages([]);
      getStore().setInitialUnreadCount(0);
    }
  }, []);

  const jumpToMessage = useCallback((lineUserId: string, messageId: number) => {
    setFocusedMessageId(messageId);
    selectConversation(lineUserId);
  }, [selectConversation]);

  const clearFocusedMessage = useCallback(() => {
    setFocusedMessageId(null);
  }, []);

  // Deep-link initializer: select the `?chat=` room once on first mount.
  useEffect(() => {
    if (!initializedRef.current) {
      const chatId = searchParams.get('chat');
      if (chatId) getStore().selectChat(chatId);
      initializedRef.current = true;
    }
  }, [searchParams]);

  // Initial fetch + 5s polling fallback for the conversation list while the
  // socket is down.
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => {
      if (wsStatusRef.current !== 'connected') fetchConversations();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations, wsStatusRef]);

  const selectedConversation = useMemo(() => (
    conversations.find((c) => c.line_user_id === selectedId) || null
  ), [conversations, selectedId]);

  return {
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
  };
}
