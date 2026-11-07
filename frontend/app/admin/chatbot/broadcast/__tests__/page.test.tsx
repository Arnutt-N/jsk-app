// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BroadcastListPage from '../page';
import { isoToYMD } from '@/lib/utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

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

const fetchMock = vi.fn();
global.fetch = fetchMock;

const broadcastRow = {
  id: 1,
  title: 'แคมเปญทดสอบ',
  message_type: 'text',
  content: { text: 'สวัสดี' },
  target_audience: 'all',
  target_filter: null,
  scheduled_at: null,
  sent_at: '2026-09-03T07:44:00+07:00',
  status: 'completed',
  total_recipients: 10,
  success_count: 10,
  failure_count: 0,
  created_by: 1,
  created_at: '2026-09-03T07:44:00+07:00',
  updated_at: null,
};

describe('BroadcastListPage date filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [broadcastRow], total: 1 }),
    });
  });

  it('renders the date filter inputs', async () => {
    render(<BroadcastListPage />);
    expect(await screen.findByText('แคมเปญทดสอบ')).toBeInTheDocument();
    expect(screen.getByLabelText('จากวันที่')).toBeInTheDocument();
    expect(screen.getByLabelText('ถึงวันที่')).toBeInTheDocument();
  });

  it('queries backend with start_date and end_date params', async () => {
    render(<BroadcastListPage />);
    await screen.findByText('แคมเปญทดสอบ');

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-03' } });

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      const lastUrl = urls[urls.length - 1];
      expect(lastUrl).toContain('start_date=2026-09-01');
      expect(lastUrl).toContain('end_date=2026-09-03');
    });
  });

  it('displays localized Thai error when start_date > end_date', async () => {
    render(<BroadcastListPage />);
    await screen.findByText('แคมเปญทดสอบ');

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-05' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2026-09-01' } });

    expect(await screen.findByText('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด')).toBeInTheDocument();
  });

  it('clears date inputs and refetches from the shared clear button', async () => {
    const user = userEvent.setup();
    render(<BroadcastListPage />);
    await screen.findByText('แคมเปญทดสอบ');

    fireEvent.change(screen.getByLabelText('จากวันที่'), { target: { value: '2026-09-01' } });
    const clearBtn = await screen.findByRole('button', { name: 'ล้างตัวกรอง' });
    await user.click(clearBtn);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      const lastUrl = urls[urls.length - 1];
      expect(lastUrl).not.toContain('start_date=');
    });
  });
});
