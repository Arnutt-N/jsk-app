import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoableState } from '../useUndoableState'

describe('useUndoableState', () => {
  it('should initialize with the given value and empty history', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))
    const [value, , controls] = result.current

    expect(value).toEqual({ count: 0 })
    expect(controls.canUndo).toBe(false)
    expect(controls.canRedo).toBe(false)
  })

  it('should update value and allow undo', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))

    act(() => {
      result.current[1]({ count: 1 })
    })

    expect(result.current[0]).toEqual({ count: 1 })
    expect(result.current[2].canUndo).toBe(true)
    expect(result.current[2].canRedo).toBe(false)

    act(() => {
      result.current[2].undo()
    })

    expect(result.current[0]).toEqual({ count: 0 })
    expect(result.current[2].canUndo).toBe(false)
    expect(result.current[2].canRedo).toBe(true)
  })

  it('should allow redo after undo', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))

    act(() => {
      result.current[1]({ count: 1 })
      result.current[1]({ count: 2 })
    })

    act(() => {
      result.current[2].undo()
      result.current[2].undo()
    })

    expect(result.current[0]).toEqual({ count: 0 })
    expect(result.current[2].canRedo).toBe(true)

    act(() => {
      result.current[2].redo()
    })

    expect(result.current[0]).toEqual({ count: 1 })
  })

  it('should clear future stack when a new value is set after undo', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))

    act(() => {
      result.current[1]({ count: 1 })
    })
    act(() => {
      result.current[1]({ count: 2 })
    })
    act(() => {
      result.current[2].undo() // Back to 1
    })

    expect(result.current[0]).toEqual({ count: 1 })
    expect(result.current[2].canRedo).toBe(true)

    act(() => {
      result.current[1]({ count: 3 }) // New value, clears future
    })

    expect(result.current[0]).toEqual({ count: 3 })
    expect(result.current[2].canRedo).toBe(false)
  })

  it('should reset state and clear history', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))

    act(() => {
      result.current[1]({ count: 1 })
      result.current[1]({ count: 2 })
    })

    act(() => {
      result.current[2].reset({ count: 99 })
    })

    expect(result.current[0]).toEqual({ count: 99 })
    expect(result.current[2].canUndo).toBe(false)
    expect(result.current[2].canRedo).toBe(false)
  })

  it('should clear history without changing current value', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))

    act(() => {
      result.current[1]({ count: 1 })
    })

    act(() => {
      result.current[2].clearHistory()
    })

    expect(result.current[0]).toEqual({ count: 1 })
    expect(result.current[2].canUndo).toBe(false)
    expect(result.current[2].canRedo).toBe(false)
  })

  it('should respect maxHistory limit', () => {
    const { result } = renderHook(() => useUndoableState(0, 3)) // maxHistory = 3

    act(() => {
      result.current[1](1)
      result.current[1](2)
      result.current[1](3)
      result.current[1](4)
    })

    // Should only be able to undo 3 times (back to 1)
    act(() => {
      result.current[2].undo() // 3
      result.current[2].undo() // 2
      result.current[2].undo() // 1
    })

    expect(result.current[0]).toBe(1)
    expect(result.current[2].canUndo).toBe(false)
  })

  it('should work with functional updates', () => {
    const { result } = renderHook(() => useUndoableState({ count: 0 }))

    act(() => {
      result.current[1](prev => ({ count: prev.count + 1 }))
    })

    expect(result.current[0]).toEqual({ count: 1 })

    act(() => {
      result.current[2].undo()
    })

    expect(result.current[0]).toEqual({ count: 0 })
  })
})