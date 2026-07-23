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

  // Mint a fresh single-use WS ticket on every connect/reconnect via cookie
  // auth (credentials: include). The old ticket is single-use and would be
  // rejected, so each connection attempt gets a new one.
  const ticketMinter = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/v1/auth/ws-ticket', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.ticket as string) ?? null;
    } catch {
      return null;
    }
  }, []);

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
      token: undefined,
      ticketMinter,
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
  }, [adminId, url, ticketMinter]);

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
