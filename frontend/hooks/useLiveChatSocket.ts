'use client';

import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useWebSocket } from './useWebSocket';
import {
  MessageType,
  ConnectionState,
  Message,
  ConversationUpdatePayload,
  TypingIndicatorPayload,
  SessionPayload,
  PresencePayload,
  ErrorPayload,
  MessageAckPayload,
  MessageFailedPayload,
  SessionTransferredPayload,
  WebSocketMessage
} from '@/lib/websocket/types';

interface UseLiveChatSocketOptions {
  adminId: string; // Required - must be provided from auth context
  token?: string;  // JWT token for authentication
  onNewMessage?: (message: Message) => void;
  onMessageSent?: (message: Message) => void;
  onMessageAck?: (tempId: string, messageId: number) => void;
  onMessageFailed?: (tempId: string, error: string) => void;
  onTyping?: (lineUserId: string, adminId: string, isTyping: boolean) => void;
  onSessionClaimed?: (lineUserId: string, operatorId: number) => void;
  onSessionClosed?: (lineUserId: string) => void;
  onSessionTransferred?: (data: SessionTransferredPayload) => void;
  onConversationUpdate?: (data: ConversationUpdatePayload) => void;
  onPresenceUpdate?: (operators: PresencePayload['operators']) => void;
  onOperatorJoined?: (adminId: string, roomId: string) => void;
  onOperatorLeft?: (adminId: string, roomId: string) => void;
  onError?: (error: string) => void;
  onConnectionChange?: (state: ConnectionState) => void;
}

interface UseLiveChatSocketReturn {
  status: ConnectionState;
  isConnected: boolean;
  joinRoom: (lineUserId: string) => void;
  leaveRoom: () => void;
  sendMessage: (text: string, tempId?: string) => void;
  retryMessage: (tempId: string) => void;
  startTyping: (lineUserId: string) => void;
  stopTyping: (lineUserId: string) => void;
  claimSession: () => void;
  closeSession: () => void;
  transferSession: (toOperatorId: number, reason?: string) => boolean;
  reconnect: () => void;
}

// Track pending messages for retry
interface PendingMessage {
  text: string;
  retries: number;
}

