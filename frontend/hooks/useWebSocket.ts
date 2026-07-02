'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebSocketClient } from '@/lib/websocket/client';
import {
  MessageType,
  ConnectionState,
  UseWebSocketOptions,
  UseWebSocketReturn
} from '@/lib/websocket/types';

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    adminId,
    token,
    onConnect,
    onDisconnect,
    onMessage,
    onError,
  } = options;
  const clientRef = useRef<WebSocketClient | null>(null);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  // Always send the real JWT to the WebSocket. Dev mode previously forced the
  // token to undefined, assuming a backend dev-bypass — but authenticate_ws_user
  // (ws_live_chat.py) has NO bypass and always requires a valid access token, so
  // stripping it made every dev-mode WS handshake fail with auth_failed (the live
  // socket silently stayed disconnected). Real logins — including the e2e — carry
  // a token; pure dev_bypass sessions have none and simply won't open a socket,
  // which is acceptable. effectiveToken stays in the effect deps below so the
  // client reconnects once AuthContext hydrates the token from localStorage.
  const effectiveToken = token;

  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
  }, [onConnect, onDisconnect, onMessage, onError]);

  useEffect(() => {
    const client = new WebSocketClient({
      url,
      adminId,
      token: effectiveToken,
      onStateChange: (state) => {
        setConnectionState(state);
        if (client) {
          setReconnectAttempts(client.getReconnectAttempt());
        }
      },
      onConnect: () => {
        setReconnectAttempts(0);
        onConnectRef.current?.();
      },
      onDisconnect: () => onDisconnectRef.current?.(),
      onMessage: (message) => onMessageRef.current?.(message),
      onError: (error) => onErrorRef.current?.(error),
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [adminId, effectiveToken, url]);

  const send = useCallback((type: MessageType, payload: unknown, options?: { queue?: boolean }) => {
    return clientRef.current?.send(type, payload, options) ?? false;
  }, []);

  const reconnect = useCallback(() => {
    clientRef.current?.reconnect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  return {
    send,
    connectionState,
    isConnected: connectionState === 'connected',
    isReconnecting: connectionState === 'reconnecting',
    reconnectAttempts,
    reconnect,
    disconnect
  };
}
