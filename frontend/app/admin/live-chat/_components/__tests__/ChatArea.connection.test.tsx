import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLiveChatStore } from '../../_store/liveChatStore';
import { ChatArea } from '../ChatArea';

const mocks = vi.hoisted(() => ({
  reconnect: vi.fn(),
}));

vi.mock('../../_context/LiveChatContext', () => ({
  useLiveChatContext: () => ({
    wsStatus: 'failed',
    isMobileView: false,
    typingUsersCount: 0,
    focusedMessageId: null,
    clearFocusedMessage: vi.fn(),
    isHumanMode: false,
    currentUserId: 1,
    onlineOperators: [],
    getClaimContender: vi.fn(),
    sendMessage: vi.fn(),
    sendMedia: vi.fn(),
    claimSession: vi.fn(),
    closeSession: vi.fn(),
    transferSession: vi.fn(),
    toggleMode: vi.fn(),
    setInputText: vi.fn(),
    setShowTransferDialog: vi.fn(),
    setShowCannedPicker: vi.fn(),
    setShowCustomerPanel: vi.fn(),
    setSoundEnabled: vi.fn(),
    startTyping: vi.fn(),
    loadOlderMessages: vi.fn(),
    retryMessage: vi.fn(),
    reconnect: mocks.reconnect,
    selectConversation: vi.fn(),
  }),
}));

vi.mock('../../_hooks/useVirtualScroll', () => ({
  useVirtualScroll: () => ({
    containerRef: { current: null },
    sentinelRef: { current: null },
    onScroll: vi.fn(),
    virtualEnabled: false,
    visibleWindow: { startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 },
    setForceAllMessages: vi.fn(),
    baselineCount: 0,
  }),
}));

vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('../ProfileDropdown', () => ({ ProfileDropdown: () => null }));
vi.mock('../ChatHeader', () => ({ ChatHeader: () => null }));
vi.mock('../MessageInput', () => ({ MessageInput: () => null }));

describe('ChatArea terminal connection failure', () => {
  beforeEach(() => {
    mocks.reconnect.mockClear();
    useLiveChatStore.setState({
      conversations: [],
      selectedId: null,
      currentChat: null,
      messages: [],
      initialUnreadCount: 0,
      firstUnreadMessageId: null,
    });
  });

  it('offers retry when no conversation is selected', () => {
    render(<ChatArea />);

    fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(mocks.reconnect).toHaveBeenCalledTimes(1);
  });

  it('offers retry when a conversation is selected', () => {
    useLiveChatStore.setState({
      selectedId: 'U1',
      currentChat: {
        line_user_id: 'U1',
        display_name: 'User U1',
        picture_url: '',
        friend_status: 'ACTIVE',
        chat_mode: 'BOT',
        unread_count: 0,
        messages: [],
      },
    });

    render(<ChatArea />);

    fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(mocks.reconnect).toHaveBeenCalledTimes(1);
  });
});
