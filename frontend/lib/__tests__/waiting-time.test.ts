import { describe, it, expect } from 'vitest';
import {
  WAITING_AMBER_SECONDS,
  WAITING_RED_SECONDS,
  getWaitingSeconds,
  getWaitingTier,
  formatWaiting,
} from '../waiting-time';

describe('getWaitingTier', () => {
  it('returns normal just below the amber threshold (299s)', () => {
    expect(getWaitingTier(299)).toBe('normal');
  });

  it('returns amber exactly at the amber threshold (300s)', () => {
    expect(getWaitingTier(WAITING_AMBER_SECONDS)).toBe('amber');
  });

  it('returns amber just below the red threshold (899s)', () => {
    expect(getWaitingTier(899)).toBe('amber');
  });

  it('returns red exactly at the red threshold (900s)', () => {
    expect(getWaitingTier(WAITING_RED_SECONDS)).toBe('red');
  });

  it('returns normal for zero seconds', () => {
    expect(getWaitingTier(0)).toBe('normal');
  });
});

describe('getWaitingSeconds', () => {
  it('computes elapsed seconds against an injected now', () => {
    // Arrange
    const startedAt = '2026-06-27T10:00:00+00:00';
    const now = new Date('2026-06-27T10:07:00+00:00'); // 7 minutes later

    // Act
    const seconds = getWaitingSeconds(startedAt, now);

    // Assert
    expect(seconds).toBe(420);
  });

  it('floors sub-second remainders', () => {
    const startedAt = '2026-06-27T10:00:00.000+00:00';
    const now = new Date('2026-06-27T10:00:05.900+00:00');

    expect(getWaitingSeconds(startedAt, now)).toBe(5);
  });

  it('returns 0 for a future start time (never negative)', () => {
    const startedAt = '2026-06-27T10:10:00+00:00';
    const now = new Date('2026-06-27T10:00:00+00:00');

    expect(getWaitingSeconds(startedAt, now)).toBe(0);
  });

  it('returns 0 for an unparseable timestamp', () => {
    const now = new Date('2026-06-27T10:00:00+00:00');

    expect(getWaitingSeconds('not-a-date', now)).toBe(0);
  });
});

describe('formatWaiting', () => {
  it('returns "now" for under a minute', () => {
    expect(formatWaiting(30)).toBe('now');
  });

  it('returns compact minutes under an hour', () => {
    expect(formatWaiting(420)).toBe('7m');
  });

  it('returns hours and minutes past an hour', () => {
    expect(formatWaiting(3780)).toBe('1h 3m');
  });

  it('omits minutes on an exact hour', () => {
    expect(formatWaiting(7200)).toBe('2h');
  });
});
