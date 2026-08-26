import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoCloseCountdown } from '../useAutoCloseCountdown'

/**
 * Behavior tests for useAutoCloseCountdown.
 *
 * The hook drives the LIFF success-screen auto-close: it ticks down once per
 * second while `enabled`, invokes `onClose` exactly once at zero, reads
 * `onClose` through a ref (inline closures safe), and exposes `resetCountdown`.
 *
 * These tests exercise the public API only ({ timeLeft, resetCountdown }) and
 * use independent literals as expectations — nothing recomputed from the SUT.
 * Fake timers make the 1-second ticks deterministic; real timers are restored
 * after every test (vitest.setup.ts also unmounts the React tree).
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})


/** Advance the fake clock by exactly one tick (the hook schedules 1000ms). */
function tickOnce(): void {
  act(() => {
    vi.advanceTimersByTime(1000)
  })
}

describe('useAutoCloseCountdown', () => {
  it('starts at initialSeconds while enabled (default 5)', () => {
    // Arrange / Act
    const onClose = vi.fn()
    const { result } = renderHook(() => useAutoCloseCountdown(true, onClose))

    // Assert — fresh success screen shows the full countdown
    expect(result.current.timeLeft).toBe(5)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ticks down exactly once per second while enabled', () => {
    // Arrange
    const onClose = vi.fn()
    const { result } = renderHook(() => useAutoCloseCountdown(true, onClose))

    // Act + Assert — each simulated second drops the display by exactly 1
    tickOnce()
    expect(result.current.timeLeft).toBe(4)
    tickOnce()
    expect(result.current.timeLeft).toBe(3)
    tickOnce()
    expect(result.current.timeLeft).toBe(2)
    tickOnce()
    expect(result.current.timeLeft).toBe(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('invokes onClose exactly once at zero and stops ticking', () => {
    // Arrange
    const onClose = vi.fn()
    const { result } = renderHook(() => useAutoCloseCountdown(true, onClose))

    // Act — burn through all five seconds
    for (let i = 0; i < 5; i += 1) tickOnce()

    // Assert — window closed once at zero...
    expect(result.current.timeLeft).toBe(0)
    expect(onClose).toHaveBeenCalledTimes(1)
    // ...and nothing is left running (effect at zero schedules no timer)
    expect(vi.getTimerCount()).toBe(0)

    // Guard: passing more time must neither re-fire nor change the display
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.timeLeft).toBe(0)
  })

  it('does not tick while disabled', () => {
    // Arrange — wizard gates countdown behind `success && isInLineApp`,
    // so a failed submit must leave the timer untouched.
    const onClose = vi.fn()
    const { result } = renderHook(() => useAutoCloseCountdown(false, onClose))

    // Act
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    // Assert
    expect(result.current.timeLeft).toBe(5)
    expect(vi.getTimerCount()).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('begins counting only after enabled flips to true', () => {
    // Arrange — starts disabled
    const onClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAutoCloseCountdown(enabled, onClose),
      { initialProps: { enabled: false } }
    )

    // Disabled stretch burns no seconds
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.timeLeft).toBe(5)

    // Act — submit succeeded, enable flips true on rerender
    rerender({ enabled: true })
    tickOnce()
    tickOnce()

    // Assert
    expect(result.current.timeLeft).toBe(3)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('invokes the latest onClose closure (ref read at fire time)', () => {
    // Arrange — pages pass inline closures (`handleClose` defined per render);
    // the ref pattern means swapping the callback must not strand the old one.
    const closeFirst = vi.fn()
    const closeLatest = vi.fn()
    const { rerender } = renderHook(
      ({ onClose }: { onClose: () => void }) => useAutoCloseCountdown(true, onClose),
      { initialProps: { onClose: closeFirst } }
    )

    // Act — swap callback, then let the countdown hit zero
    rerender({ onClose: closeLatest })
    for (let i = 0; i < 5; i += 1) tickOnce()

    // Assert
    expect(closeLatest).toHaveBeenCalledTimes(1)
    expect(closeFirst).not.toHaveBeenCalled()
  })

  it('resetCountdown restores initialSeconds mid-count and keeps counting', () => {
    // Arrange
    const onClose = vi.fn()
    const { result } = renderHook(() => useAutoCloseCountdown(true, onClose))
    tickOnce()
    tickOnce()
    expect(result.current.timeLeft).toBe(3)

    // Act — "ยื่นคำร้องใหม่" path resets the screen without remounting
    act(() => {
      result.current.resetCountdown()
    })

    // Assert — back at the top, then ticking resumes normally
    expect(result.current.timeLeft).toBe(5)
    tickOnce()
    expect(result.current.timeLeft).toBe(4)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancels the pending timer on unmount', () => {
    // Arrange
    const onClose = vi.fn()
    const { unmount } = renderHook(() => useAutoCloseCountdown(true, onClose))
    tickOnce()

    // Act — user navigates away with a tick still pending
    unmount()

    // Assert — one timer was scheduled and cleanup removed it
    expect(vi.getTimerCount()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('honors a custom initialSeconds', () => {
    // Arrange
    const onClose = vi.fn()
    const { result } = renderHook(() => useAutoCloseCountdown(true, onClose, 3))

    // Act
    tickOnce()
    tickOnce()

    // Assert — two seconds burned of three
    expect(result.current.timeLeft).toBe(1)
    tickOnce()
    expect(result.current.timeLeft).toBe(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
