import {
  MessageType,
  WebSocketMessage,
  ConnectionState,
  UseWebSocketOptions
} from './types';
import { ExponentialBackoffStrategy } from './reconnectStrategy';
import { MessageQueue } from './messageQueue';
import { maskLineUserId } from '../mask';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private adminId: string;
  private token?: string;
  private ticket?: string;
  private ticketMinter?: () => Promise<string | null>;
  private queryTicket?: string;
  private queryTicketMinter?: () => Promise<string | null>;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectStrategy = new ExponentialBackoffStrategy();
  private messageQueue = new MessageQueue();
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private intentionalDisconnect = false;
  private connectionGeneration = 0;

  private onMessage?: (message: WebSocketMessage) => void;
  private onConnect?: () => void;
  private onDisconnect?: () => void;
  private onError?: (error: Error) => void;
  private onStateChange?: (state: ConnectionState) => void;

  private heartbeatIntervalMs = 25000;
  private maxReconnectAttempts = 10;
  private missedPongs = 0;
  private readonly maxMissedPongs = 2;

  constructor(options: UseWebSocketOptions & { onStateChange?: (state: ConnectionState) => void }) {
    this.url = options.url;
    this.adminId = options.adminId || '1';
    this.token = options.token;
    this.ticket = options.ticket;
    this.ticketMinter = options.ticketMinter;
    this.queryTicket = options.queryTicket;
    this.queryTicketMinter = options.queryTicketMinter;
    this.onMessage = options.onMessage;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;

    if (options.heartbeatInterval) {
      this.heartbeatIntervalMs = options.heartbeatInterval;
    }
    if (options.maxReconnectAttempts !== undefined) {
      this.maxReconnectAttempts = options.maxReconnectAttempts;
      this.reconnectStrategy = new ExponentialBackoffStrategy(
        1000,
        30000,
        this.maxReconnectAttempts,
      );
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  connect(): void {
    if (this.state === 'connecting' || this.state === 'connected' || this.state === 'authenticating') {
      return;
    }

    this.intentionalDisconnect = false;
    this.setState('connecting');
    const generation = ++this.connectionGeneration;

    // Fire-and-forget: mint a fresh cross-origin ticket if a minter is
    // provided, then open the socket. Keeps connect() sync so callers
    // (useWebSocket useEffect, client.reconnect()) stay unchanged.
    void this._openWithTicket(generation);
  }

  private async _openWithTicket(generation: number): Promise<void> {
    // Cross-origin mode (P1.1b / PR 2B): mint a fresh single-use ticket
    // via the cookie-authenticated POST /auth/ws-ticket (the global authFetch
    // patch supplies credentials + CSRF header). SameSite=Strict blocks cookie
    // auth on cross-origin handshakes, so external frontends pass the ticket
    // via `?ticket=<raw>` URL query param — server authenticates the handshake
    // directly from the URL, and the client skips the first-frame auth.
    let url = this.url;
    if (this.queryTicketMinter) {
      try {
        const ticket = await this.queryTicketMinter();
        if (!this.isCurrentGeneration(generation)) {
          return;
        }
        if (!ticket) {
          this.onError?.(new Error('Failed to mint WebSocket cross-origin ticket'));
          this.attemptReconnect();
          return;
        }
        this.queryTicket = ticket;
      } catch (error) {
        this.handleError(error as Error, undefined, generation);
        return;
      }
    }
    if (this.queryTicket) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}ticket=${encodeURIComponent(this.queryTicket)}`;
    }

    try {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => this.handleOpen(socket, generation);
      socket.onmessage = (event) => this.handleMessage(event, socket, generation);
      socket.onclose = () => this.handleClose(socket, generation);
      socket.onerror = (error) => this.handleError(error as unknown as Error, socket, generation);
    } catch (error) {
      this.handleError(error as Error, undefined, generation);
    }
  }

  private isCurrentGeneration(generation: number): boolean {
    return generation === this.connectionGeneration;
  }

  private isCurrentSocket(socket: WebSocket, generation: number): boolean {
    return this.isCurrentGeneration(generation) && socket === this.ws;
  }

  private async handleOpen(socket: WebSocket, generation: number): Promise<void> {
    if (!this.isCurrentSocket(socket, generation)) {
      return;
    }
    // Cross-origin (query-ticket) mode: the server already authenticated the
    // handshake via `?ticket=<raw>` URL param. Skip the first-frame auth and
    // jump directly to the connected state — the server pushes AUTH_SUCCESS
    // + PRESENCE_UPDATE on its own.
    if (this.queryTicket) {
      this.queryTicket = undefined;
      this.setState('connected');
      this.reconnectAttempt = 0;
      this.reconnectStrategy.reset();
      this.startHeartbeat();
      this.onConnect?.();
      this.processQueue();
      return;
    }

    this.setState('authenticating');
    // Auth message — ticketMinter (P1.1b cookie mode) fetches a fresh
    // single-use ticket on every connect/reconnect. Falls back to a static
    // ticket, then to the legacy JWT token.
    const authPayload: Record<string, unknown> = { admin_id: this.adminId };
    if (this.ticketMinter) {
      try {
        const ticket = await this.ticketMinter();
        if (!this.isCurrentSocket(socket, generation)) {
          return;
        }
        if (!ticket) {
          this.onError?.(new Error('Failed to mint WebSocket auth ticket'));
          this.attemptReconnect();
          this.ws?.close();
          return;
        }
        authPayload.ticket = ticket;
      } catch (error) {
        if (!this.isCurrentSocket(socket, generation)) {
          return;
        }
        this.onError?.(error instanceof Error ? error : new Error('Ticket mint failed'));
        this.attemptReconnect();
        this.ws?.close();
        return;
      }
    } else if (this.ticket) {
      authPayload.ticket = this.ticket;
    } else {
      authPayload.token = this.token;
    }
    this.sendRaw(MessageType.AUTH, authPayload);
  }

  private handleMessage(event: MessageEvent, socket: WebSocket, generation: number): void {
    if (!this.isCurrentSocket(socket, generation)) {
      return;
    }
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      // Handle auth response
      if (message.type === MessageType.AUTH_SUCCESS) {
        this.setState('connected');
        this.reconnectAttempt = 0;
        this.reconnectStrategy.reset();
        this.startHeartbeat();
        this.processQueue();
        this.onConnect?.();
        return;
      }

      if (message.type === MessageType.AUTH_ERROR) {
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = undefined;
        }
        this.intentionalDisconnect = true;
        this.setState('disconnected');
        this.onError?.(new Error('Authentication failed'));
        this.ws?.close();
        return;
      }

      // Handle pong (heartbeat response)
      if (message.type === MessageType.PONG) {
        this.missedPongs = 0;
        return;
      }

      this.onMessage?.(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', maskLineUserId(String(error)));
    }
  }

  private handleClose(socket: WebSocket, generation: number): void {
    if (!this.isCurrentSocket(socket, generation)) {
      return;
    }
    this.stopHeartbeat();
    this.ws = null;

    const wasConnected = this.state === 'connected';
    if (!this.reconnectTimeout) {
      this.setState('disconnected');
    }

    if (wasConnected) {
      this.onDisconnect?.();
    }

    // Skip reconnect if this was an intentional disconnect
    if (this.intentionalDisconnect) {
      this.intentionalDisconnect = false;
      return;
    }

    // Attempt reconnect
    this.attemptReconnect();
  }

  private handleError(error: Error, socket?: WebSocket, generation?: number): void {
    if (generation !== undefined && !this.isCurrentGeneration(generation)) {
      return;
    }
    if (socket && socket !== this.ws) {
      return;
    }
    this.onError?.(error);

    if (this.state === 'connecting' || this.state === 'authenticating') {
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    if (!this.reconnectStrategy.shouldRetry(this.reconnectAttempt)) {
      this.setState('failed');
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempt++;

    const delay = this.reconnectStrategy.getDelay(this.reconnectAttempt);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.missedPongs = 0;
    this.heartbeatInterval = setInterval(() => {
      if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
        this.missedPongs++;
        if (this.missedPongs > this.maxMissedPongs) {
          // Zombie connection detected — force reconnect
          console.warn(`WebSocket: ${this.missedPongs} missed pongs, forcing reconnect`);
          this.missedPongs = 0;
          this.reconnect();
          return;
        }
        this.sendRaw(MessageType.PING, {});
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    this.missedPongs = 0;
  }

  private processQueue(): void {
    while (!this.messageQueue.isEmpty() && this.state === 'connected') {
      const message = this.messageQueue.dequeue();
      if (message) {
        this.sendRaw(message.type, message.payload);
      }
    }
  }

  send(type: MessageType, payload: unknown, options: { queue?: boolean } = {}): boolean {
    const shouldQueue = options.queue ?? true;
    // Capture WebSocket reference to avoid race condition
    const ws = this.ws;
    if (this.state === 'connected' && ws?.readyState === WebSocket.OPEN) {
      // Write the frame directly instead of via sendRaw(): sendRaw swallows
      // its own errors and unconditionally enqueues, which would make this
      // method report success (and queue) even when the caller opted out.
      try {
        ws.send(JSON.stringify(this.buildFrame(type, payload)));
        return true;
      } catch (error) {
        console.error(
          shouldQueue
            ? 'Failed to send WebSocket message, queueing:'
            : 'Failed to send WebSocket message:',
          error,
        );
        if (shouldQueue) {
          this.messageQueue.enqueue(type, payload);
        }
        return false;
      }
    } else {
      // Queue message if not connected, unless the caller has a safer fallback.
      if (shouldQueue) {
        this.messageQueue.enqueue(type, payload);
      }
      return false;
    }
  }

  private buildFrame(type: MessageType, payload: unknown): WebSocketMessage {
    return {
      type,
      payload,
      timestamp: new Date().toISOString()
    };
  }

  private sendRaw(type: MessageType, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify(this.buildFrame(type, payload)));
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      // Queue for retry
      this.messageQueue.enqueue(type, payload);
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.connectionGeneration++;
    this.intentionalDisconnect = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
    this.reconnectAttempt = 0;
    this.reconnectStrategy.reset();
  }

  reconnect(): void {
    this.disconnect();
    this.reconnectAttempt = 0;
    this.reconnectStrategy.reset();
    this.connect();
  }

  getState(): ConnectionState {
    return this.state;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  getQueueLength(): number {
    return this.messageQueue.length;
  }
}
