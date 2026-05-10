import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGuardedUpdate } from '../useGuardedUpdate'

/**
 * Concurrency / lifecycle tests for useGuardedUpdate.
 *
 * The hook's job is twofold:
 *   1. Prevent duplicate fires of an in-flight async update (double-click,
 *      hammered Enter).
 *   2. Catch rejections so the wrapped function can be used in fire-and-
 *      forget callsites (e.g. inline arrow `onClick`) without producing
 *      unhandled promise rejections in the browser console.
 *
 * Each test below pins one of those guarantees.
 */

/**
 * Helper: build a Promise we can resolve/reject manually so the test can
 * model real "in-flight" timing. vi.fn() mocks return immediately by
 * default, which doesn't exercise the concurrency window.
 */
function createControllablePromise<T = void>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useGuardedUpdate', () => {
  it('starts with submitting=false', () => {
    const updateFn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useGuardedUpdate(updateFn))
    const [submitting] = result.current
    expect(submitting).toBe(false)
  })

  it('flips submitting=true while updateFn is in flight, then back to false', async () => {
    const { promise, resolve } = createControllablePromise()
    const updateFn = vi.fn(() => promise)

    const { result } = renderHook(() => useGuardedUpdate<string>(updateFn))

    // Fire the action -- do NOT await yet, we want to inspect mid-flight state.
    let action: Promise<void>
    act(() => {
      action = result.current[1]('arg-1')
    })

    // Mid-flight: submitting flipped to true (updateFn was called).
    await waitFor(() => {
      expect(result.current[0]).toBe(true)
    })
    expect(updateFn).toHaveBeenCalledTimes(1)
    expect(updateFn).toHaveBeenCalledWith('arg-1')

    // Resolve the promise -- the guard should clear submitting in `finally`.
    await act(async () => {
      resolve(undefined)
      await action
    })
    expect(result.current[0]).toBe(false)
  })

  it('drops concurrent calls while one is already in flight', async () => {
    const { promise, resolve } = createControllablePromise()
    const updateFn = vi.fn(() => promise)

    const { result } = renderHook(() => useGuardedUpdate<number>(updateFn))

    // Fire the first call.
    let firstCall: Promise<void>
    act(() => {
      firstCall = result.current[1](1)
    })

    await waitFor(() => {
      expect(result.current[0]).toBe(true)
    })

    // While the first is in flight, fire two more. Both should be dropped:
    // updateFn must still have been called only once.
    await act(async () => {
      const secondCall = result.current[1](2)
      const thirdCall = result.current[1](3)
      await Promise.all([secondCall, thirdCall])
    })
    expect(updateFn).toHaveBeenCalledTimes(1)
    expect(updateFn).toHaveBeenCalledWith(1)

    // Resolve the original; submitting should clear.
    await act(async () => {
      resolve(undefined)
      await firstCall
    })
    expect(result.current[0]).toBe(false)

    // Now a new call should go through (guard window is closed).
    const { promise: secondPromise, resolve: resolveSecond } = createControllablePromise()
    updateFn.mockReturnValueOnce(secondPromise)

    let nextCall: Promise<void>
    act(() => {
      nextCall = result.current[1](42)
    })

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledTimes(2)
    })
    expect(updateFn).toHaveBeenLastCalledWith(42)

    await act(async () => {
      resolveSecond(undefined)
      await nextCall
    })
  })

  it('catches rejections and clears submitting on error', async () => {
    const updateFn = vi.fn().mockRejectedValue(new Error('PATCH failed'))

    const { result } = renderHook(() => useGuardedUpdate<string>(updateFn))

    // The guarded callback must NOT throw -- the whole point of the guard
    // is to consume the rejection so fire-and-forget callsites are safe.
    await act(async () => {
      // If this rejects, the test fails (vitest surfaces unhandled rejections).
      await result.current[1]('arg')
    })

    expect(updateFn).toHaveBeenCalledTimes(1)
    expect(result.current[0]).toBe(false)
  })

  it('allows new calls after a rejection clears the guard', async () => {
    const updateFn = vi
      .fn<(arg: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useGuardedUpdate<string>(updateFn))

    await act(async () => {
      await result.current[1]('first')
    })
    expect(result.current[0]).toBe(false)
    expect(updateFn).toHaveBeenCalledTimes(1)

    // After the failed call, the guard should reopen and allow a retry.
    await act(async () => {
      await result.current[1]('second')
    })
    expect(updateFn).toHaveBeenCalledTimes(2)
    expect(updateFn).toHaveBeenNthCalledWith(2, 'second')
    expect(result.current[0]).toBe(false)
  })

  it('passes the argument unchanged through the guard', async () => {
    interface UpdatePayload {
      status: string
      assigned_agent_id: number | null
    }
    const updateFn = vi.fn<(arg: UpdatePayload) => Promise<void>>().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedUpdate<UpdatePayload>(updateFn))

    const payload: UpdatePayload = { status: 'PENDING', assigned_agent_id: null }
    await act(async () => {
      await result.current[1](payload)
    })

    expect(updateFn).toHaveBeenCalledWith(payload)
  })
})
