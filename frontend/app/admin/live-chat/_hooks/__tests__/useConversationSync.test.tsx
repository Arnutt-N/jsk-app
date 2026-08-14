import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

import type { ConnectionState, ConversationUpdatePayload } from '@/lib/websocket/types';
import type { Conversation } from '../../_types';
import { useLiveChatStore } from '../../_store/liveChatStore';
import { computeConversationStats } from '../useConversationStats';
import { useConversationSync } from '../useConversationSync';

/**
 * Regression tests for the "clicking a conversation makes the row jump to the
 * bottom of the sidebar" bug (#177–#181 chased this as a scroll problem; a
 * browser diagnostic proved nothing ever scrolls).
 *
 * Real cause: selecting a room triggers `join_room`, and the backend answers
 * with a CONVERSATION_UPDATE state sync that carries NO `last_message`
 * (ws_session/handlers.py) — while `GET /conversations/{id}` omits it too
 * (live_chat_service/conversations.py). `handleConversationUpdate` merges the
 * selected room off `currentChat`, so both sides are undefined and the row
 * loses its sort key. `computeConversationStats` sorts on
 * `last_message.created_at` (missing → 0), so the row sinks to the bottom.
 *
 * The invariant under test: a partial state-sync update must never destroy the
 * fields the sidebar sorts on (`last_message`, `is_pinned`).
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

const ref = <T,>(value: T): RefObject<T> => ({ current: value });

const conv = (id: string, over: Partial<Conversation> = {}): Conversation => ({
  line_user_id: id,
  display_name: `User ${id}`,
  picture_url: '',
  friend_status: 'ACTIVE',
  chat_mode: 'BOT',
  unread_count: 0,
  ...over,
});

/** Payload shaped exactly like the JOIN_ROOM sync in ws_session/handlers.py. */
const joinRoomSync = (id: string): ConversationUpdatePayload => ({
  line_user_id: id,
  display_name: `User ${id}`,
  picture_url: '',
  chat_mode: 'BOT',
  session: undefined,
  messages: [],
});

type Mounted = ReturnType<typeof renderHook<ReturnType<typeof useConversationSync>, unknown>>;
let mounted: Mounted | null = null;

function setup(selectedId: string): Mounted {
  mounted = renderHook(() =>
    useConversationSync({
      selectedIdRef: ref<string | null>(selectedId),
      wsStatusRef: ref<ConnectionState>('connected'),
    }),
  );
  return mounted;
}

