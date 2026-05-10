'use client'

import { useCallback, useState } from 'react'

/**
 * In-flight guard for one-shot async actions.
 *
 * Wraps an async update function so that:
 *   - Concurrent calls are dropped (the second one returns immediately
 *     while the first is still pending). Prevents duplicate PATCH
 *     requests from double-clicks or hammered keyboard activations.
 *   - Rejections are caught here, so the wrapped function can be used
 *     in fire-and-forget patterns like `onClick={() => guard(...)}`
 *     without producing unhandled promise rejections in the browser
 *     console.
 *   - The wrapped function may still re-throw to its own caller chain
 *     (e.g. so a bulk-save flow can short-circuit on failure). The
 *     guard only catches at *its* boundary; the inner call is awaited.
 *
 * Returns a tuple of [submitting flag, guarded callback]. Consumers
 * pass `submitting` to `disabled` props on the buttons that fire the
 * action so the entire group locks during the in-flight window.
 *
 * @example
 *   const [submitting, guardedUpdate] = useGuardedUpdate(handleUpdateField)
 *   <Button disabled={submitting} onClick={() => { void guardedUpdate({...}) }}>
 *
 * @param updateFn The async function to guard. Stable identity is
 *   not required -- the returned callback re-creates whenever
 *   `updateFn` changes, which is fine because consumers don't
 *   memoize on the callback's identity.
 */
export function useGuardedUpdate<TArg>(
  updateFn: (arg: TArg) => Promise<void>,
): readonly [boolean, (arg: TArg) => Promise<void>] {
  const [submitting, setSubmitting] = useState(false)

  const guardedUpdate = useCallback(
    async (arg: TArg) => {
      if (submitting) return
      setSubmitting(true)
      try {
        await updateFn(arg)
      } catch {
        /* updateFn already surfaced the error to the user (toast etc.);
           the guard's job is to consume the rejection so a fire-and-
           forget caller doesn't produce an unhandled rejection. */
      } finally {
        setSubmitting(false)
      }
    },
    [submitting, updateFn],
  )

  return [submitting, guardedUpdate] as const
}
