// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: false,
    isLoading: false,
  }),
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

describe('Login form error ARIA wiring (R3-L2)', () => {
  it('wires both error messages to their inputs', async () => {
    const { container } = render(<LoginPage />);

    fireEvent.change(container.querySelector('#username')!, { target: { value: '' } });
    fireEvent.change(container.querySelector('#password')!, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    await waitFor(() => {
      expect(screen.getByText('กรุณากรอกชื่อผู้ใช้')).toBeTruthy();
      expect(screen.getByText('กรุณากรอกรหัสผ่าน')).toBeTruthy();
    });

    const username = container.querySelector('#username')!;
    const password = container.querySelector('#password')!;
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(username.getAttribute('aria-describedby')).toBe('username-error');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(password.getAttribute('aria-describedby')).toBe('password-error');

    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(2);
    expect(container.querySelector('#username-error')).not.toBeNull();
    expect(container.querySelector('#password-error')).not.toBeNull();
  });

  it('clears the wiring when the field becomes valid', async () => {
    const { container } = render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    await waitFor(() => {
      expect(screen.getByText('กรุณากรอกชื่อผู้ใช้')).toBeTruthy();
    });

    fireEvent.change(container.querySelector('#username')!, { target: { value: 'admin' } });
    fireEvent.change(container.querySelector('#password')!, { target: { value: 'secret' } });
    fireEvent.input(container.querySelector('#username')!);
    fireEvent.input(container.querySelector('#password')!);

    await waitFor(() => {
      expect(screen.queryByText('กรุณากรอกชื่อผู้ใช้')).toBeNull();
      expect(screen.queryByText('กรุณากรอกรหัสผ่าน')).toBeNull();
    });
    expect(container.querySelector('#username')!.getAttribute('aria-invalid')).toBe('false');
    // aria-describedby={undefined} renders no attribute at all.
    expect(container.querySelector('#username')!.hasAttribute('aria-describedby')).toBe(false);
  });
});
