'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { ConnectionState, Message } from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import { API_BASE } from '../_lib/constants';
import { mapWsErrorToThai } from '../_lib/wsErrorMessages';

/**
 * Fail the optimistic message if the WS ack never arrives. Load-bearing magic
 * number preserved verbatim from the original provider (10s).
 */
const ACK_TIMEOUT_MS = 10000;

const getStore = () => useLiveChatStore.getState();

interface UseMessageFlowParams {
  /** Current selected room id (read-only here). Owned by the provider. */
  selectedIdRef: RefObject<string | null>;
  /** Live WS connection state (read-only here). Owned by the provider. */
  wsStatusRef: RefObject<ConnectionState>;
  /**
   * Bridge to the socket's `sendMessage`. The socket is created in the provider
   * AFTER this hook runs (it needs this hook's handlers), so the function is
   * injected via a ref the provider populates post-socket. `sendMessage` reads
   * `.current` at call-time (user action), well after mount — never null.
   */
  wsSendMessageRef: RefObject<(text: string, tempId?: string) => boolean>;
  playNotification: () => void;
  userDisplayName?: string;
  fetchChatDetail: (id: string, includeMessages?: boolean) => Promise<void>;
  fetchConversations: () => Promise<void>;
}

/**
 * Owns the message lifecycle for the live-chat console (Phase 8 / Task 3):
 * optimistic send + 10s ack-timeout fallback, media send, history paging, and
 * the inbound WS handlers (new / sent / ack / failed). Behaviour is identical to
 * the original provider methods — this is a mechanical extraction.
 */
export function useMessageFlow({
  selectedIdRef,
  wsStatusRef,
  wsSendMessageRef,
  playNotification,
  userDisplayName,
  fetchChatDetail,
  fetchConversations,
}: UseMessageFlowParams) {
  // Only message logic reads the latest messages list, so the ref lives here.
  // Pure ref-sync (no setState) keeps React-Compiler's set-state-in-effect happy.
  const messages = useLiveChatStore((s) => s.messages);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
  }, [playNotification, selectedIdRef]);

  const handleMessageSent = useCallback((message: Message) => {
    handleNewMessage(message);
    if (message.temp_id) handleMessageAck(message.temp_id);
    getStore().setSending(false);
    getStore().setInputText('');
  }, [handleMessageAck, handleNewMessage]);

  const handleMessageFailed = useCallback((tempId: string, error: string, retryable?: boolean) => {
    getStore().removePending(tempId);
    // Operators see Thai; the raw backend text goes to the console. A
    // retryable=false failure means the message already reached LINE — the UI
    // must not offer a retry that would duplicate it for the customer.
    console.warn('Live chat message failed:', error);
    getStore().setFailed(tempId, mapWsErrorToThai(error), retryable);
    getStore().setSending(false);
  }, []);

  const fetchMessagesPage = useCallback(async (id: string, beforeId?: number) => {
    const query = new URLSearchParams();
    query.set('limit', '50');
    if (beforeId) query.set('before_id', String(beforeId));
    const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${id}/messages?${query.toString()}`);
    if (!res.ok) throw new Error('failed to load messages');
    return res.json() as Promise<{ messages: Message[]; has_more: boolean }>;
  }, []);

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
      operator_name: userDisplayName || 'Admin',
      created_at: new Date().toISOString(),
      temp_id: tempId,
    };
    s.addMessage(optimistic);
    s.addPending(tempId);

    if (wsStatusRef.current === 'connected') {
      const dispatched = wsSendMessageRef.current(text, tempId);
      if (!dispatched) {
        // Fall through to the HTTP fallback below. The message stays pending
        // (spinner visible) until the fetch resolves — ack and catch both
        // clean it up.
      } else {
        // Fallback: fail the optimistic message if the WS ack never arrives.
        // Guard everything on THIS tempId still being pending — otherwise an
        // earlier message's timeout would clear the global `sending` flag (or
        // fail) a newer in-flight send that has already replaced it.
        setTimeout(() => {
          const store = getStore();
          if (store.pendingMessages.has(tempId)) {
            store.removePending(tempId);
            store.setFailed(tempId, 'หมดเวลารอการยืนยันข้อความ');
            if (store.sending) {
              store.setSending(false);
            }
          }
        }, ACK_TIMEOUT_MS);
        return;
      }
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
      getStore().setFailed(tempId, 'ส่งข้อความไม่สำเร็จ');
      getStore().removePending(tempId);
    } finally {
      getStore().setSending(false);
    }
  }, [fetchChatDetail, fetchConversations, handleMessageAck, userDisplayName, wsSendMessageRef, wsStatusRef]);

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

  return {
    sendMessage,
    sendMedia,
    loadOlderMessages,
    handleNewMessage,
    handleMessageSent,
    handleMessageAck,
    handleMessageFailed,
    fetchMessagesPage,
  };
}
