// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LiffServiceRequestV2 from '../page';

vi.mock('@line/liff', () => ({ __esModule: true, default: {} }));
vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true }),
}));
vi.mock('@/hooks/useAutoCloseCountdown', () => ({
  useAutoCloseCountdown: () => ({}),
}));
const uploadMock = vi.fn();
vi.mock('@/lib/liff/upload-media', () => ({
  uploadLiffMedia: (...args: unknown[]) => uploadMock(...args),
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

describe('LIFF upload retry (R3-H5)', () => {
  it('resets the file input so the same file can be retried', { timeout: 20000 }, async () => {
    window.alert = vi.fn();
    window.scrollTo = vi.fn();
    const realFetch = global.fetch;
    global.fetch = (async (url: string) => {
      if (String(url).includes('/api/v1/locations/provinces')) {
        return new Response(
          JSON.stringify([{ PROVINCE_ID: 1, PROVINCE_THAI: 'กทม', PROVINCE_ENGLISH: 'BKK' }]),
        );
      }
      return realFetch(url);
    }) as unknown as typeof fetch;
    try {
      uploadMock.mockClear();
      uploadMock.mockRejectedValueOnce(new Error('boom'));
      uploadMock.mockResolvedValue(
        new Response(JSON.stringify({ id: '1', filename: 'a.png' }), { status: 200 }),
      );

      const { container } = render(<LiffServiceRequestV2 />);

      // Step 0: personal info (prefix is a text input, not a select).
      fireEvent.change(container.querySelector('input[name="prefix"]')!, { target: { value: 'นาย' } });
      fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: 'สมชาย' } });
      fireEvent.change(container.querySelector('input[name="lastname"]')!, { target: { value: 'ใจดี' } });
      fireEvent.change(container.querySelector('input[name="phone_number"]')!, { target: { value: '0812345679' } });
      fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
      await waitFor(() => {
        expect(container.querySelectorAll('select').length).toBeGreaterThanOrEqual(3);
      });

      // Step 1: agency + location cascade.
      // Select order on this step: agency, province (no name attr),
      // district (no name attr), sub_district.
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

      // Step 2: details.
      pickFirstRealOption(container.querySelector('select[name="topic_category"]')!);
      await waitFor(() => {
        expect(container.querySelector('select[name="topic_subcategory"]')!.querySelectorAll('option').length).toBeGreaterThan(1);
      });
      pickFirstRealOption(container.querySelector('select[name="topic_subcategory"]')!);
      const desc = container.querySelector('[name="description"]')!;
      fireEvent.change(desc, { target: { value: 'รายละเอียดคำร้องทดสอบ' } });
      fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
      await waitFor(() => {
        expect(container.querySelector('input[type=file]')).not.toBeNull();
      });

      // Step 3: same File twice — first fails, retry must still fire.
      const file = new File(['x'], 'a.png', { type: 'image/png' });
      const input = container.querySelector('input[type=file]') as HTMLInputElement;
      // jsdom never reproduces the real browser symptom (no change event when
      // reselecting an identical file), so pin the fix directly: the handler
      // must reset `input.value` in `finally`. Chain to any existing
      // descriptor (e.g. React's value tracker) to preserve behavior.
      const valueDesc =
        Object.getOwnPropertyDescriptor(input, 'value') ??
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
      const origGet = valueDesc?.get?.bind(input) as (() => string) | undefined;
      const origSet = valueDesc?.set?.bind(input) as ((v: string) => void) | undefined;
      const resetValues: string[] = [];
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => origGet?.() ?? '',
        set: (v: string) => {
          resetValues.push(v);
          origSet?.(v);
        },
      });
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(resetValues).toContain(''));
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    } finally {
      global.fetch = realFetch;
    }
  });
});
