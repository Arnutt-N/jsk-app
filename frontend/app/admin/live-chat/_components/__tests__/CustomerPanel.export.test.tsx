import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomerPanel } from '../CustomerPanel';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock('../../_context/LiveChatContext', () => ({
  useLiveChatContext: () => ({
    fetchChatDetail: vi.fn(),
    fetchConversations: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCustomerNotes', () => ({
  useCustomerNotes: () => ({ notes: '', setNotes: vi.fn(), saved: false }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

// D1: CustomerPanel reads useAuth().user.role for ID masking — mock the provider.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'ADMIN' } }),
}));

describe('CustomerPanel export failure toast', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mocks.toast.mockClear();
  });

  it('toasts the server detail when PDF export returns 413', async () => {
    const resp413 = new Response(
      JSON.stringify({ detail: 'Conversation too large' }),
      { status: 413, headers: { 'content-type': 'application/json' } },
    );
    const fetchMock = vi.fn().mockResolvedValue(resp413);
    global.fetch = fetchMock;

    render(
      <CustomerPanel
        currentChat={{
          line_user_id: 'U1',
          display_name: 'T',
          picture_url: '',
          friend_status: 'active',
          chat_mode: 'HUMAN',
          unread_count: 0,
        }}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/export/conversations/U1/pdf',
    );
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Export ล้มเหลว',
      description: 'Conversation too large',
      variant: 'error',
    });
  });
});
