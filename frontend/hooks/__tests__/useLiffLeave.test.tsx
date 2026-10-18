// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLiffLeave } from '../useLiffLeave'

function stubLiff(isInClient: boolean, closeWindow?: () => void) {
  vi.stubGlobal('liff', {
    isInClient: vi.fn(() => isInClient),
    closeWindow: closeWindow ?? vi.fn(),
  })
}

beforeEach(() => {
  vi.stubGlobal('liff', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLiffLeave', () => {
  it('starts closed', () => {
    stubLiff(true)
    const { result } = renderHook(() => useLiffLeave())
    expect(result.current.leaveOpen).toBe(false)
  })

  it('opens on request and closes on cancel', () => {
    stubLiff(true)
    const { result } = renderHook(() => useLiffLeave())
    act(() => result.current.requestLeave())
    expect(result.current.leaveOpen).toBe(true)
    act(() => result.current.cancelLeave())
    expect(result.current.leaveOpen).toBe(false)
  })

  it('closes the LIFF window on confirm inside the client', () => {
    const closeWindow = vi.fn()
    stubLiff(true, closeWindow)
    const { result } = renderHook(() => useLiffLeave())
    act(() => result.current.requestLeave())
    act(() => result.current.confirmLeave())
    expect(result.current.leaveOpen).toBe(false)
    expect(closeWindow).toHaveBeenCalled()
  })

  it('leaves the dialog closed with no close attempt outside the client', () => {
    const closeWindow = vi.fn()
    stubLiff(false, closeWindow)
    const { result } = renderHook(() => useLiffLeave())
    act(() => result.current.requestLeave())
    act(() => result.current.confirmLeave())
    expect(result.current.leaveOpen).toBe(false)
    expect(closeWindow).not.toHaveBeenCalled()
  })
})
