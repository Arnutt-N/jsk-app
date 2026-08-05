import { fireEvent, render, screen } from '@testing-library/react';
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
  last_user_activity_at: new Date().toISOString(),
  unread_count: 0,
  tags: [],
};

function actionProps() {
  return {
    onSelect: vi.fn(),
    onMenuToggle: vi.fn(),
    onMarkRead: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleSpam: vi.fn(),
    onArchive: vi.fn(),
    onDeleteRequest: vi.fn(),
  };
}

describe('ConversationItem a11y', () => {
  it('role="option" has an accessible name containing the recent activity label ออนไลน์', () => {
    render(
      <ConversationItem
        optionId="conv-1"
        conversation={waitingConversation}
        selected={false}
        formattedTime="10:00"
        {...actionProps()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/ออนไลน์/);
  });

  it('accessible name includes display_name', () => {
    render(
      <ConversationItem
        optionId="conv-2"
        conversation={waitingConversation}
        selected={false}
        {...actionProps()}
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
        {...actionProps()}
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
        {...actionProps()}
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
        {...actionProps()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/ออนไลน์/);
  });

  it('no-session conversation has accessible name containing ออฟไลน์', () => {
    const offlineConversation: Conversation = {
      ...waitingConversation,
      session: undefined,
      last_user_activity_at: undefined,
    };

    render(
      <ConversationItem
        optionId="conv-6"
        conversation={offlineConversation}
        selected={false}
        {...actionProps()}
      />,
    );

    const option = screen.getByRole('option');
    expect(option).toHaveAccessibleName(/ออฟไลน์/);
  });
});

describe('ConversationItem actions menu', () => {
  function openMenu(conversation: Conversation = waitingConversation) {
    const props = actionProps();
    render(
      <ConversationItem
        optionId="conv-menu"
        conversation={conversation}
        selected={false}
        {...props}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Open actions for ทดสอบ ผู้ใช้/ }),
    );
    return props;
  }

  it('renders all wired actions without any coming-soon placeholder', () => {
    openMenu();
    expect(screen.getByText('ดูประวัติแชท')).toBeInTheDocument();
    expect(screen.getByText('ทำเครื่องหมายว่าอ่านแล้ว')).toBeInTheDocument();
    expect(screen.getByText('ปักหมุด')).toBeInTheDocument();
    expect(screen.getByText('ปิดเสียงแจ้งเตือน')).toBeInTheDocument();
    expect(screen.getByText('ทำเครื่องหมายว่าสแปม')).toBeInTheDocument();
    expect(screen.getByText('ซ่อนสนทนา')).toBeInTheDocument();
    expect(screen.getByText('ลบ')).toBeInTheDocument();
    expect(screen.queryByText('เร็ว ๆ นี้')).not.toBeInTheDocument();
  });

  it('mark-as-read menu item calls onMarkRead', () => {
    const props = openMenu();
    fireEvent.click(screen.getByText('ทำเครื่องหมายว่าอ่านแล้ว'));
    expect(props.onMarkRead).toHaveBeenCalledTimes(1);
  });

  it('pin menu item calls onTogglePin with the line user id', () => {
    const props = openMenu();
    fireEvent.click(screen.getByText('ปักหมุด'));
    expect(props.onTogglePin).toHaveBeenCalledWith('U123456789');
  });

  it('shows unpin label when already pinned', () => {
    openMenu({ ...waitingConversation, is_pinned: true });
    expect(screen.getByText('ถอนหมุด')).toBeInTheDocument();
  });

  it('mute menu item calls onToggleMute', () => {
    const props = openMenu();
    fireEvent.click(screen.getByText('ปิดเสียงแจ้งเตือน'));
    expect(props.onToggleMute).toHaveBeenCalledWith('U123456789');
  });

  it('spam menu item calls onToggleSpam', () => {
    const props = openMenu();
    fireEvent.click(screen.getByText('ทำเครื่องหมายว่าสแปม'));
    expect(props.onToggleSpam).toHaveBeenCalledWith('U123456789');
  });

  it('archive is disabled while the session is open', () => {
    const props = openMenu();
    const archiveBtn = screen.getByText('ซ่อนสนทนา').closest('button');
    expect(archiveBtn).toBeDisabled();
    fireEvent.click(screen.getByText('ซ่อนสนทนา'));
    expect(props.onArchive).not.toHaveBeenCalled();
  });

  it('archive is enabled once the session is closed', () => {
    const props = openMenu({ ...waitingConversation, session: { id: 1, status: 'CLOSED' } });
    const archiveBtn = screen.getByText('ซ่อนสนทนา').closest('button');
    expect(archiveBtn).toBeEnabled();
    fireEvent.click(screen.getByText('ซ่อนสนทนา'));
    expect(props.onArchive).toHaveBeenCalledWith('U123456789');
  });

  it('delete menu item requests deletion via onDeleteRequest', () => {
    const props = openMenu();
    fireEvent.click(screen.getByText('ลบ'));
    expect(props.onDeleteRequest).toHaveBeenCalledWith('U123456789');
  });
});