export function useLiveChatSocket(options: UseLiveChatSocketOptions): UseLiveChatSocketReturn {
  const {
    adminId,
    token,
    onNewMessage,
    onMessageSent,
    onMessageAck,
    onMessageFailed,
    onTyping,
    onSessionClaimed,
    onSessionClosed,
    onSessionTransferred,
    onConversationUpdate,
    onPresenceUpdate,
    onOperatorJoined,
    onOperatorLeft,
    onError,
    onConnectionChange,
  } = options;
  const currentRoom = useRef<string | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessages = useRef<Map<string, PendingMessage>>(new Map());

  // Determine WebSocket URL
  const wsUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/v1/ws/live-chat`;
  }, []);

  const handleMessage = useCallback((data: WebSocketMessage) => {
    switch (data.type) {
      case MessageType.NEW_MESSAGE:
        onNewMessage?.(data.payload as Message);
        break;
      case MessageType.MESSAGE_SENT:
        onMessageSent?.(data.payload as Message);
        break;
      case MessageType.MESSAGE_ACK:
        const ackPayload = data.payload as MessageAckPayload;
        // Clean up pending message on successful ACK
        pendingMessages.current.delete(ackPayload.temp_id);
        onMessageAck?.(ackPayload.temp_id, ackPayload.message_id);
        break;
      case MessageType.MESSAGE_FAILED:
        const failedPayload = data.payload as MessageFailedPayload;
        onMessageFailed?.(failedPayload.temp_id, failedPayload.error);
        break;
      case MessageType.TYPING_INDICATOR:
        const typingPayload = data.payload as TypingIndicatorPayload;
        onTyping?.(
          typingPayload.line_user_id,
          typingPayload.admin_id,
          typingPayload.is_typing
        );
        break;
      case MessageType.SESSION_CLAIMED:
        const sessionPayload = data.payload as SessionPayload;
        onSessionClaimed?.(
          sessionPayload.line_user_id,
          sessionPayload.operator_id || 0
        );
        break;
      case MessageType.SESSION_CLOSED:
        const closedPayload = data.payload as SessionPayload;
        onSessionClosed?.(closedPayload.line_user_id);
        break;
      case MessageType.SESSION_TRANSFERRED:
        onSessionTransferred?.(data.payload as SessionTransferredPayload);
        break;
      case MessageType.CONVERSATION_UPDATE:
        onConversationUpdate?.(data.payload as ConversationUpdatePayload);
        break;
      case MessageType.PRESENCE_UPDATE:
        const presencePayload = data.payload as PresencePayload;
        onPresenceUpdate?.(presencePayload.operators);
        break;
      case MessageType.OPERATOR_JOINED:
        const joinedPayload = data.payload as { admin_id: string; room_id: string };
        onOperatorJoined?.(joinedPayload.admin_id, joinedPayload.room_id);
        break;
      case MessageType.OPERATOR_LEFT:
        const leftPayload = data.payload as { admin_id: string; room_id: string };
        onOperatorLeft?.(leftPayload.admin_id, leftPayload.room_id);
        break;
      case MessageType.ERROR:
        const errorPayload = data.payload as ErrorPayload;
        onError?.(errorPayload.message);
        break;
    }
  }, [
    onConversationUpdate,
    onError,
    onMessageAck,
    onMessageFailed,
    onMessageSent,
    onNewMessage,
    onOperatorJoined,
    onOperatorLeft,
    onPresenceUpdate,
    onSessionClaimed,
    onSessionClosed,
    onSessionTransferred,
    onTyping,
  ]);

  const { send, connectionState, isConnected, reconnect } = useWebSocket({
    url: wsUrl,
    adminId, // Use admin ID from auth context
    token,   // JWT token for authentication
    onMessage: handleMessage,
    onConnect: () => onConnectionChange?.('connected'),
    onDisconnect: () => onConnectionChange?.('disconnected'),
  });

  // Notify parent of status changes
  useEffect(() => {
    onConnectionChange?.(connectionState);
  }, [connectionState, onConnectionChange]);

  const joinRoom = useCallback((lineUserId: string) => {
    currentRoom.current = lineUserId;
    send(MessageType.JOIN_ROOM, { line_user_id: lineUserId });
  }, [send]);

  const leaveRoom = useCallback(() => {
    if (currentRoom.current) {
      send(MessageType.LEAVE_ROOM, {});
      currentRoom.current = null;
    }
  }, [send]);

  const sendMessage = useCallback((text: string, tempId?: string) => {
    if (!currentRoom.current) {
      console.warn('Cannot send message: not in a room');
      return;
    }
    // Store message for potential retry
    if (tempId) {
      pendingMessages.current.set(tempId, { text, retries: 0 });
    }
    send(MessageType.SEND_MESSAGE, { text, temp_id: tempId });
  }, [send]);

  const retryMessage = useCallback((tempId: string) => {
    const pending = pendingMessages.current.get(tempId);
    if (pending && pending.retries < 3) {
      pendingMessages.current.set(tempId, { text: pending.text, retries: pending.retries + 1 });
      send(MessageType.SEND_MESSAGE, { text: pending.text, temp_id: tempId });
    }
  }, [send]);

  const startTyping = useCallback((lineUserId: string) => {
    send(MessageType.TYPING_START, { line_user_id: lineUserId });

    // Auto-stop typing after 3 seconds
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    typingTimeout.current = setTimeout(() => {
      send(MessageType.TYPING_STOP, { line_user_id: lineUserId });
    }, 3000);
  }, [send]);

  const stopTyping = useCallback((lineUserId: string) => {
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }
    send(MessageType.TYPING_STOP, { line_user_id: lineUserId });
  }, [send]);

  const claimSession = useCallback(() => {
    send(MessageType.CLAIM_SESSION, {});
  }, [send]);

  const closeSession = useCallback(() => {
    send(MessageType.CLOSE_SESSION, {});
  }, [send]);

  const transferSession = useCallback((toOperatorId: number, reason?: string) => {
    if (!currentRoom.current) {
      console.warn('Cannot transfer session: not in a room');
      return false;
    }
    return send(MessageType.TRANSFER_SESSION, { to_operator_id: toOperatorId, reason });
  }, [send]);

  // Cleanup on unmount
  useEffect(() => {
    const pendingMap = pendingMessages.current;
    return () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
      pendingMap.clear();
    };
  }, []);

  return {
    status: connectionState,
    isConnected,
    joinRoom,
    leaveRoom,
    sendMessage,
    retryMessage,
    startTyping,
    stopTyping,
    claimSession,
    closeSession,
    transferSession,
    reconnect,
  };
}
