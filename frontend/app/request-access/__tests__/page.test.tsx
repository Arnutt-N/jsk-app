// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RequestAccessPage from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

describe('Request access form', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('warns when required fields are empty', async () => {
    render(<RequestAccessPage />);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำขอใช้งาน' }));
    expect(await screen.findByText('กรุณากรอกชื่อที่แสดงและชื่อผู้ใช้ที่ต้องการ')).toBeTruthy();
  });

  it('submits the request and shows the waiting message', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<RequestAccessPage />);
    fireEvent.change(screen.getByPlaceholderText('เช่น สมหญิง ใจดี'), { target: { value: 'สมหญิง ใจดี' } });
    fireEvent.change(screen.getByPlaceholderText(/somying01/), { target: { value: 'somying01' } });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำขอใช้งาน' }));
    await waitFor(() => expect(screen.getByText('ส่งคำขอแล้ว รอแอดมินอนุมัติ')).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/request-access',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
