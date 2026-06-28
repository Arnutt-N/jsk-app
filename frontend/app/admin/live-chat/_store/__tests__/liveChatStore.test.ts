import { describe, it, expect, beforeEach } from 'vitest'
import { useLiveChatStore } from '../liveChatStore'
import type { Message } from '@/lib/websocket/types'
import type { Conversation, CurrentChat } from '../../_types'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    line_user_id: 'U123',
    direction: 'INCOMING',
    content: 'hello',
    message_type: 'text',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    line_user_id: 'U001',
    display_name: 'Test User',
    picture_url: '',
    friend_status: 'following',
    chat_mode: 'HUMAN',
    unread_count: 3,
    ...overrides,
  }
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('liveChatStore', () => {
  beforeEach(() => {
    useLiveChatStore.setState({
      liveMessage: '',
      conversations: [],
      messages: [],
      currentChat: null,
    })
  })

  describe('addMessage — liveMessage', () => {
    it('sets liveMessage on INCOMING message using operator_name', () => {
      const msg = makeMessage({ direction: 'INCOMING', operator_name: 'Somchai' })
      useLiveChatStore.getState().addMessage(msg)
      expect(useLiveChatStore.getState().liveMessage).toContain('Somchai')
    })

    it('sets liveMessage on INCOMING using currentChat.display_name when operator_name absent', () => {
      useLiveChatStore.setState({
        currentChat: makeConversation({ display_name: 'Alice' }) as CurrentChat,
      })
      const msg = makeMessage({ direction: 'INCOMING', operator_name: undefined })
      useLiveChatStore.getState().addMessage(msg)
      expect(useLiveChatStore.getState().liveMessage).toContain('Alice')
    })

    it('falls back to "ผู้ใช้" when both operator_name and currentChat are absent', () => {
      const msg = makeMessage({ direction: 'INCOMING', operator_name: undefined })
      useLiveChatStore.getState().addMessage(msg)
      expect(useLiveChatStore.getState().liveMessage).toContain('ผู้ใช้')
    })

    it('does NOT change liveMessage on OUTGOING message', () => {
      useLiveChatStore.setState({ liveMessage: 'previous value' })
      const msg = makeMessage({ direction: 'OUTGOING' })
      useLiveChatStore.getState().addMessage(msg)
      expect(useLiveChatStore.getState().liveMessage).toBe('previous value')
    })
  })

  describe('markRead', () => {
    it('resets unread_count only for the target conversation', () => {
      const conv1 = makeConversation({ line_user_id: 'U001', unread_count: 5 })
      const conv2 = makeConversation({ line_user_id: 'U002', unread_count: 2 })
      useLiveChatStore.setState({ conversations: [conv1, conv2] })

      useLiveChatStore.getState().markRead('U001')

      const { conversations } = useLiveChatStore.getState()
      const result1 = conversations.find((c) => c.line_user_id === 'U001')
      const result2 = conversations.find((c) => c.line_user_id === 'U002')
      expect(result1?.unread_count).toBe(0)
      expect(result2?.unread_count).toBe(2)
    })

    it('does not mutate conversations for a non-existent lineUserId', () => {
      const conv1 = makeConversation({ line_user_id: 'U001', unread_count: 4 })
      useLiveChatStore.setState({ conversations: [conv1] })

      useLiveChatStore.getState().markRead('U999')

      const { conversations } = useLiveChatStore.getState()
      expect(conversations[0].unread_count).toBe(4)
    })
  })
})
