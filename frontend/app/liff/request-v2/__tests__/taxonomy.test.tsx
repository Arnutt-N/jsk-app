// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiffRequestV2 from '../page';

vi.mock('@line/liff', () => ({ __esModule: true, default: {} }));
vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true }),
}));
vi.mock('@/hooks/useAutoCloseCountdown', () => ({
  useAutoCloseCountdown: () => ({}),
}));
vi.mock('@/lib/liff/upload-media', () => ({
  uploadLiffMedia: vi.fn(),
  attachmentCapMessage: () => null,
  readErrorDetail: async () => null,
}));
vi.mock('@/lib/liff/location-cascade', () => ({
  fetchDistricts: async () => [],
  fetchSubDistricts: async () => [],
}));
vi.mock('next/head', () => ({
  default: function MockHead({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  },
}));
vi.mock('next/script', () => ({
  default: function MockScript() {
    return null;
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/liff/submit-service-request', () => ({
  submitServiceRequest: vi.fn(),
}));
vi.mock('@/lib/booking/service-mapping', () => ({
  loadTaxonomy: vi.fn().mockResolvedValue({
    'หมวดใหม่จากแอดมิน': ['หัวข้อใหม่จากแอดมิน'],
  }),
}));

const originalFetch = global.fetch;

describe('LIFF request-v2 shared taxonomy', () => {
  beforeEach(() => {
    const resp = new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    global.fetch = vi.fn().mockResolvedValue(resp);
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders an admin-renamed category from loadTaxonomy', async () => {
    render(<LiffRequestV2 />);

    await waitFor(() => {
      expect(screen.getByText('หมวดใหม่จากแอดมิน')).toBeInTheDocument();
    });
  });
});
