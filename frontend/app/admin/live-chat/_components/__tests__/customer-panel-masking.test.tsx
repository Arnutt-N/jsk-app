import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomerPanel } from '../CustomerPanel';
import { maskLineUserId } from '@/lib/mask';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  notesMock: vi.fn(),
  role: 'AGENT',
}));

vi.mock('../../_context/LiveChatContext', () => ({
  useLiveChatContext: () => ({
    fetchChatDetail: vi.fn(),
    fetchConversations: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCustomerNotes', () => ({
  useCustomerNotes: (id: string | null) => {
    mocks.notesMock(id);
    return { notes: '', setNotes: vi.fn(), saved: true };
  },
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: mocks.role } }),
}));

const CHAT_ID = 'U4af4980abcdef1234567890abcdef98ab';

function renderPanel() {
  render(
    <CustomerPanel
      currentChat={{
        line_user_id: CHAT_ID,
        display_name: 'T',
        picture_url: '',
        friend_status: 'active',
        chat_mode: 'HUMAN',
        unread_count: 0,
      }}
      onClose={() => {}}
    />,
  );
}

describe('CustomerPanel role-aware ID display (D1)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mocks.toast.mockClear();
    mocks.notesMock.mockClear();
  });

  it('shows the full ID to ADMIN and passes the raw key to functions', async () => {
    mocks.role = 'ADMIN';
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock;

    renderPanel();

    expect(screen.getByText(CHAT_ID)).toBeTruthy();
    expect(mocks.notesMock).toHaveBeenCalledWith(CHAT_ID);

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0] as string).toContain(CHAT_ID);
  });

  it('masks the ID for AGENT while functions still use the raw key', () => {
    mocks.role = 'AGENT';
    renderPanel();

    expect(screen.getByText(maskLineUserId(CHAT_ID))).toBeTruthy();
    expect(screen.queryByText(CHAT_ID)).toBeNull();
    expect(mocks.notesMock).toHaveBeenCalledWith(CHAT_ID);
  });
});
