// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForgotPasswordPage from '../page';

vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

describe('Forgot password form', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('warns when the identifier is empty', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์รีเซ็ตรหัสผ่าน' }));
    expect(await screen.findByText('กรุณากรอกชื่อผู้ใช้หรืออีเมล')).toBeTruthy();
  });

  it('always shows the same confirmation (no account reveal)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อผู้ใช้หรืออีเมลของคุณ'), {
      target: { value: 'nobody-here@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์รีเซ็ตรหัสผ่าน' }));
    await waitFor(() =>
      expect(screen.getByText('ถ้ามีบัญชีที่ตรงกัน ระบบส่งลิงก์ไปทางอีเมลแล้ว (ลิงก์ใช้ได้ 30 นาที)')).toBeTruthy()
    );
  });
});
