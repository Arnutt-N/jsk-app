import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

/**
 * Public-contract baseline for LiveChatProvider (Phase 8 / errata B7 + M-R2).
 *
 * Phase 8 splits the 805-line provider into four hooks. The ONE thing that must
 * survive that split byte-for-byte is the shape of `useLiveChatContext()` —
 * every consumer (ChatArea, ConversationList, CustomerPanel, LiveChatShell)
 * destructures from it. This test pins that shape:
 *
 *   1. The value exposes EXACTLY the 34 expected members (key-set equality —
 *      catches both an accidental drop during reassembly AND an unexpected
 *      addition). `Object.keys().length === 34` is deliberately NOT used: it
 *      passes even when a member is renamed, so we compare the sorted key sets.
 *   2. Each member has its expected runtime type (a dropped method that is
 *      re-added as `undefined` would pass a key check but fail here).
 *   3. There is no `state` member (removed in Phase 1 / M3) — guards against a
 *      regression that re-introduces the old god-object.
 *
 * Captured live from the `value` useMemo at LiveChatContext.tsx so it is the
 * source of truth, not a hand-maintained guess. Green BEFORE the refactor (this
 * file is the regression net); must stay green after every task.
 *
 * The provider's heavy deps (auth, router, WebSocket, audio, network, and
 * jsdom-missing matchMedia) are stubbed so it mounts in isolation. vi.mock
 * calls are hoisted above the imports.
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', display_name: 'Test Operator' }, token: 'test-token' }),
}));

vi.mock('@/hooks/useNotificationSound', () => {
  const sound = {
    playNotification: () => {},
    setEnabled: () => {},
    isEnabled: () => true,
  };
  return { useNotificationSound: () => sound };
});

vi.mock('@/hooks/useLiveChatSocket', () => {
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

type ContextValue = ReturnType<typeof useLiveChatContext>;

type MemberKind =
  | 'function'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'nullable';

/**
 * The frozen public contract. 34 members. `nullable` = present but null on a
 * fresh provider (focusedMessageId, selectedConversation); we assert presence +
 * null-or-correct-type rather than a fixed runtime type.
 */
const CONTRACT: Record<string, MemberKind> = {
  // ── non-store derived state ──
  wsStatus: 'string',
  isMobileView: 'boolean',
  typingUsersCount: 'number',
  focusedMessageId: 'nullable',
  isHumanMode: 'boolean',
  selectedConversation: 'nullable',
  currentUserId: 'number',
  onlineOperators: 'array',
  claimContenders: 'object',
  getClaimContender: 'function',
  // ── store setters ──
  setSearchQuery: 'function',
  setFilterStatus: 'function',
  setInputText: 'function',
  setShowCustomerPanel: 'function',
  setActiveActionMenu: 'function',
  setShowTransferDialog: 'function',
  setShowCannedPicker: 'function',
  setSoundEnabled: 'function',
  // ── selection / focus ──
  selectConversation: 'function',
  jumpToMessage: 'function',
  clearFocusedMessage: 'function',
  // ── data + actions ──
  fetchConversations: 'function',
  fetchChatDetail: 'function',
  sendMessage: 'function',
  sendMedia: 'function',
  claimSession: 'function',
  closeSession: 'function',
  transferSession: 'function',
  toggleMode: 'function',
  loadOlderMessages: 'function',
  reconnect: 'function',
  retryMessage: 'function',
  startTyping: 'function',
  formatTime: 'function',
};

function matchesKind(value: unknown, kind: MemberKind): boolean {
  switch (kind) {
    case 'function':
      return typeof value === 'function';
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'nullable':
      // Present and either null (fresh mount) or a non-undefined value.
      return value === null || value !== undefined;
  }
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('LiveChatContext public contract (Phase 8 / B7)', () => {
  let captured: ContextValue | undefined;

  function Probe() {
    const value = useLiveChatContext();
    React.useEffect(() => {
      captured = value;
    });
    return null;
  }

  beforeEach(() => {
    captured = undefined;
    useLiveChatStore.setState({
      conversations: [],
      selectedId: null,
      currentChat: null,
      messages: [],
      inputText: '',
      wsStatus: 'disconnected',
      onlineOperators: [],
      claimContenders: {},
      typingUsersCount: 0,
    });

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

  const mount = async () => {
    await act(async () => {
      render(
        <LiveChatProvider>
          <Probe />
        </LiveChatProvider>,
      );
    });
    await flush();
    if (!captured) throw new Error('provider did not commit a context value');
    return captured;
  };

  it('exposes EXACTLY the 34 contract members — no drops, no additions', async () => {
    const value = await mount();
    const actualKeys = Object.keys(value).sort();
    const expectedKeys = Object.keys(CONTRACT).sort();
    expect(actualKeys).toEqual(expectedKeys);
    expect(expectedKeys).toHaveLength(34);
  });

  it('does not expose a `state` member (Phase 1 / M3)', async () => {
    const value = await mount();
    expect(value as unknown as Record<string, unknown>).not.toHaveProperty('state');
  });

  it('each member has its expected runtime type', async () => {
    const value = await mount();
    const record = value as unknown as Record<string, unknown>;
    for (const [key, kind] of Object.entries(CONTRACT)) {
      expect(key in record, `missing contract member: ${key}`).toBe(true);
      expect(
        matchesKind(record[key], kind),
        `member ${key} expected ${kind}, got ${record[key] === null ? 'null' : typeof record[key]}`,
      ).toBe(true);
    }
  });
});
