import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useMediaQuery } from '../useMediaQuery';

/**
 * Unit tests for useMediaQuery (Phase 8 / Task 1).
 *
 * jsdom does not implement matchMedia, so we install a controllable stub that
 * captures the registered `change` listener. That lets us model a real media
 * change and assert the hook re-renders, plus verify listener cleanup on
 * unmount (a leak here would accumulate listeners across the app's lifetime).
 */

interface ControllableMql {
  mql: MediaQueryList;
  setMatches: (value: boolean) => void;
  listenerCount: () => number;
}

function installMatchMedia(initialMatches = false): ControllableMql {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  const mql = {
    get matches() {
      return matches;
    },
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;

  return {
    mql,
    setMatches: (value: boolean) => {
      matches = value;
      listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false initially when the query does not match', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
  });

  it('returns true on mount when the query already matches', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(true);
  });

  it('flips when a change event fires', () => {
    const control = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);

    act(() => control.setMatches(true));
    expect(result.current).toBe(true);

    act(() => control.setMatches(false));
    expect(result.current).toBe(false);
  });

  it('removes its change listener on unmount', () => {
    const control = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(control.listenerCount()).toBe(1);

    unmount();
    expect(control.listenerCount()).toBe(0);
  });
});
