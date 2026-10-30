import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * F-014: a retry must be bound to the room its message came from.
 *
 * `retryMessage(tempId)` re-sent whatever was in the pending map with no room
 * guard, while every sibling action early-returns when `currentRoom` is null.
 * So after switching conversations, retrying a message from the previous room
 * delivered its text into the NEW conversation — a cross-customer leak that
 * looks like a normal send.
 *
 * `leaveRoom` cleared the room but not the pending map, which is what made a
 * stale entry reachable at all.
 */

const sendMock = vi.fn()

vi.mock('../useWebSocket', () => ({
  useWebSocket: () => ({
    send: sendMock,
    connectionState: 'connected',
    isConnected: true,
    reconnect: vi.fn(),
  }),
}))

// Imported after the mock so the hook binds to the fake transport.
import { useLiveChatSocket } from '../useLiveChatSocket'

const ROOM_A = 'Uaaaa'
const ROOM_B = 'Ubbbb'

function setup() {
  return renderHook(() => useLiveChatSocket({ adminId: '1' }))
}

describe('useLiveChatSocket retry room binding (F-014)', () => {
  beforeEach(() => {
    sendMock.mockReset()
    sendMock.mockReturnValue(true)
  })

  it('retries into the room the message was sent from', () => {
    const { result } = setup()

    act(() => result.current.joinRoom(ROOM_A))
    act(() => {
      result.current.sendMessage('hello A', 'temp-1')
    })

    sendMock.mockClear()

    let dispatched = false
    act(() => {
      dispatched = result.current.retryMessage('temp-1')
    })

    expect(dispatched).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [, payload] = sendMock.mock.calls[0]
    expect(payload).toMatchObject({ text: 'hello A', temp_id: 'temp-1' })
  })

  it('refuses to retry a message after switching to another room', () => {
    const { result } = setup()

    act(() => result.current.joinRoom(ROOM_A))
    act(() => {
      result.current.sendMessage('secret for A', 'temp-1')
    })

    // Switch conversations — the pending entry belongs to A, not B.
    act(() => result.current.leaveRoom())
    act(() => result.current.joinRoom(ROOM_B))

    sendMock.mockClear()

    let dispatched = true
    act(() => {
      dispatched = result.current.retryMessage('temp-1')
    })

    expect(dispatched).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does not retry after leaveRoom leaves us with no room at all', () => {
    const { result } = setup()

    act(() => result.current.joinRoom(ROOM_A))
    act(() => {
      result.current.sendMessage('orphan', 'temp-1')
    })
    act(() => result.current.leaveRoom())

    sendMock.mockClear()

    let dispatched = true
    act(() => {
      dispatched = result.current.retryMessage('temp-1')
    })

    expect(dispatched).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('prunes pending messages on room switch so a later retry cannot fire', () => {
    const { result } = setup()

    act(() => result.current.joinRoom(ROOM_A))
    act(() => {
      result.current.sendMessage('from A', 'temp-1')
    })
    act(() => result.current.leaveRoom())

    // Back into A: the earlier pending entry was for a conversation the user
    // already left, so it must not be retryable any more.
    act(() => result.current.joinRoom(ROOM_A))

    sendMock.mockClear()
    let dispatched = true
    act(() => {
      dispatched = result.current.retryMessage('temp-1')
    })

    expect(dispatched).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('still caps retries at three within the same room', () => {
    const { result } = setup()

    act(() => result.current.joinRoom(ROOM_A))
    act(() => {
      result.current.sendMessage('flaky', 'temp-1')
    })

    for (let i = 0; i < 3; i += 1) {
      act(() => {
        result.current.retryMessage('temp-1')
      })
    }

    sendMock.mockClear()
    let dispatched = true
    act(() => {
      dispatched = result.current.retryMessage('temp-1')
    })

    expect(dispatched).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does not consume a retry when the frame never left the socket', () => {
    const { result } = setup()

    act(() => result.current.joinRoom(ROOM_A))
    act(() => {
      result.current.sendMessage('flaky', 'temp-1')
    })

    sendMock.mockReturnValue(false)  // dispatch fails
    act(() => {
      result.current.retryMessage('temp-1')
    })

    sendMock.mockReturnValue(true)
    sendMock.mockClear()
    let dispatched = false
    act(() => {
      dispatched = result.current.retryMessage('temp-1')
    })

    expect(dispatched).toBe(true)
  })
})
