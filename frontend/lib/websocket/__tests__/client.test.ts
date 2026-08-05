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
});
