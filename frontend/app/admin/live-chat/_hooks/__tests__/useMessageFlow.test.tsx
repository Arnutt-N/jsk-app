import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

import type { ConnectionState, Message } from '@/lib/websocket/types';
import { useLiveChatStore } from '../../_store/liveChatStore';
import { useMessageFlow } from '../useMessageFlow';

/**
 * Behavioural tests for useMessageFlow (Phase 8 / Task 3 + errata B6).
 *
 * The hook is wired against the REAL Zustand store (reset per test) so we assert
 * actual store transitions, not mock interactions. Only the cross-hook deps
 * (socket send, fetches, notification) and `Date`-driven temp ids are stubbed.
 *
 * Covered:
 *   - optimistic add + pending on a WS send
 *   - 10s ack-timeout → failed + sending released
 *   - B6.1 late ack must NOT resurrect a message the timeout already failed
 *   - B6.2 temp_id reconciliation: an inbound message with the same temp_id
 *     REPLACES the optimistic bubble (no duplicate)
 *   - B6.3 HTTP fallback issues detail + list refetch in parallel (Promise.all)
 *   - no-op guard when nothing is selected
 *   - INCOMING into a non-selected room toasts but does not append
 */

const ref = <T,>(value: T): RefObject<T> => ({ current: value });

