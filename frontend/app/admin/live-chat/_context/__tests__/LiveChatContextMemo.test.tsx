import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

/**
 * Context-value memoization tests for LiveChatProvider (H3 / errata B4).
 *
 * Errata B4 calls this the *executable form* of the PRD perf success-metric:
 *   "type 1 char in MessageInput  →  unrelated consumers re-render = 0".
 *
 * Rather than a flaky render-count snapshot from React DevTools Profiler, we
 * pin the deterministic invariant that makes that metric true:
 *
 *   1. The memoized context `value` keeps a STABLE object identity when an
 *      unrelated store field (`inputText`, written on every keystroke) changes.
 *      Because the provider no longer subscribes to `inputText` (M3 removed the
 *      `state` mirror), it does not even re-render — so consumers don't either.
 *   2. Even across a real provider re-render whose value-deps are unchanged
 *      (e.g. `conversations` changes while nothing is selected), the memo holds
 *      the same reference, so a memoized consumer does not re-render.
 *   3. The context value no longer exposes a `state` member (Phase 8 contract).
 *
 * The provider has heavy external dependencies (auth, router, WebSocket, audio,
 * network). They are stubbed below so the provider mounts in isolation and the
 * test stays deterministic. vi.mock calls are hoisted above the imports.
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', display_name: 'Test Operator' }, token: 'test-token' }),
}));

vi.mock('@/hooks/useNotificationSound', () => {
  // One stable object so the provider's setSoundEnabled callback identity holds.
  const sound = {
    playNotification: () => {},
    setEnabled: () => {},
    isEnabled: () => true,
  };
  return { useNotificationSound: () => sound };
});

vi.mock('@/hooks/useLiveChatSocket', () => {
  // Returning ONE stable object keeps reconnect / retryMessage / startTyping
  // identities constant across renders — the value memo lists them as deps.
  const socket = {
    status: 'disconnected' as const,
    isConnected: false,
    joinRoom: () => {},
    leaveRoom: () => {},
    sendMessage: () => {},
    retryMessage: () => {},
    startTyping: () => {},
    stopTyping: () => {},
    claimSession: () => {},
    closeSession: () => {},
    transferSession: () => true,
    reconnect: () => {},
  };
  return { useLiveChatSocket: () => socket };
});

import { LiveChatProvider, useLiveChatContext } from '../LiveChatContext';
import { useLiveChatStore } from '../../_store/liveChatStore';
import type { Conversation } from '../../_types';

type ContextValue = ReturnType<typeof useLiveChatContext>;

// Drain microtasks (mount fetch chain) + pending passive effects via a single
// macrotask tick. setTimeout(0) runs after the microtask queue but well before
// the provider's 5s polling interval, so the test never picks up that timer.
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('LiveChatContext value memoization (H3 / B4)', () => {
  beforeEach(() => {
    // Reset the singleton Zustand store so cases don't leak into each other.
    useLiveChatStore.setState({
      conversations: [],
      selectedId: null,
      currentChat: null,
      messages: [],
      inputText: '',
      showCannedPicker: false,
    });

    // jsdom does not implement matchMedia; the provider reads it on mount.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    // The provider calls fetchConversations() on mount; keep it deterministic.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [] }),
      text: async () => '',
      headers: { get: () => 'application/json' },
      clone() { return this; },
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose a `state` member (Phase 8 / M3 contract)', async () => {
    const captured: ContextValue[] = [];
    function Probe() {
      const value = useLiveChatContext();
      // Capture in an effect (committed value) — reassigning/recording an outer
      // binding during render is a side effect and is disallowed.
      React.useEffect(() => {
        captured.push(value);
      });
      return null;
    }

    await act(async () => {
      render(
        <LiveChatProvider>
          <Probe />
        </LiveChatProvider>,
      );
    });
    await flush();

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value as unknown as Record<string, unknown>).not.toHaveProperty('state');
    // Sanity: the surface we DO expect is still there.
    expect(value).toHaveProperty('selectedConversation');
    expect(value).toHaveProperty('sendMessage');
  });

  it('keeps the value reference stable when inputText changes — type 1 char ⇒ 0 unrelated re-renders', async () => {
    const values: ContextValue[] = [];
    function Probe() {
      const value = useLiveChatContext();
      // No dep array ⇒ records the committed value on every commit.
      React.useEffect(() => {
        values.push(value);
      });
      return null;
    }

    await act(async () => {
      render(
        <LiveChatProvider>
          <Probe />
        </LiveChatProvider>,
      );
    });
    await flush();

    const rendersBefore = values.length;
    const valueBefore = values[values.length - 1];

    // Simulate typing one character. `inputText` is read directly from the
    // store by MessageInput and is NOT a dependency of the memoized context
    // value, so the provider must not re-render and the reference must hold.
    await act(async () => {
      useLiveChatStore.getState().setInputText('a');
    });
    await flush();

    const valueAfter = values[values.length - 1];

    expect(useLiveChatStore.getState().inputText).toBe('a'); // update really applied
    expect(values.length).toBe(rendersBefore); // 0 additional consumer commits
    expect(valueAfter).toBe(valueBefore); // same object identity (memo held)
  });

  it('memoizes correctly: a subscribed-but-irrelevant change keeps the reference; a real dependency change replaces it', async () => {
    const values: ContextValue[] = [];
    function Probe() {
      const value = useLiveChatContext();
      // A context consumer re-renders (and so pushes again) ONLY when the
      // context value identity changes — the provider's children are stable
      // element references, so a provider re-render does not cascade here.
      React.useEffect(() => {
        values.push(value);
      });
      return null;
    }

    await act(async () => {
      render(
        <LiveChatProvider>
          <Probe />
        </LiveChatProvider>,
      );
    });
    await flush();

    const rendersBefore = values.length;
    const valueBefore = values[values.length - 1];

    const next: Conversation[] = [
      {
        line_user_id: 'U999',
        display_name: 'Somebody',
        picture_url: '',
        friend_status: 'following',
        chat_mode: 'BOT',
        unread_count: 0,
      },
    ];

    // Negative control: `conversations` IS a provider subscription, so this
    // re-renders the provider. But with nothing selected, selectedConversation
    // stays null and no value dependency changes, so the memo returns the SAME
    // reference and the consumer does not re-render.
    await act(async () => {
      useLiveChatStore.getState().setConversations(next);
    });
    await flush();

    expect(useLiveChatStore.getState().conversations).toHaveLength(1); // provider input really changed
    expect(values.length).toBe(rendersBefore); // consumer did not re-render
    expect(values[values.length - 1]).toBe(valueBefore); // identity held across the re-render

    // Positive control: selecting that conversation changes selectedConversation
    // — a real value dependency — so the memo MUST recompute, producing a new
    // reference and re-rendering the consumer. Guards against a trivially
    // constant memo.
    await act(async () => {
      useLiveChatStore.getState().selectChat('U999');
    });
    await flush();

    const valueAfter = values[values.length - 1];
    expect(values.length).toBeGreaterThan(rendersBefore); // consumer re-rendered
    expect(valueAfter).not.toBe(valueBefore); // new reference
    expect(valueAfter.selectedConversation?.line_user_id).toBe('U999');
  });
});
