import { describe, expect, it } from 'vitest';

import {
  PRESENCE_DOT_CLASS,
  PRESENCE_LABEL,
  getConnectionPresence,
  getSessionPresence,
  getUserActivityPresence,
  USER_ACTIVITY_WINDOW_MS,
} from '../live-chat-presence';

describe('live-chat-presence', () => {
  describe('getSessionPresence', () => {
    it('maps ACTIVE session to online', () => {
      expect(getSessionPresence('ACTIVE')).toBe('online');
    });

    it('maps WAITING session to away', () => {
      expect(getSessionPresence('WAITING')).toBe('away');
    });

    it('maps CLOSED session to offline', () => {
      expect(getSessionPresence('CLOSED')).toBe('offline');
    });

    it('maps missing session to offline', () => {
      expect(getSessionPresence(undefined)).toBe('offline');
    });
  });

  describe('getConnectionPresence', () => {
    it('maps connected to online', () => {
      expect(getConnectionPresence('connected')).toBe('online');
    });

    it('maps disconnected to offline', () => {
      expect(getConnectionPresence('disconnected')).toBe('offline');
    });

    it.each(['connecting', 'authenticating', 'reconnecting', 'failed'])(
      'maps %s to away',
      (wsStatus) => {
        expect(getConnectionPresence(wsStatus)).toBe('away');
      },
    );
  });

  describe('getUserActivityPresence', () => {
    const now = Date.parse('2026-08-05T12:00:00.000Z');

    it('maps recent inbound activity to online', () => {
      expect(getUserActivityPresence('2026-08-05T11:59:00.000Z', now)).toBe('online');
    });

    it('keeps the exact activity window online', () => {
      expect(getUserActivityPresence(new Date(now - USER_ACTIVITY_WINDOW_MS).toISOString(), now)).toBe('online');
    });

    it('maps stale, missing, invalid, and future timestamps to offline', () => {
      expect(getUserActivityPresence('2026-08-05T11:54:59.999Z', now)).toBe('offline');
      expect(getUserActivityPresence(undefined, now)).toBe('offline');
      expect(getUserActivityPresence('not-a-date', now)).toBe('offline');
      expect(getUserActivityPresence('2026-08-05T12:00:01.000Z', now)).toBe('offline');
    });
  });

  it('every presence state has a dot class and a Thai label', () => {
    for (const state of ['online', 'away', 'offline'] as const) {
      expect(PRESENCE_DOT_CLASS[state]).toMatch(/^bg-/);
      expect(PRESENCE_LABEL[state].length).toBeGreaterThan(0);
    }
  });

  it('uses the semantic status tokens for dot colors', () => {
    expect(PRESENCE_DOT_CLASS).toEqual({
      online: 'bg-online',
      away: 'bg-away',
      offline: 'bg-offline',
    });
  });
});
