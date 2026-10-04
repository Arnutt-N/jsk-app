// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminRequestList from '../page';
import { isoToYMD } from '@/lib/utils';

vi.mock('@/components/ui/CalendarPickerTH', () => ({
  default: function MockCalendarPicker({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (val: string | null) => void;
    ariaLabel?: string;
  }) {
    return (
      <input
        type="date"
        aria-label={ariaLabel || 'วันที่'}
        value={value ? isoToYMD(value) : ''}
        onChange={(e) => {
          const val = e.target.value;
          if (!val) {
            onChange(null);
          } else {
            const d = new Date(`${val}T00:00:00`);
            onChange(!isNaN(d.getTime()) ? d.toISOString() : null);
          }
        }}
      />
    );
  },
}));

vi.mock('@/lib/permissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    isAdmin: true,
    userRole: 'SUPER_ADMIN',
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-error', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('AdminRequestList date filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      data: [
        {
          id: '1',
          firstname: 'สมชาย',
          lastname: 'ใจดี',
          topic_category: 'กองทุนยุติธรรม',
          status: 'PENDING',
          agency: 'สบท.',
          province: 'กรุงเทพฯ',
          district: 'ดุสิต',
          created_at: '2026-09-03T07:44:00+07:00',
        },
      ],
    });
  });

  it('renders the requests table and date filter inputs', async () => {
    render(<AdminRequestList />);
    expect(await screen.findByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(screen.getByLabelText('จากวันที่')).toBeInTheDocument();
    expect(screen.getByLabelText('ถึงวันที่')).toBeInTheDocument();
  });

  it('queries backend with start_date and end_date params', async () => {
    render(<AdminRequestList />);
    await screen.findByText('สมชาย ใจดี');

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-03' } });

    await waitFor(() => {
      const lastCallUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastCallUrl).toContain('start_date=2026-09-01');
      expect(lastCallUrl).toContain('end_date=2026-09-03');
    });
  });

  it('displays localized Thai error when start_date > end_date', async () => {
    render(<AdminRequestList />);
    await screen.findByText('สมชาย ใจดี');

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-05' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-01' } });

    expect(await screen.findByText('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด')).toBeInTheDocument();
  });

  it('clears date inputs and refetches when "ล้างวันที่" is clicked', async () => {
    const user = userEvent.setup();
    render(<AdminRequestList />);
    await screen.findByText('สมชาย ใจดี');

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
    const clearBtn = await screen.findByRole('button', { name: 'ล้างวันที่' });
    await user.click(clearBtn);

    await waitFor(() => {
      const lastCallUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastCallUrl).not.toContain('start_date=');
    });
  });
});

describe('AdminRequestList pagination (R3-H2)', () => {
  const row = (i: number) => ({
    id: String(i),
    firstname: 'A',
    lastname: String(i),
    topic_category: 'x',
    status: 'COMPLETED',
    agency: '',
    province: '',
    district: '',
    created_at: '2026-09-03T07:44:00+07:00',
  });
  const fullPage = Array.from({ length: 100 }, (_, i) => row(i));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends skip=0&limit=100 on initial load', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, data: [row(1)] });
    render(<AdminRequestList />);
    await screen.findByText('A 1');
    const firstUrl = mockApiFetch.mock.calls[0][0];
    expect(firstUrl).toContain('skip=0');
    expect(firstUrl).toContain('limit=100');
  });

  it('next page sends skip=100 and prev returns to skip=0', { timeout: 30000 }, async () => {
    mockApiFetch.mockResolvedValue({ ok: true, data: fullPage });
    render(<AdminRequestList />);
    await screen.findByText('A 0');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      const lastUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastUrl).toContain('skip=100');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => {
      const lastUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastUrl).toContain('skip=0');
    });
  });

  it('disables Next on a short page and Previous on page one', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, data: [row(1)] });
    render(<AdminRequestList />);
    await screen.findByText('A 1');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('resets to page one when filters change', { timeout: 30000 }, async () => {
    mockApiFetch.mockResolvedValue({ ok: true, data: fullPage });
    render(<AdminRequestList />);
    await screen.findByText('A 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      const lastUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastUrl).toContain('skip=100');
    });

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
    await waitFor(() => {
      const lastUrl = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1][0];
      expect(lastUrl).toContain('skip=0');
    });
  });
});
