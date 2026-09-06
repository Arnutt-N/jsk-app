// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UserMenu from '../UserMenu';

const logoutMock = vi.fn();
const userMock = {
  id: '1',
  username: 'admin',
  display_name: 'Administrator',
  role: 'ADMIN',
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: userMock, logout: logoutMock }),
}));

vi.mock('@/components/providers', () => ({
  useTheme: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/components/admin/AdminLanguageToggle', () => ({
  AdminLanguageToggle: () => null,
}));

describe('UserMenu — logout confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openMenu() {
    render(<UserMenu />);
    fireEvent.click(screen.getByLabelText('Open profile menu'));
    return screen.getByRole('menuitem', { name: /ออกจากระบบ/ });
  }

  it('opens the confirmation dialog instead of logging out immediately', () => {
    const item = openMenu();
    fireEvent.click(item);

    expect(screen.getByText('ต้องการออกจากระบบหรือไม่?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('ยกเลิก closes the dialog and keeps the session', () => {
    const item = openMenu();
    fireEvent.click(item);

    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));

    expect(screen.queryByText('ต้องการออกจากระบบหรือไม่?')).not.toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('ยืนยัน logs out exactly once', async () => {
    const item = openMenu();
    fireEvent.click(item);

    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
  });
});
