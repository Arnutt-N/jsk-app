import { describe, expect, it } from 'vitest';

import {
  PRESENCE_DOT_CLASS,
  PRESENCE_LABEL,
  getConnectionPresence,
  getSessionPresence,
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

    it.each(['connecting', 'authenticating', 'reconnecting'])(
      'maps %s to away',
      (wsStatus) => {
        expect(getConnectionPresence(wsStatus)).toBe('away');
      },
    );
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
