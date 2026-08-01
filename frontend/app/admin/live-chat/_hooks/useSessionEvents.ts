'use client';

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';

import type {
  ConnectionState,
  PresencePayload,
  SessionTransferredPayload,
} from '@/lib/websocket/types';
import { useLiveChatStore } from '../_store/liveChatStore';
import { resolveOperatorName, removeKey } from './liveChatApi';
import { mapWsErrorToThai } from '../_lib/wsErrorMessages';

// Helper to get current store state without subscribing
const getStore = () => useLiveChatStore.getState();

interface UseSessionEventsDeps {
  fetchConversations: () => Promise<void>;
  wsStatusRef: RefObject<ConnectionState>;
  selectedIdRef: RefObject<string | null>;
  currentUserId: number;
}

/**
 * WS session-event handlers for the live-chat provider: connection status,
 * typing roster, claim/close/transfer broadcasts, presence, and error toasts.
 * All state writes go to the Zustand store (single source of truth); the
 * provider only passes the returned bundle to `useLiveChatSocket`.
 */
export function useSessionEvents({
  fetchConversations,
  wsStatusRef,
  selectedIdRef,
  currentUserId,
}: UseSessionEventsDeps) {
  const typingUsersRef = useRef<Set<string>>(new Set());

  // Stable identity so useLiveChatSocket's status effect only fires on an
  // actual connectionState change, not on every provider re-render. Reads the
  // previous status from wsStatusRef BEFORE writing the new one (the
  // wasOffline check), then syncs the ref inline — the store write below is
  // the only writer of wsStatus, so ref and store cannot drift.
  const onConnectionChange = useCallback((status: ConnectionState) => {
    const wasOffline = wsStatusRef.current !== 'connected';
    wsStatusRef.current = status;
    getStore().setWsStatus(status);
    if (status === 'connected') {
      getStore().setBackendOnline(true);
      if (wasOffline) {
        typingUsersRef.current = new Set();
        getStore().setTypingUsersCount(0);
        getStore().addNotification({
          title: 'เชื่อมต่อแล้ว',
          message: 'การเชื่อมต่อ WebSocket กู้คืนสำเร็จ',
          type: 'system',
          variant: 'success',
        });
      }
    }
  }, [wsStatusRef]);

  const onTyping = useCallback((lineUserId: string, adminId: string, isTyping: boolean) => {
    if (lineUserId !== selectedIdRef.current) return;
    const next = new Set(typingUsersRef.current);
    if (isTyping) next.add(adminId);
    else next.delete(adminId);
    typingUsersRef.current = next;
    getStore().setTypingUsersCount(next.size);
  }, [selectedIdRef]);

  const onSessionClaimed = useCallback((lineUserId: string, operatorId: number) => {
    getStore().setClaiming(false);
    const chat = getStore().currentChat;
    if (chat?.line_user_id === lineUserId) {
      getStore().setCurrentChat({
        ...chat,
        session: chat.session
          ? { ...chat.session, status: 'ACTIVE', operator_id: operatorId }
          : undefined,
      });
    }
    // Read presence at event time from the store — a closure copy could be
    // stale when the roster changed since this callback was created.
    const operatorName = resolveOperatorName(getStore().onlineOperators, operatorId);
    // Reflect (or clear) the contention lock for this room. When I am the
    // claimer the lock is mine — clear it so I am not shown a lock on my own
    // room; otherwise record who took it so other operators see it disabled.
    getStore().setClaimContenders((prev) =>
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
  }, [currentUserId, fetchConversations]);

  const onSessionClosed = useCallback((lineUserId: string) => {
    const chat = getStore().currentChat;
    if (chat?.line_user_id === lineUserId) {
      getStore().setCurrentChat({ ...chat, chat_mode: 'BOT', session: undefined });
    }
    getStore().setClaimContenders((prev) => removeKey(prev, lineUserId));
    fetchConversations();
  }, [fetchConversations]);

  const onSessionTransferred = useCallback((payload: SessionTransferredPayload) => {
    const chat = getStore().currentChat;
    if (chat?.line_user_id === payload.line_user_id) {
      getStore().setCurrentChat({
        ...chat,
        session: chat.session
          ? { ...chat.session, operator_id: payload.to_operator_id }
          : undefined,
      });
      fetchConversations();
    }
    getStore().setClaimContenders((prev) => removeKey(prev, payload.line_user_id));
    getStore().addNotification({
      title: 'Session Transferred',
      message: `Session transferred to operator #${payload.to_operator_id}`,
      type: 'system',
    });
  }, [fetchConversations]);

  const onPresenceUpdate = useCallback((operators: PresencePayload['operators']) => {
    getStore().setOnlineOperators(operators);
  }, []);

  const onError = useCallback((message: string) => {
    const normalized = (message || '').toLowerCase();
    const isClaimConflict =
      normalized.includes('already claimed') ||
      normalized.includes('session_not_found') ||
      normalized.includes('session not found');
    if (!isClaimConflict) {
      // Rate-limit errors are log-only: typing_start is throttled now, but a
      // burst of queued frames after a reconnect can still trip the limiter,
      // and a toast per frame would flood the screen.
      if (normalized.includes('rate limit')) {
        console.warn('Live chat WS rate limit hit:', message);
        return;
      }
      // Operators see Thai; keep the raw backend text in the console.
      console.warn('Live chat WS error:', message);
      getStore().addNotification({
        title: 'ไลฟ์แชทขัดข้อง',
        message: mapWsErrorToThai(message),
        type: 'system',
      });
      return;
    }
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
  }, []);

  const clearTyping = useCallback(() => {
    typingUsersRef.current = new Set();
    getStore().setTypingUsersCount(0);
  }, []);

  return {
    onConnectionChange,
    onTyping,
    clearTyping,
    onSessionClaimed,
    onSessionClosed,
    onSessionTransferred,
    onPresenceUpdate,
    onError,
  };
}