const baseMessage = (over: Partial<Message>): Message => ({
  id: 0,
  line_user_id: 'U1',
  direction: 'OUTGOING',
  content: '',
  message_type: 'text',
  sender_role: 'ADMIN',
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

function setup(opts: {
  selectedId?: string | null;
  wsStatus?: ConnectionState;
  wsSend?: (text: string, tempId?: string) => void;
  fetchChatDetail?: ReturnType<typeof vi.fn>;
  fetchConversations?: ReturnType<typeof vi.fn>;
  playNotification?: ReturnType<typeof vi.fn>;
} = {}) {
  const wsSend = opts.wsSend ?? vi.fn();
  const fetchChatDetail = opts.fetchChatDetail ?? vi.fn().mockResolvedValue(undefined);
  const fetchConversations = opts.fetchConversations ?? vi.fn().mockResolvedValue(undefined);
  const playNotification = opts.playNotification ?? vi.fn();
  // `?? 'U1'` would collapse an explicit null, so distinguish not-provided.
  const selectedId = opts.selectedId === undefined ? 'U1' : opts.selectedId;

  useLiveChatStore.setState({
    selectedId,
    conversations: [],
    currentChat: null,
    messages: [],
    sending: false,
    inputText: '',
    pendingMessages: new Set(),
    failedMessages: new Map(),
    hasMoreHistory: true,
    isLoadingHistory: false,
  });

  const view = renderHook(() =>
    useMessageFlow({
      selectedIdRef: ref<string | null>(selectedId),
      wsStatusRef: ref<ConnectionState>(opts.wsStatus ?? 'connected'),
      wsSendMessageRef: ref(wsSend),
      playNotification,
      userDisplayName: 'Tester',
      fetchChatDetail,
      fetchConversations,
    }),
  );

  return { view, wsSend, fetchChatDetail, fetchConversations, playNotification };
}

const store = () => useLiveChatStore.getState();

describe('useMessageFlow', () => {
  // Fake timers everywhere: the WS-send path schedules a 10s ack timeout, which
  // would otherwise fire during a later test and mutate the shared store. Fake
  // timers do not block promise microtasks, so the HTTP-path awaits still
  // resolve normally.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('optimistically adds the message and marks it pending on a WS send', async () => {
    const { view, wsSend } = setup({ wsStatus: 'connected' });

    await act(async () => {
      await view.result.current.sendMessage('hello');
    });

    const msgs = store().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('hello');
    expect(msgs[0].temp_id).toBeTruthy();
    expect(store().pendingMessages.has(msgs[0].temp_id!)).toBe(true);
    expect(wsSend).toHaveBeenCalledWith('hello', msgs[0].temp_id);
    expect(store().sending).toBe(true); // released only by ack or timeout
  });

  it('fails the message and releases sending after the 10s ack timeout', async () => {
    vi.useFakeTimers();
    const { view } = setup({ wsStatus: 'connected' });

    await act(async () => {
      await view.result.current.sendMessage('no-ack');
    });
    const tempId = store().messages[0].temp_id!;
    expect(store().pendingMessages.has(tempId)).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(store().pendingMessages.has(tempId)).toBe(false);
    expect(store().failedMessages.get(tempId)).toBe('Message acknowledgment timed out');
    expect(store().sending).toBe(false);
  });

  it('B6.1 — a late ack does NOT resurrect a message the timeout already cleared', async () => {
    vi.useFakeTimers();
    const { view } = setup({ wsStatus: 'connected' });

    await act(async () => {
      await view.result.current.sendMessage('acked-early');
    });
    const tempId = store().messages[0].temp_id!;

    // Ack arrives first: pending cleared (handleMessageAck path).
    act(() => {
      view.result.current.handleMessageAck(tempId);
    });
    expect(store().pendingMessages.has(tempId)).toBe(false);

    // The timeout now fires — the `pendingMessages.has(tempId)` guard must hold,
    // so the message is NOT marked failed.
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(store().failedMessages.has(tempId)).toBe(false);
  });

  it('B6.2 — an inbound message with the same temp_id replaces the optimistic bubble (no duplicate)', async () => {
    const { view } = setup({ selectedId: 'U1', wsStatus: 'connected' });

    // Seed an optimistic OUTGOING message in the selected room.
    await act(async () => {
      useLiveChatStore.setState({ messages: [baseMessage({ id: 0, temp_id: 't1', content: 'optimistic' })] });
    });

    // The server echoes it back with a real id and the same temp_id.
    act(() => {
      view.result.current.handleNewMessage(baseMessage({ id: 99, temp_id: 't1', content: 'optimistic' }));
    });

    const msgs = store().messages;
    expect(msgs).toHaveLength(1); // replaced, not appended
    expect(msgs[0].id).toBe(99);
  });

  it('B6.3 — HTTP fallback refetches detail + list in parallel and clears pending', async () => {
    const order: string[] = [];
    const fetchChatDetail = vi.fn(() => { order.push('detail'); return Promise.resolve(undefined); });
    const fetchConversations = vi.fn(() => { order.push('list'); return Promise.resolve(undefined); });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    const { view } = setup({ wsStatus: 'disconnected', fetchChatDetail, fetchConversations });

    await act(async () => {
      await view.result.current.sendMessage('via-http');
    });

    // Both fired (Promise.all), both synchronously dispatched before awaiting.
    expect(fetchChatDetail).toHaveBeenCalledTimes(1);
    expect(fetchConversations).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['detail', 'list']);
    expect(store().pendingMessages.size).toBe(0);
    expect(store().sending).toBe(false);
    expect(store().inputText).toBe('');
  });

  it('is a no-op when nothing is selected', async () => {
    const { view, wsSend } = setup({ selectedId: null, wsStatus: 'connected' });

    await act(async () => {
      await view.result.current.sendMessage('ignored');
    });

    expect(store().messages).toHaveLength(0);
    expect(store().sending).toBe(false);
    expect(wsSend).not.toHaveBeenCalled();
  });

  it('toasts an INCOMING message for a non-selected room without appending it', async () => {
    const { view, playNotification } = setup({ selectedId: 'U1', wsStatus: 'connected' });

    act(() => {
      view.result.current.handleNewMessage(
        baseMessage({ id: 7, line_user_id: 'U2', direction: 'INCOMING', content: 'hi there' }),
      );
    });

    expect(playNotification).toHaveBeenCalledTimes(1);
    expect(store().notifications).toHaveLength(1);
    expect(store().notifications[0].lineUserId).toBe('U2');
    expect(store().messages).toHaveLength(0); // different room → not appended
  });
});