describe('useConversationSync — sidebar ordering is stable across a join-room sync', () => {
  beforeEach(() => {
    // The hook fetches the list on mount; keep it inert so we assert only the
    // conversation_update transition.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    useLiveChatStore.setState({
      conversations: [
        conv('U1', { last_message: { content: 'newest', created_at: '2026-08-01T10:00:00.000Z' } }),
        conv('U2', { last_message: { content: 'older', created_at: '2026-08-01T09:00:00.000Z' } }),
        conv('U3', { last_message: { content: 'oldest', created_at: '2026-08-01T08:00:00.000Z' } }),
        conv('U4'), // never messaged — already sorts last
      ],
      selectedId: 'U1',
      // Mirrors the real detail response, which carries no `last_message`.
      currentChat: { ...conv('U1'), messages: [] },
    });
  });

  afterEach(() => {
    // The hook owns a 5s polling interval; unmounting clears it so it cannot
    // outlive the test and fire against a torn-down store.
    mounted?.unmount();
    mounted = null;
    vi.unstubAllGlobals();
  });

  it('keeps last_message on the selected room when the sync omits it', () => {
    const { result } = setup('U1');

    act(() => result.current.handleConversationUpdate(joinRoomSync('U1')));

    const updated = useLiveChatStore.getState().conversations.find((c) => c.line_user_id === 'U1');
    expect(updated?.last_message?.created_at).toBe('2026-08-01T10:00:00.000Z');
  });

  it('does not move the clicked row to the bottom of the sidebar', () => {
    const { result } = setup('U1');

    act(() => result.current.handleConversationUpdate(joinRoomSync('U1')));

    const { filtered } = computeConversationStats(useLiveChatStore.getState().conversations, '', 'recent');
    expect(filtered.map((c) => c.line_user_id)).toEqual(['U1', 'U2', 'U3', 'U4']);
  });

  it('keeps the per-operator preference flags when the sync omits them', () => {
    useLiveChatStore.setState({
      conversations: [
        conv('U2', { last_message: { content: 'older', created_at: '2026-08-01T09:00:00.000Z' } }),
        conv('U3', {
          is_pinned: true,
          is_muted: true,
          is_spam: true,
          last_message: { content: 'pinned', created_at: '2026-08-01T08:00:00.000Z' },
        }),
      ],
      selectedId: 'U3',
      currentChat: { ...conv('U3'), messages: [] },
    });
    const { result } = setup('U3');

    act(() => result.current.handleConversationUpdate(joinRoomSync('U3')));

    const updated = useLiveChatStore.getState().conversations.find((c) => c.line_user_id === 'U3');
    expect(updated).toMatchObject({ is_pinned: true, is_muted: true, is_spam: true });
    // Pinned rows sort ahead of everything, so losing the flag was a jump too.
    const { filtered } = computeConversationStats(useLiveChatStore.getState().conversations, '', 'recent');
    expect(filtered[0]?.line_user_id).toBe('U3');
  });

  it('still updates currentChat for the selected room', () => {
    const { result } = setup('U1');

    act(() => result.current.handleConversationUpdate({ ...joinRoomSync('U1'), chat_mode: 'HUMAN' }));

    expect(useLiveChatStore.getState().currentChat).toMatchObject({ line_user_id: 'U1', chat_mode: 'HUMAN' });
  });

  it('prepends a room that is not in the list yet (deep link)', () => {
    useLiveChatStore.setState({ selectedId: 'U9', currentChat: { ...conv('U9'), messages: [] } });
    const { result } = setup('U9');

    act(() => result.current.handleConversationUpdate(joinRoomSync('U9')));

    const ids = useLiveChatStore.getState().conversations.map((c) => c.line_user_id);
    expect(ids).toContain('U9');
  });

  it('keeps the unread badge when selecting and clears it only after read succeeds', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, options) => (
      options?.method === 'POST'
        ? Promise.resolve({
          ok: true,
          json: async () => ({ read_at: '2026-08-05T12:00:00.000Z' }),
        })
        : Promise.resolve({ ok: false })
    ));
    vi.stubGlobal('fetch', fetchMock);
    useLiveChatStore.setState({
      conversations: [conv('U1', { unread_count: 2 })],
      selectedId: null,
      currentChat: null,
    });
    const { result } = setup('U1');

    act(() => result.current.selectConversation('U1'));
    expect(useLiveChatStore.getState().conversations[0].unread_count).toBe(2);

    await act(async () => {
      await expect(result.current.markConversationRead('U1', '2026-08-05T12:00:00.000Z')).resolves.toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/U1/read'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(useLiveChatStore.getState().conversations[0].unread_count).toBe(0);
  });

  it('does not acknowledge a JOIN_ROOM state sync before history loads', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    useLiveChatStore.setState({
      conversations: [conv('U1', { unread_count: 2 })],
      selectedId: 'U1',
      currentChat: { ...conv('U1'), messages: [] },
    });
    const { result } = setup('U1');

    act(() => result.current.handleConversationUpdate({
      ...joinRoomSync('U1'),
      unread_count: 2,
      last_user_activity_at: '2026-08-05T12:00:00.000Z',
    }));

    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect(useLiveChatStore.getState().conversations[0].unread_count).toBe(2);
  });

  it('does not let an older acknowledgement clear a newer incoming message', async () => {
    let resolveRead!: (value: { ok: boolean; json: () => Promise<{ read_at: string }> }) => void;
    const readResponse = new Promise<{ ok: boolean; json: () => Promise<{ read_at: string }> }>((resolve) => {
      resolveRead = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => (
      options?.method === 'POST'
        ? readResponse
        : Promise.resolve({ ok: false })
    )));
    useLiveChatStore.setState({
      conversations: [conv('U1', {
        unread_count: 1,
        last_user_activity_at: '2026-08-05T12:00:00.000Z',
      })],
      selectedId: 'U1',
      currentChat: { ...conv('U1'), messages: [] },
    });
    const { result } = setup('U1');

    let pendingRead!: Promise<boolean>;
    act(() => {
      pendingRead = result.current.markConversationRead('U1', '2026-08-05T12:00:00.000Z');
    });
    act(() => {
      useLiveChatStore.setState({
        conversations: [conv('U1', {
          unread_count: 1,
          last_user_activity_at: '2026-08-05T12:01:00.000Z',
        })],
      });
    });
    resolveRead({
      ok: true,
      json: async () => ({ read_at: '2026-08-05T12:00:00.000Z' }),
    });

    await act(async () => {
      await expect(pendingRead).resolves.toBe(true);
    });
    expect(useLiveChatStore.getState().conversations[0].unread_count).toBe(1);
  });

  it('ignores stale unread state at or before the acknowledged boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => (
      options?.method === 'POST'
        ? Promise.resolve({
          ok: true,
          json: async () => ({ read_at: '2026-08-05T12:00:00.000Z' }),
        })
        : Promise.resolve({ ok: false })
    )));
    useLiveChatStore.setState({
      conversations: [conv('U1', {
        unread_count: 1,
        last_user_activity_at: '2026-08-05T12:00:00.000Z',
      })],
      selectedId: 'U1',
      currentChat: { ...conv('U1'), messages: [] },
    });
    const { result } = setup('U1');

    await act(async () => {
      await result.current.markConversationRead('U1', '2026-08-05T12:00:00.000Z');
    });
    act(() => result.current.handleConversationUpdate({
      ...joinRoomSync('U1'),
      unread_count: 1,
      last_user_activity_at: '2026-08-05T12:00:00.000Z',
    }));

    expect(useLiveChatStore.getState().conversations[0].unread_count).toBe(0);
  });

  it('uses the server boundary to reject a stale update after manual mark-read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => (
      options?.method === 'POST'
        ? Promise.resolve({
          ok: true,
          json: async () => ({ read_at: '2026-08-05T12:00:00.000Z' }),
        })
        : Promise.resolve({ ok: false })
    )));
    useLiveChatStore.setState({
      conversations: [conv('U1', {
        unread_count: 1,
        last_user_activity_at: '2026-08-05T12:00:00.000Z',
      })],
      selectedId: 'U1',
      currentChat: { ...conv('U1'), messages: [] },
    });
    const { result } = setup('U1');

    await act(async () => {
      await expect(result.current.markConversationRead('U1')).resolves.toBe(true);
    });
    act(() => result.current.handleConversationUpdate({
      ...joinRoomSync('U1'),
      unread_count: 1,
      last_user_activity_at: '2026-08-05T12:00:00.000Z',
    }));

    expect(useLiveChatStore.getState().conversations[0].unread_count).toBe(0);
  });
});
