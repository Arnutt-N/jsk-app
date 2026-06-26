import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConversationItem } from '../ConversationItem';
import type { Conversation } from '../../_types';

const waitingConversation: Conversation = {
  line_user_id: 'U123456789',
  display_name: 'ทดสอบ ผู้ใช้',
  picture_url: '',
  friend_status: 'follow',
  chat_mode: 'HUMAN',
  session: { id: 1, status: 'WAITING' },
  last_message: { content: 'สวัสดีครับ', created_at: '2026-06-27T00:00:00.000Z' },
  unread_count: 0,
  tags: [],
};

describe('ConversationItem a11y', () => {
  it('role="option" has an accessible name containing the status label กำลังรอ', () => {
    render(
      <ConversationItem
        optionId="conv-1"
        conversation={waitingConversation}
        selected={false}
        formattedTime="10:00"
        onClick={vi.fn()}
        onMenuClick={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/กำลังรอ/);
  });

  it('accessible name includes display_name', () => {
    render(
      <ConversationItem
        optionId="conv-2"
        conversation={waitingConversation}
        selected={false}
        onClick={vi.fn()}
        onMenuClick={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/ทดสอบ ผู้ใช้/);
  });

  it('accessible name includes unread count when unread_count > 0', () => {
    const unreadConversation: Conversation = {
      ...waitingConversation,
      unread_count: 3,
    };

    render(
      <ConversationItem
        optionId="conv-3"
        conversation={unreadConversation}
        selected={false}
        onClick={vi.fn()}
        onMenuClick={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/3 ข้อความใหม่/);
  });

  it('accessible name does not include unread text when unread_count is 0', () => {
    render(
      <ConversationItem
        optionId="conv-4"
        conversation={waitingConversation}
        selected={false}
        onClick={vi.fn()}
        onMenuClick={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).not.toHaveAccessibleName(/ข้อความใหม่/);
  });

  it('ACTIVE conversation has accessible name containing ออนไลน์', () => {
    const activeConversation: Conversation = {
      ...waitingConversation,
      session: { id: 2, status: 'ACTIVE' },
    };

    render(
      <ConversationItem
        optionId="conv-5"
        conversation={activeConversation}
        selected={false}
        onClick={vi.fn()}
        onMenuClick={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/ออนไลน์/);
  });

  it('no-session conversation has accessible name containing ออฟไลน์', () => {
    const offlineConversation: Conversation = {
      ...waitingConversation,
      session: undefined,
    };

    render(
      <ConversationItem
        optionId="conv-6"
        conversation={offlineConversation}
        selected={false}
        onClick={vi.fn()}
        onMenuClick={vi.fn()}
        onMarkRead={vi.fn()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/ออฟไลน์/);
  });
});
