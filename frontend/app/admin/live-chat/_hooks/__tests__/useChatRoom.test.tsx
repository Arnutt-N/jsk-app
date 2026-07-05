// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RefObject } from 'react';

import { useChatRoom } from '../useChatRoom';
import { useLiveChatStore } from '../../_store/liveChatStore';
import type { ConnectionState } from '@/lib/websocket/types';

/**
 * Regression: toggleMode must surface a notification when the mode POST fails,
 * matching its sibling actions (claim/close/transfer). It previously had no
 * try/catch, so a network error or a non-ok response failed silently — the
 * operator saw nothing and assumed the mode switched.
 */
function makeParams() {
  return {
    selectedId: 'U1',
    wsStatus: 'disconnected' as ConnectionState,
    selectedIdRef: { current: 'U1' } as RefObject<string | null>,
    wsStatusRef: { current: 'disconnected' as ConnectionState } as RefObject<ConnectionState>,
    fetchChatDetail: vi.fn().mockResolvedValue(undefined),
    refreshConversationState: vi.fn().mockResolvedValue(undefined),
    fetchMessagesPage: vi.fn().mockResolvedValue({ messages: [], has_more: false }),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    wsClaimSession: vi.fn(),
    wsCloseSession: vi.fn(),
    wsTransferSession: vi.fn(() => false),
    wsConnected: false,
  };
}

describe('useChatRoom toggleMode error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLiveChatStore.setState({ selectedId: 'U1', notifications: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('surfaces a system notification when the mode POST rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { result } = renderHook(() => useChatRoom(makeParams()));

    await act(async () => {
      // Swallow here so a rejection surfaces as a missing-notification assertion
      // failure (clean RED), not an unhandled throw.
      await result.current.toggleMode('HUMAN').catch(() => {});
    });

    const notifs = useLiveChatStore.getState().notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('system');
  });

  it('surfaces a notification when the mode POST returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    const { result } = renderHook(() => useChatRoom(makeParams()));

    await act(async () => {
      await result.current.toggleMode('BOT').catch(() => {});
    });

    const notifs = useLiveChatStore.getState().notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('system');
  });
});
