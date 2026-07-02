import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

import type { PresencePayload, SessionTransferredPayload } from '@/lib/websocket/types';

/**
 * Claim-contention state tests for LiveChatProvider (M16 / errata B5).
 *
 * The provider wires the WebSocket `session_claimed` / `session_closed` /
 * `session_transferred` broadcasts into a `claimContenders` map keyed by
 * line_user_id. When another operator claims a room, the contender is recorded
 * so consumers can disable Claim + show "<name> กำลังรับเรื่อง...". When the
 * room is claimed by *me*, or the session closes / transfers, the lock clears.
 *
 * Rather than render every downstream button, this pins the executable
 * invariant behind that UX: `getClaimContender(lineUserId)` is set for a
 * foreign claim and cleared otherwise. The provider's heavy deps (auth, router,
 * audio, network) are stubbed, and the WebSocket hook is replaced with a stub
 * that *captures* the options object so the test can fire the callbacks the
 * provider passed in. vi.mock + vi.hoisted are hoisted above the imports.
 */

interface CapturedSocketOptions {
  onSessionClaimed?: (lineUserId: string, operatorId: number) => void;
  onSessionClosed?: (lineUserId: string) => void;
  onSessionTransferred?: (payload: SessionTransferredPayload) => void;
  onPresenceUpdate?: (operators: PresencePayload['operators']) => void;
  onError?: (message: string) => void;
}

const socketCapture = vi.hoisted(() => ({
  options: null as CapturedSocketOptions | null,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  // currentUserId resolves to 1 — a claim by operator 2 is "foreign".
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
  // One stable return object (identities are value-memo deps); the factory
  // records the latest options so the test can invoke the provider callbacks.
  const socket = {
    status: 'connected' as const,
    isConnected: true,
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
  return {
    useLiveChatSocket: (options: CapturedSocketOptions) => {
      socketCapture.options = options;
      return socket;
    },
  };
});

import { LiveChatProvider, useLiveChatContext } from '../LiveChatContext';
import { useLiveChatStore } from '../../_store/liveChatStore';

type ContextValue = ReturnType<typeof useLiveChatContext>;

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const ONLINE_OPERATORS: PresencePayload['operators'] = [
  { id: 2, status: 'online', active_chats: 1, display_name: 'สมชาย' },
];

describe('LiveChatContext claim contention (M16 / B5)', () => {
  let values: ContextValue[];

  function Probe() {
    const value = useLiveChatContext();
    React.useEffect(() => {
      values.push(value);
    });
    return null;
  }

  const latest = () => values[values.length - 1];

  beforeEach(() => {
    values = [];
    socketCapture.options = null;

    useLiveChatStore.setState({
      conversations: [],
      selectedId: null,
      currentChat: null,
      messages: [],
      inputText: '',
      claiming: false,
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
    // Seed presence so the contender name resolves from display_name.
    await act(async () => {
      socketCapture.options?.onPresenceUpdate?.(ONLINE_OPERATORS);
    });
    await flush();
  };

  it('records a contender when another operator claims the room', async () => {
    // Arrange
    await mount();
    expect(latest().getClaimContender('U123')).toBeUndefined();

    // Act — operator 2 (not me) claims U123
    await act(async () => {
      socketCapture.options?.onSessionClaimed?.('U123', 2);
    });
    await flush();

    // Assert
    const contender = latest().getClaimContender('U123');
    expect(contender).toEqual({ operatorId: 2, name: 'สมชาย' });
    expect(latest().claimContenders).toHaveProperty('U123');
  });

  it('clears the contender when the session is closed', async () => {
    // Arrange — a foreign claim is in place
    await mount();
    await act(async () => {
      socketCapture.options?.onSessionClaimed?.('U123', 2);
    });
    await flush();
    expect(latest().getClaimContender('U123')).toBeDefined();

    // Act
    await act(async () => {
      socketCapture.options?.onSessionClosed?.('U123');
    });
    await flush();

    // Assert
    expect(latest().getClaimContender('U123')).toBeUndefined();
  });

  it('does not lock the room when I am the claimer (claimed-by-self clears)', async () => {
    // Arrange — a foreign claim is in place first
    await mount();
    await act(async () => {
      socketCapture.options?.onSessionClaimed?.('U123', 2);
    });
    await flush();
    expect(latest().getClaimContender('U123')).toBeDefined();

    // Act — I (operator 1) win/claim the same room
    await act(async () => {
      socketCapture.options?.onSessionClaimed?.('U123', 1);
    });
    await flush();

    // Assert
    expect(latest().getClaimContender('U123')).toBeUndefined();
  });

  it('clears the contender when the session is transferred', async () => {
    // Arrange
    await mount();
    await act(async () => {
      socketCapture.options?.onSessionClaimed?.('U123', 2);
    });
    await flush();
    expect(latest().getClaimContender('U123')).toBeDefined();

    // Act
    await act(async () => {
      socketCapture.options?.onSessionTransferred?.({
        line_user_id: 'U123',
        session_id: 1,
        from_operator_id: 2,
        to_operator_id: 3,
      });
    });
    await flush();

    // Assert
    expect(latest().getClaimContender('U123')).toBeUndefined();
  });

  it('falls back to Operator #id when the claimer is not in presence', async () => {
    // Arrange
    await mount();

    // Act — operator 9 has no presence entry
    await act(async () => {
      socketCapture.options?.onSessionClaimed?.('U777', 9);
    });
    await flush();

    // Assert
    expect(latest().getClaimContender('U777')).toEqual({ operatorId: 9, name: 'Operator #9' });
  });

  it('surfaces non-claim WebSocket errors as notifications', async () => {
    await mount();

    await act(async () => {
      socketCapture.options?.onError?.('Only the current operator can transfer the session');
    });
    await flush();

    const notification = useLiveChatStore.getState().notifications.at(-1);
    expect(notification).toMatchObject({
      title: 'Live chat error',
      message: 'Only the current operator can transfer the session',
      type: 'system',
    });
  });
});
