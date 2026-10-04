// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  fetchDistricts: async () => [
    { DISTRICT_ID: 10, PROVINCE_ID: 1, DISTRICT_THAI: 'เขตเมือง', DISTRICT_ENGLISH: 'M' },
  ],
  fetchSubDistricts: async () => [
    { SUB_DISTRICT_ID: 100, DISTRICT_ID: 10, SUB_DISTRICT_THAI: 'แขวงใน', SUB_DISTRICT_ENGLISH: 'N', POSTAL_CODE: '10100' },
  ],
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
const submitMock = vi.fn();
vi.mock('@/lib/liff/submit-service-request', () => ({
  submitServiceRequest: (...args: unknown[]) => submitMock(...args),
}));

const originalFetch = global.fetch;

function mockProvincesFetch() {
  const resp = new Response(
    JSON.stringify([{ PROVINCE_ID: 1, PROVINCE_THAI: 'กทม' }]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  global.fetch = vi.fn().mockResolvedValue(resp);
}

function changeByName(container: HTMLElement, name: string, value: string) {
  const el = container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

describe('LIFF request-v2 validation (D4)', () => {
  beforeEach(() => {
    submitMock.mockClear();
    submitMock.mockResolvedValue(new Response('{}', { status: 200 }));
    mockProvincesFetch();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects whitespace-only names with inline errors and no submit', async () => {
    const { container } = render(<LiffRequestV2 />);

    changeByName(container, 'firstname', '   ');
    changeByName(container, 'lastname', '  ');
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText('กรุณาระบุชื่อ')).toBeTruthy();
      expect(screen.getByText('กรุณาระบุนามสกุล')).toBeTruthy();
    });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('rejects over-long phone numbers without submitting (D4/F7 parity)', async () => {
    const { container } = render(<LiffRequestV2 />);

    changeByName(container, 'phone', '081234567890');
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText('หมายเลขโทรศัพท์ไม่ถูกต้อง')).toBeTruthy();
    });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('submits a valid form with phone_number mapped and no raw phone key', async () => {
    const { container } = render(<LiffRequestV2 />);

    changeByName(container, 'prefix', 'นาย');
    changeByName(container, 'firstname', 'สมชาย');
    changeByName(container, 'lastname', 'ใจดี');
    changeByName(container, 'phone', '+66812345678');
    const agency = container.querySelector('[name="agency"]') as HTMLSelectElement;
    fireEvent.change(agency, { target: { value: agency.options[1].value } });

    await waitFor(() => {
      expect(container.querySelector('#province')!.querySelectorAll('option').length).toBeGreaterThan(1);
    });
    fireEvent.change(container.querySelector('#province')!, { target: { value: '1' } });
    await waitFor(() => {
      expect(container.querySelector('#district')!.querySelectorAll('option').length).toBeGreaterThan(1);
    });
    fireEvent.change(container.querySelector('#district')!, { target: { value: '10' } });
    await waitFor(() => {
      expect(container.querySelector('#sub_district')!.querySelectorAll('option').length).toBeGreaterThan(1);
    });
    fireEvent.change(container.querySelector('#sub_district')!, { target: { value: '100' } });

    const category = container.querySelector('[name="topic_category"]') as HTMLSelectElement;
    fireEvent.change(category, { target: { value: category.options[1].value } });
    await waitFor(() => {
      expect(container.querySelector('[name="topic_subcategory"]')).not.toBeNull();
    });
    const subcategory = container.querySelector('[name="topic_subcategory"]') as HTMLSelectElement;
    fireEvent.change(subcategory, { target: { value: subcategory.options[1].value } });
    changeByName(container, 'description', 'ต้องการความช่วยเหลือเรื่องที่ดิน');

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(submitMock).toHaveBeenCalledTimes(1);
    });
    const payload = submitMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.phone_number).toBe('0812345678');
    expect('phone' in payload).toBe(false);
  });
});
