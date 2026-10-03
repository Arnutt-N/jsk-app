// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LiffServiceRequest from '../page';

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
  fetchDistricts: async () => [
    { DISTRICT_ID: 10, PROVINCE_ID: 1, DISTRICT_THAI: 'เขต', DISTRICT_ENGLISH: 'K' },
  ],
  fetchSubDistricts: async () => [
    { SUB_DISTRICT_ID: 100, DISTRICT_ID: 10, SUB_DISTRICT_THAI: 'แขวง', SUB_DISTRICT_ENGLISH: 'K', POSTAL_CODE: '10100' },
  ],
}));
vi.mock('next/head', () => ({
  default: function MockHead({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  },
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

function pickFirstRealOption(select: HTMLElement) {
  const opts = (select as HTMLSelectElement).querySelectorAll('option');
  expect(opts.length).toBeGreaterThan(1);
  fireEvent.change(select, { target: { value: opts[1].value } });
}

function mockProvincesFetch() {
  const realFetch = global.fetch;
  global.fetch = (async (url: string) => {
    if (String(url).includes('/api/v1/locations/provinces')) {
      return new Response(
        JSON.stringify([{ PROVINCE_ID: 1, PROVINCE_THAI: 'กทม', PROVINCE_ENGLISH: 'BKK' }]),
      );
    }
    return realFetch(url);
  }) as unknown as typeof fetch;
  return () => {
    global.fetch = realFetch;
  };
}

describe('LIFF service-request validation (R3-M28)', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it('rejects whitespace-only firstname with inline guidance', async () => {
    const { container } = render(<LiffServiceRequest />);

    fireEvent.change(container.querySelector('input[name="prefix"]')!, { target: { value: 'นาย' } });
    fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: '   ' } });
    fireEvent.change(container.querySelector('input[name="lastname"]')!, { target: { value: 'ใจดี' } });
    fireEvent.change(container.querySelector('input[name="phone_number"]')!, { target: { value: '0812345679' } });
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

    await waitFor(() => {
      expect(screen.getByText('กรุณาระบุชื่อ')).toBeTruthy();
    });
    // Still on step 0: the firstname input is still rendered.
    expect(container.querySelector('input[name="firstname"]')).not.toBeNull();
  });

  it('rejects whitespace-only description on step 2', { timeout: 20000 }, async () => {
    const restoreFetch = mockProvincesFetch();
    try {
      const { container } = render(<LiffServiceRequest />);

      // Step 0: valid personal info.
      fireEvent.change(container.querySelector('input[name="prefix"]')!, { target: { value: 'นาย' } });
      fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: 'สมชาย' } });
      fireEvent.change(container.querySelector('input[name="lastname"]')!, { target: { value: 'ใจดี' } });
      fireEvent.change(container.querySelector('input[name="phone_number"]')!, { target: { value: '0812345679' } });
      fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
      await waitFor(() => {
        expect(container.querySelectorAll('select').length).toBeGreaterThanOrEqual(3);
      });

      // Step 1: agency + location cascade.
      pickFirstRealOption(container.querySelector('select[name="agency"]')!);
      await waitFor(() => {
        expect(container.querySelectorAll('select')[1].querySelectorAll('option').length).toBe(2);
      });
      fireEvent.change(container.querySelectorAll('select')[1], { target: { value: '1' } });
      await waitFor(() => {
        expect(container.querySelectorAll('select')[2].querySelectorAll('option').length).toBe(2);
      });
      fireEvent.change(container.querySelectorAll('select')[2], { target: { value: '10' } });
      await waitFor(() => {
        expect(container.querySelector('select[name="sub_district"]')!.querySelectorAll('option').length).toBe(2);
      });
      fireEvent.change(container.querySelector('select[name="sub_district"]')!, { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
      await waitFor(() => {
        expect(container.querySelector('select[name="topic_category"]')).not.toBeNull();
      });

      // Step 2: valid category + whitespace-only description.
      pickFirstRealOption(container.querySelector('select[name="topic_category"]')!);
      await waitFor(() => {
        expect(container.querySelector('select[name="topic_subcategory"]')!.querySelectorAll('option').length).toBeGreaterThan(1);
      });
      pickFirstRealOption(container.querySelector('select[name="topic_subcategory"]')!);
      fireEvent.change(container.querySelector('[name="description"]')!, { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

      await waitFor(() => {
        expect(screen.getByText('กรุณาระบุรายละเอียด')).toBeTruthy();
      });
    } finally {
      restoreFetch();
    }
  });

  it('strips non-digits from the phone input (R3-M29)', () => {
    const { container } = render(<LiffServiceRequest />);
    const phone = container.querySelector('input[name="phone_number"]') as HTMLInputElement;
    expect(phone.placeholder).toBe('08xxxxxxxx');
    expect(phone.maxLength).toBe(12);
    fireEvent.change(phone, { target: { value: '081-234-5678' } });
    expect(phone.value).toBe('0812345678');
  });
});
