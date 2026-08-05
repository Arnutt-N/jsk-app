import { afterEach, describe, expect, it, vi } from 'vitest';

import { WebSocketClient } from '../client';

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

describe('WebSocketClient terminal failure state', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it('emits failed only after the configured reconnect attempts are exhausted', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const states: string[] = [];
    const client = new WebSocketClient({
      url: 'ws://example.test/live-chat',
      maxReconnectAttempts: 1,
      onStateChange: (state) => states.push(state),
    });

    client.connect();
    FakeWebSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(2000);
    FakeWebSocket.instances[1].onclose?.();

    expect(states).toEqual(['connecting', 'disconnected', 'reconnecting', 'connecting', 'disconnected', 'failed']);
    expect(client.getState()).toBe('failed');
  });

  it('schedules one reconnect when the same socket emits error then close', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const client = new WebSocketClient({
      url: 'ws://example.test/live-chat',
      maxReconnectAttempts: 1,
    });

    client.connect();
    FakeWebSocket.instances[0].onerror?.(new Event('error'));
    FakeWebSocket.instances[0].onclose?.();

    expect(client.getReconnectAttempt()).toBe(1);
    expect(client.getState()).toBe('reconnecting');
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(client.getState()).toBe('connecting');
  });

  it('retries null query tickets and reaches failed after the retry budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const queryTicketMinter = vi.fn().mockResolvedValue(null);
    const client = new WebSocketClient({
      url: 'ws://example.test/live-chat',
      queryTicketMinter,
      maxReconnectAttempts: 1,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getState()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(2000);
    expect(queryTicketMinter).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(client.getState()).toBe('failed');
  });

  it('retries null first-frame auth tickets and reaches failed after the retry budget', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ticketMinter = vi.fn().mockResolvedValue(null);
    const client = new WebSocketClient({
      url: 'ws://example.test/live-chat',
      ticketMinter,
      maxReconnectAttempts: 1,
    });

    client.connect();
    FakeWebSocket.instances[0].onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getState()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(2000);
    FakeWebSocket.instances[1].onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(ticketMinter).toHaveBeenCalledTimes(2);
    expect(client.getState()).toBe('failed');
  });

  it('ignores a delayed close from a socket replaced by manual reconnect', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new WebSocketClient({ url: 'ws://example.test/live-chat' });

    client.connect();
    const oldSocket = FakeWebSocket.instances[0];
    client.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(2);

    oldSocket.onclose?.();

    expect(client.getState()).toBe('connecting');
    expect(client.getReconnectAttempt()).toBe(0);
    vi.runOnlyPendingTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('ignores a query ticket that resolves after explicit disconnect', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    let resolveTicket: (ticket: string | null) => void = () => {};
    const queryTicketMinter = vi.fn(() => new Promise<string | null>((resolve) => {
      resolveTicket = resolve;
    }));
    const client = new WebSocketClient({
      url: 'ws://example.test/live-chat',
      queryTicketMinter,
    });

    client.connect();
    client.disconnect();
    resolveTicket('stale-ticket');
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(client.getState()).toBe('disconnected');
  });
});
