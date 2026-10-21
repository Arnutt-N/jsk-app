// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetPasswordPage from '../page';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams('?token=abc123tokenvalue'),
}));
vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

describe('Reset password form', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    replaceMock.mockClear();
  });

  it('warns when the two passwords do not match', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('อย่างน้อย 8 ตัวอักษร'), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByPlaceholderText('พิมพ์รหัสผ่านใหม่อีกครั้ง'), { target: { value: 'different9' } });
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' }));
    expect(await screen.findByText('รหัสผ่านทั้งสองช่องไม่ตรงกัน')).toBeTruthy();
  });

  it('posts the token with the new password and returns to login', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('อย่างน้อย 8 ตัวอักษร'), { target: { value: 'newpass12' } });
    fireEvent.change(screen.getByPlaceholderText('พิมพ์รหัสผ่านใหม่อีกครั้ง'), { target: { value: 'newpass12' } });
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'abc123tokenvalue', new_password: 'newpass12' }),
      }))
    );
  });
});
