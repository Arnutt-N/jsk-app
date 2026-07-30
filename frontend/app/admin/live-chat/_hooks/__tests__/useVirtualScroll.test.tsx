import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

import type { Message } from '@/lib/websocket/types';
import { useVirtualScroll } from '../useVirtualScroll';

/**
 * Unit tests for the useVirtualScroll extraction (reassembly Phase 3).
 *
 * Pins the safety-net windowing math (1500-message threshold, 88px estimated
 * rows, 12-row overscan), the forceAllMessages screen-reader escape hatch, the
 * render-time baseline reset on conversation switch, and the history-sentinel
 * guard conditions (hasMoreHistory / isLoadingHistory) — the behaviors ChatArea
 * relied on before the move. jsdom lacks ResizeObserver / IntersectionObserver
 * / Element.scrollTo, so all three are stubbed; the IO stub captures its
 * callback so tests can simulate the sentinel intersecting.
 */

const VIRTUAL_ESTIMATED_ROW_HEIGHT = 88;
const VIRTUAL_OVERSCAN = 12;

type HookResult = ReturnType<typeof useVirtualScroll>;

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    line_user_id: 'U1',
    direction: 'INCOMING' as const,
    content: `m${i}`,
    message_type: 'text',
    created_at: '2026-01-01T00:00:00Z',
  }));
}

interface HarnessProps {
  messages: Message[];
  selectedId?: string | null;
  hasMoreHistory?: boolean;
  isLoadingHistory?: boolean;
  loadOlderMessages?: () => Promise<void>;
  onValue: (value: HookResult) => void;
}

function Harness({
  messages,
  selectedId = 'U1',
  hasMoreHistory = false,
  isLoadingHistory = false,
  loadOlderMessages = async () => {},
  onValue,
}: HarnessProps) {
  const value = useVirtualScroll({
    messages,
    selectedId,
    hasMoreHistory,
    isLoadingHistory,
    loadOlderMessages,
    focusedMessageId: null,
    clearFocusedMessage: () => {},
    reducedMotion: true,
  });
  const { containerRef, sentinelRef } = value;
  React.useEffect(() => {
    onValue(value);
  });
  return (
    <div ref={containerRef}>
      <div ref={sentinelRef} />
    </div>
  );
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void | Promise<void>;

describe('useVirtualScroll', () => {
  let values: HookResult[];
  let ioCallbacks: IOCallback[];

  const latest = () => values[values.length - 1];

  beforeEach(() => {
    values = [];
    ioCallbacks = [];

    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    global.IntersectionObserver = class {
      constructor(callback: IOCallback) {
        ioCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;

    // jsdom does not implement Element.scrollTo (auto-scroll effects call it).
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mount = async (props: Omit<HarnessProps, 'onValue'>) => {
    const utils = await act(async () =>
      render(<Harness {...props} onValue={(v) => values.push(v)} />),
    );
    await flush();
    const rerender = async (next: Omit<HarnessProps, 'onValue'>) => {
      await act(async () => {
        utils.rerender(<Harness {...next} onValue={(v) => values.push(v)} />);
      });
      await flush();
    };
    return { rerender };
  };

  describe('window bounds', () => {
    it('renders everything below the 1500-message threshold', async () => {
      const messages = makeMessages(10);
      await mount({ messages });

      expect(latest().virtualEnabled).toBe(false);
      expect(latest().visibleWindow).toEqual({
        startIndex: 0,
        endIndex: 10,
        topPadding: 0,
        bottomPadding: 0,
      });
    });

    it('windows above the threshold with overscan clamped at the top', async () => {
      const total = 1501;
      await mount({ messages: makeMessages(total) });

      expect(latest().virtualEnabled).toBe(true);
      const { startIndex, endIndex, topPadding, bottomPadding } = latest().visibleWindow;
      // scrollTop = 0 → raw start (0 - overscan) clamps to 0, never negative.
      expect(startIndex).toBe(0);
      // viewportHeight = 0 in jsdom → visibleCount = 2 * overscan rows.
      expect(endIndex).toBe(VIRTUAL_OVERSCAN * 2);
      expect(topPadding).toBe(0);
      expect(bottomPadding).toBe((total - endIndex) * VIRTUAL_ESTIMATED_ROW_HEIGHT);
    });
  });

  describe('forceAllMessages escape hatch', () => {
    it('disables windowing so every message is in the DOM', async () => {
      const total = 1501;
      await mount({ messages: makeMessages(total) });
      expect(latest().virtualEnabled).toBe(true);

      await act(async () => {
        latest().setForceAllMessages(true);
      });
      await flush();

      expect(latest().forceAllMessages).toBe(true);
      expect(latest().virtualEnabled).toBe(false);
      expect(latest().visibleWindow.endIndex).toBe(total);
      expect(latest().visibleWindow.bottomPadding).toBe(0);
    });

    it('resets when switching conversations', async () => {
      const messages = makeMessages(1501);
      const { rerender } = await mount({ messages, selectedId: 'U1' });
      await act(async () => {
        latest().setForceAllMessages(true);
      });
      await flush();
      expect(latest().virtualEnabled).toBe(false);

      await rerender({ messages, selectedId: 'U2' });

      expect(latest().forceAllMessages).toBe(false);
      expect(latest().virtualEnabled).toBe(true);
    });
  });

  describe('baselineCount (entrance-animation baseline)', () => {
    it('holds the open-time count while messages are appended, and re-captures on room switch', async () => {
      const { rerender } = await mount({ messages: makeMessages(5), selectedId: 'U1' });
      expect(latest().baselineCount).toBe(5);

      // New messages in the same room do NOT move the baseline.
      await rerender({ messages: makeMessages(8), selectedId: 'U1' });
      expect(latest().baselineCount).toBe(5);

      // Switching rooms re-captures it, so history never animates.
      await rerender({ messages: makeMessages(8), selectedId: 'U2' });
      expect(latest().baselineCount).toBe(8);
    });
  });

  describe('history-sentinel guards', () => {
    const intersect = async () => {
      await act(async () => {
        for (const cb of ioCallbacks) {
          await cb([{ isIntersecting: true }]);
        }
      });
      await flush();
    };

    it('pages older history when the sentinel intersects and more history exists', async () => {
      const loadOlderMessages = vi.fn().mockResolvedValue(undefined);
      await mount({ messages: makeMessages(5), hasMoreHistory: true, loadOlderMessages });

      await intersect();

      expect(loadOlderMessages).toHaveBeenCalledTimes(1);
    });

    it('does not page when hasMoreHistory is false', async () => {
      const loadOlderMessages = vi.fn().mockResolvedValue(undefined);
      await mount({ messages: makeMessages(5), hasMoreHistory: false, loadOlderMessages });

      await intersect();

      expect(loadOlderMessages).not.toHaveBeenCalled();
    });

    it('does not page while a history load is already in flight', async () => {
      const loadOlderMessages = vi.fn().mockResolvedValue(undefined);
      await mount({
        messages: makeMessages(5),
        hasMoreHistory: true,
        isLoadingHistory: true,
        loadOlderMessages,
      });

      await intersect();

      expect(loadOlderMessages).not.toHaveBeenCalled();
    });

    it('ignores non-intersecting entries', async () => {
      const loadOlderMessages = vi.fn().mockResolvedValue(undefined);
      await mount({ messages: makeMessages(5), hasMoreHistory: true, loadOlderMessages });

      await act(async () => {
        for (const cb of ioCallbacks) {
          await cb([{ isIntersecting: false }]);
        }
      });
      await flush();

      expect(loadOlderMessages).not.toHaveBeenCalled();
    });
  });
});
