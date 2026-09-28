// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ServiceDashboard from '../page';

vi.mock('@/components/admin/PageAccessGuard', () => ({
  default: function MockGuard({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  },
}));
vi.mock('../components/StatsCard', () => ({
  default: function MockStatsCard() { return <div data-testid="stats-card" />; },
}));
vi.mock('../components/ChartsWrapper', () => ({
  default: function MockCharts() { return <div data-testid="charts" />; },
}));
vi.mock('../components/PageHeader', () => ({
  default: function MockHeader() { return <div data-testid="page-header" />; },
}));
vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: function MockSpinner() { return <div data-testid="loading" />; },
}));

const realFetch = global.fetch;

describe('ServiceDashboard fetch failures (R3-H3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('shows the error banner when both requests fail closed (403/500)', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/monthly')
          ? new Response('{}', { status: 500 })
          : new Response('{}', { status: 403 }),
      ),
    ) as unknown as typeof fetch;
    render(<ServiceDashboard />);
    expect(await screen.findByText('Connection Error')).toBeInTheDocument();
    // Thai status message from getHttpStatusMessage (403), not silent zeros.
    expect(screen.getByText('ไม่มีสิทธิ์ดำเนินการนี้')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-card')).not.toBeInTheDocument();
  });

  it('renders stats with no banner when both requests succeed', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          url.includes('/monthly') ? '[]' : '{"total":5,"pending":1,"resolved":4}',
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;
    render(<ServiceDashboard />);
    await waitFor(() => {
      expect(screen.queryAllByTestId('stats-card').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Connection Error')).not.toBeInTheDocument();
  });
});
