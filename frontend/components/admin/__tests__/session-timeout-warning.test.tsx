// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const mockExtendSession = vi.fn();
const mockLogout = vi.fn();

vi.mock('@/hooks/useSessionTimeout', () => ({
  useSessionTimeout: () => ({
    showWarning: true,
    remainingTime: 125,
    extendSession: mockExtendSession,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

import { SessionTimeoutWarning } from '../SessionTimeoutWarning';

beforeEach(() => {
  mockExtendSession.mockClear();
  mockLogout.mockClear();
});

describe('SessionTimeoutWarning dialog semantics', () => {
  it('renders as a named dialog with the countdown shown once', () => {
    render(<SessionTimeoutWarning />);

    expect(screen.getByRole('dialog', { name: 'Session Expiring Soon' })).toBeTruthy();
    expect(screen.getAllByText(/2:05/)).toHaveLength(1);
    expect(mockExtendSession).not.toHaveBeenCalled();
  });

  it('ignores Escape and a backdrop tap so a stray key cannot renew the session', () => {
    render(<SessionTimeoutWarning />);

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(mockExtendSession).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Session Expiring Soon' })).toBeTruthy();
  });

  it('Stay Logged In extends the session', () => {
    render(<SessionTimeoutWarning />);

    fireEvent.click(screen.getByRole('button', { name: 'Stay Logged In' }));
    expect(mockExtendSession).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('Logout signs out instead of extending', () => {
    render(<SessionTimeoutWarning />);

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockExtendSession).not.toHaveBeenCalled();
  });
});
