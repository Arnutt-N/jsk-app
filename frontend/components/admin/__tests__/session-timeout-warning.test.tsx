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

/**
 * The idle-session warning must use shared dialog semantics: a real
 * dialog role with an accessible name, and every dismiss path must
 * extend the session (there is no dismiss-without-extend path).
 */
describe('SessionTimeoutWarning dialog semantics', () => {
  it('renders as a named dialog with the countdown', () => {
    render(<SessionTimeoutWarning />);

    const dialog = screen.getByRole('dialog', { name: 'Session Expiring Soon' });
    expect(dialog).toBeTruthy();
    // Countdown appears twice: Modal description (aria-describedby) + body.
    expect(screen.getAllByText(/2:05/).length).toBeGreaterThanOrEqual(1);
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
