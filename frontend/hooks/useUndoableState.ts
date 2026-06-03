'use client'

import { useCallback, useState } from 'react'

/**
 * Undo/redo controls returned alongside the current value.
 */
export interface UndoRedoControls<T> {
  /** Revert to the previous value. No-op if history is empty. */
  undo: () => void
  /** Re-apply a value that was undone. No-op if future stack is empty. */
  redo: () => void
  /** Whether undo is available (past stack is non-empty). */
  canUndo: boolean
  /** Whether redo is available (future stack is non-empty). */
  canRedo: boolean
  /**
   * Set a new baseline value and clear both history stacks.
   * Use this when syncing fresh state from the server.
   */
  reset: (value?: T) => void
  /** Keep current value but clear undo/redo history. */
  clearHistory: () => void
}

const DEFAULT_MAX_HISTORY = 50

/**
 * Drop-in replacement for `useState` with undo/redo history.
 *
 * @example
 *   const [form, setForm, { undo, redo, canUndo, canRedo, reset }] =
 *     useUndoableState({ status: '', priority: '' })
 *
 *   // Keyboard shortcuts (add in your component):
 *   useEffect(() => {
 *     const handler = (e: KeyboardEvent) => {
 *       if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
 *       if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey)  { e.preventDefault(); redo() }
 *     }
 *     window.addEventListener('keydown', handler)
 *     return () => window.removeEventListener('keydown', handler)
 *   }, [undo, redo])
 *
 * @param initialValue The initial state value.
 * @param maxHistory Maximum number of undo steps to keep (default 50).
 */
export function useUndoableState<T>(
  initialValue: T,
  maxHistory: number = DEFAULT_MAX_HISTORY,
): [T, (newValue: T | ((prev: T) => T)) => void, UndoRedoControls<T>] {
  const [value, setValueRaw] = useState<T>(initialValue)
  const [past, setPast] = useState<T[]>([])
  const [future, setFuture] = useState<T[]>([])

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValueRaw((current) => {
        const resolved = typeof newValue === 'function'
          ? (newValue as (prev: T) => T)(current)
          : newValue
        setPast((prev) => [...prev.slice(-(maxHistory - 1)), current])
        setFuture([])
        return resolved
      })
    },
    [maxHistory],
  )

  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast
      const previous = prevPast[prevPast.length - 1]
      const newPast = prevPast.slice(0, -1)
      setValueRaw((current) => {
        setFuture((prevFuture) => [...prevFuture, current])
        return previous
      })
      return newPast
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture
      const next = prevFuture[prevFuture.length - 1]
      const newFuture = prevFuture.slice(0, -1)
      setValueRaw((current) => {
        setPast((prevPast) => [...prevPast, current])
        return next
      })
      return newFuture
    })
  }, [])

  const reset = useCallback(
    (newValue?: T) => {
      setPast([])
      setFuture([])
      if (newValue !== undefined) {
        setValueRaw(newValue)
      }
    },
    [],
  )

  const clearHistory = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  return [
    value,
    setValue,
    { undo, redo, canUndo, canRedo, reset, clearHistory },
  ]
}
