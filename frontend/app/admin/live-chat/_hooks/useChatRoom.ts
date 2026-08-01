'use client';

import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';

import type { ConnectionState, Message } from '@/lib/websocket/types';
import { readErrorMessage } from '@/lib/api-error';
import { useLiveChatStore } from '../_store/liveChatStore';
import { API_BASE } from '../_lib/constants';

const getStore = () => useLiveChatStore.getState();

interface UseChatRoomParams {
  selectedId: string | null;
  wsStatus: ConnectionState;
  selectedIdRef: RefObject<string | null>;
  wsStatusRef: RefObject<ConnectionState>;
  fetchChatDetail: (id: string, includeMessages?: boolean) => Promise<void>;
  refreshConversationState: (lineUserId: string, includeMessages?: boolean) => Promise<void>;
  fetchMessagesPage: (id: string, beforeId?: number) => Promise<{ messages: Message[]; has_more: boolean }>;
  joinRoom: (lineUserId: string) => void;
  leaveRoom: () => void;
  wsClaimSession: () => void;
  wsCloseSession: () => void;
  wsTransferSession: (toOperatorId: number, reason?: string) => boolean;
  wsConnected: boolean;
}

/**
 * Owns room lifecycle + session actions for the live-chat console (Phase 8 /
 * Task 4): the join/leave, initial-load, and detail-poll effects, plus
 * claim / close / transfer / toggle-mode. WS send/receive is wired in the
 * provider (the composition seam); this hook receives the socket's action
 * functions and the data-fetch functions as params, so it stays unidirectional
 * — no behaviour change from the original provider methods.
 */
export function useChatRoom({
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
}: UseChatRoomParams) {
  // Load the selected conversation's detail + first message page on selection.
  useEffect(() => {
    if (!selectedId) return;
    getStore().setMessages([]);
    fetchChatDetail(selectedId, false).then(async () => {
      const page = await fetchMessagesPage(selectedId);
      if (selectedIdRef.current !== selectedId) return;
      const msgs = page.messages || [];
      getStore().setMessages(msgs);
      getStore().setHasMoreHistory(page.has_more);
      const unreadCount = getStore().initialUnreadCount;
      if (unreadCount > 0 && msgs.length > 0) {
        const firstUnread = msgs[Math.max(0, msgs.length - unreadCount)];
        getStore().setFirstUnreadMessageId(firstUnread?.id ?? null);
      } else {
        getStore().setFirstUnreadMessageId(null);
      }
    }).catch(() => undefined);
  }, [fetchChatDetail, fetchMessagesPage, selectedId, selectedIdRef]);

  // Join the room over WS while connected; leave on deselect / disconnect.
  useEffect(() => {
    if (!selectedId || wsStatus !== 'connected') return;
    joinRoom(selectedId);
    return () => leaveRoom();
  }, [joinRoom, leaveRoom, selectedId, wsStatus]);

  // Polling fallback for the open conversation when the socket is down.
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      if (wsStatusRef.current === 'connected') return;
      fetchChatDetail(selectedId, false);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchChatDetail, selectedId, wsStatusRef]);

  const claimSession = useCallback(async () => {
    const s = getStore();
    if (!s.selectedId || s.claiming) return;
    s.setClaiming(true);

    if (wsStatusRef.current === 'connected') {
      wsClaimSession();
      // Fallback: reset claiming if the WS confirmation never arrives.
      // onSessionClaimed / onError reset it on the happy / conflict paths.
      const claimTarget = s.selectedId;
      setTimeout(() => {
        const store = getStore();
        if (store.claiming && store.selectedId === claimTarget) {
          store.setClaiming(false);
        }
      }, 10000);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/claim`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to claim session'));
      }
      await refreshConversationState(s.selectedId, false);
    } catch (error) {
      getStore().addNotification({
        title: 'Claim unavailable',
        message: error instanceof Error && error.message ? error.message : 'Failed to claim session.',
        type: 'system',
      });
    } finally {
      getStore().setClaiming(false);
    }
  }, [refreshConversationState, wsClaimSession, wsStatusRef]);

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
  }, [refreshConversationState, wsCloseSession, wsStatusRef]);

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
  }, [refreshConversationState, wsConnected, wsTransferSession, wsStatusRef]);

  const toggleMode = useCallback(async (mode: 'BOT' | 'HUMAN') => {
    const s = getStore();
    if (!s.selectedId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/live-chat/conversations/${s.selectedId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to switch mode'));
      }
      await fetchChatDetail(s.selectedId, false);
    } catch (error) {
      getStore().addNotification({
        title: 'Mode switch failed',
        message: error instanceof Error && error.message ? error.message : 'Failed to switch chat mode.',
        type: 'system',
      });
    }
  }, [fetchChatDetail]);

  return { claimSession, closeSession, transferSession, toggleMode };
}
