// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

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

describe('SessionTimeoutWarning dialog semantics', () => {
  it('renders as a named dialog with the countdown', () => {
    render(<SessionTimeoutWarning />);

    const dialog = screen.getByRole('dialog', { name: 'Session Expiring Soon' });
    expect(dialog).toBeTruthy();
    expect(screen.getAllByText(/2:05/)).toHaveLength(2);
  });

  it('Escape extends the session instead of silently dismissing', () => {
    render(<SessionTimeoutWarning />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockExtendSession).toHaveBeenCalled();
  });

  it('Stay Logged In extends the session', () => {
    render(<SessionTimeoutWarning />);

    fireEvent.click(screen.getByRole('button', { name: 'Stay Logged In' }));
    expect(mockExtendSession).toHaveBeenCalled();
  });
});
