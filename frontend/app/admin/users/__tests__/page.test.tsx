// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UsersPage from '../page';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', role: 'SUPER_ADMIN' } }),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-error', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const user = {
  id: 2,
  username: 'agent2',
  email: 'agent2@example.com',
  display_name: 'Agent Two',
  picture_url: null,
  role: 'AGENT',
  is_active: true,
  line_user_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('UsersPage filters and create defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({
          ok: true,
          data: { total: 1, active: 1, inactive: 0, super_admins: 1, admins: 0, agents: 1, users: 0 },
        });
      }
      return Promise.resolve({ ok: true, data: { users: [user], total: 1, page: 1, per_page: 20, total_pages: 1 } });
    });
  });

  it('defaults the create role to AGENT even when SUPER_ADMIN is first in the allowed list', async () => {
    const userEventSetup = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText('Agent Two');

    await userEventSetup.click(screen.getByRole('button', { name: 'เพิ่มผู้ใช้ใหม่' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox')).toHaveValue('AGENT');
  });

  it('shows clear-filter only when a filter is active and clears search, role, and status', async () => {
    render(<UsersPage />);
    await screen.findByText('Agent Two');

    expect(screen.queryByRole('button', { name: 'ล้างตัวกรอง' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อ, ชื่อผู้ใช้, อีเมล...'), { target: { value: 'agent' } });
    const [roleSelect, statusSelect] = screen.getAllByRole('combobox');
    fireEvent.change(roleSelect, { target: { value: 'AGENT' } });
    fireEvent.change(statusSelect, { target: { value: 'true' } });

    const clearBtn = await screen.findByRole('button', { name: 'ล้างตัวกรอง' });
    await userEvent.setup().click(clearBtn);

    expect(screen.getByPlaceholderText('ค้นหาชื่อ, ชื่อผู้ใช้, อีเมล...')).toHaveValue('');
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('');
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'ล้างตัวกรอง' })).not.toBeInTheDocument();

    await waitFor(() => {
      const lastUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastUrl).not.toContain('search=');
      expect(lastUrl).not.toContain('role=');
      expect(lastUrl).not.toContain('is_active=');
      expect(lastUrl).toContain('page=1');
    });
  });

  it('navigates edit button to detail page with edit mode', async () => {
    const userEventSetup = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText('Agent Two');

    await userEventSetup.click(screen.getByRole('button', { name: 'แก้ไข' }));
    expect(mockPush).toHaveBeenCalledWith('/admin/users/2?mode=edit');
  });
});
