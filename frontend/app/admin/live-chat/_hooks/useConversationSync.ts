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

  const searchParams = useSearchParams();
  const initializedRef = useRef<boolean>(false);
  const [focusedMessageId, setFocusedMessageId] = useState<number | null>(null);

  const fetchConversations = useCallback(async () => {
    const currentFilter = getStore().filterStatus;
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations${currentFilter ? `?status=${currentFilter}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        const fetched = data.conversations || data || [];
        // L9.3 (unread fix): The backend may still return unread_count > 0 for
        // the currently-open conversation (mark_conversation_read is async and
        // the 5s polling may race ahead of it). Override to 0 locally so the
        // sidebar badge disappears immediately when the user is viewing it.
        const currentSelectedId = selectedIdRef.current;
        if (currentSelectedId) {
          const adjusted = fetched.map((c: { line_user_id: string; unread_count?: number }) =>
            c.line_user_id === currentSelectedId ? { ...c, unread_count: 0 } : c
          );
          getStore().setConversations(adjusted);
        } else {
          getStore().setConversations(fetched);
        }
        getStore().setBackendOnline(true);
      } else {
        getStore().setBackendOnline(false);
      }
    } catch {
      getStore().setBackendOnline(false);
    } finally {
      getStore().setLoading(false);
    }
  }, [selectedIdRef]);

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
    }
    // L9.3 (unread fix): If this conversation is currently selected (user is
    // viewing it), force unread=0 regardless of what the backend says. The
    // user is reading the messages in real-time, so they should not see a
    // red badge for a room they have open.
    if (isSelected) {
      unread = 0;
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
      const updatedChat = mergeConversationUpdate(getStore().currentChat, data, unread);
      getStore().setCurrentChat(updatedChat);
      if (data.messages) {
        getStore().setMessages(data.messages);
      }
    }
  }, [selectedIdRef]);

  const selectConversation = useCallback((id: string | null) => {
    getStore().selectChat(id);
    if (id) {
      window.history.replaceState(null, '', `/admin/live-chat?chat=${id}`);
      // L9.4 (unread divider): Capture the unread count BEFORE clearing it,
      // so ChatArea can render the UnreadDivider at the correct position.
      const conv = getStore().conversations.find((c) => c.line_user_id === id);
      const unreadAtOpen = conv?.unread_count || 0;
      getStore().initialUnreadCount = unreadAtOpen;
      const next = getStore().conversations.map((c) => (
        c.line_user_id === id ? { ...c, unread_count: 0 } : c
      ));
      getStore().setConversations(next);
    } else {
      window.history.replaceState(null, '', '/admin/live-chat');
      getStore().setCurrentChat(null);
      getStore().setMessages([]);
      getStore().initialUnreadCount = 0;
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
    refreshConversationState,
    handleConversationUpdate,
    selectConversation,
    jumpToMessage,
    clearFocusedMessage,
    focusedMessageId,
    selectedConversation,
  };
}
