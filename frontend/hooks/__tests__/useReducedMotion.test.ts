import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * Unit tests for useReducedMotion.
 *
 * The hook reads the OS-level `(prefers-reduced-motion: reduce)` media query
 * and stays in sync with it. jsdom does not implement `window.matchMedia`, so
 * each test stubs a minimal MediaQueryList whose addEventListener captures the
 * `change` listener — that lets us fire a synthetic change and assert the hook
 * re-renders. The SSR-safe case stubs matchMedia to `undefined` to prove the
 * early-return guard prevents a crash.
 */

type ChangeListener = (event: MediaQueryListEvent) => void

/**
 * Build a fake matchMedia whose returned MediaQueryList records its `change`
 * listeners, plus a `fireChange` helper to simulate the OS preference flipping.
 */
function createMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>()
  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((_type: string, cb: ChangeListener) => {
      listeners.add(cb)
    }),
    removeEventListener: vi.fn((_type: string, cb: ChangeListener) => {
      listeners.delete(cb)
    }),
  }
  const matchMedia = vi.fn(() => mql)
  const fireChange = (matches: boolean) => {
    mql.matches = matches
    listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent))
  }
  return { matchMedia, fireChange, mql }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useReducedMotion', () => {
  it('returns false when prefers-reduced-motion does not match', () => {
    // Arrange
    const { matchMedia } = createMatchMedia(false)
    vi.stubGlobal('matchMedia', matchMedia)

    // Act
    const { result } = renderHook(() => useReducedMotion())

    // Assert
    expect(result.current).toBe(false)
  })

  it('returns true when prefers-reduced-motion matches', () => {
    // Arrange
    const { matchMedia } = createMatchMedia(true)
    vi.stubGlobal('matchMedia', matchMedia)

    // Act
    const { result } = renderHook(() => useReducedMotion())

    // Assert
    expect(result.current).toBe(true)
  })

  it('updates when a change event fires', () => {
    // Arrange
    const { matchMedia, fireChange } = createMatchMedia(false)
    vi.stubGlobal('matchMedia', matchMedia)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    // Act
    act(() => {
      fireChange(true)
    })

    // Assert
    expect(result.current).toBe(true)
  })

  it('does not crash when window.matchMedia is unavailable (SSR-safe)', () => {
    // Arrange — simulate an environment without matchMedia
    vi.stubGlobal('matchMedia', undefined)

    // Act — rendering must not throw
    const { result } = renderHook(() => useReducedMotion())

    // Assert — falls back to the safe default
    expect(result.current).toBe(false)
  })

  it('removes its change listener on unmount', () => {
    // Arrange
    const { matchMedia, mql } = createMatchMedia(false)
    vi.stubGlobal('matchMedia', matchMedia)
    const { unmount } = renderHook(() => useReducedMotion())
    expect(mql.addEventListener).toHaveBeenCalledTimes(1)

    // Act
    unmount()

    // Assert
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
