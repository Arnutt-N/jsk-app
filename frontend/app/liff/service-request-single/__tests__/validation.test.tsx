// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LiffServiceRequestSingle from '../page';

vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true }),
  getWindowLiff: () => undefined,
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

describe('LIFF service-request-single validation (R3-M28-twin)', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    submitMock.mockClear();
  });

  it('rejects whitespace-only firstname without opening confirm', async () => {
    const { container } = render(<LiffServiceRequestSingle />);

    fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: '   ' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText('กรุณาระบุชื่อ')).toBeTruthy();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('opens the confirm dialog on a valid full fill', { timeout: 20000 }, async () => {
    const restoreFetch = mockProvincesFetch();
    try {
      const { container } = render(<LiffServiceRequestSingle />);

      fireEvent.change(container.querySelector('select[name="prefix"]')!, { target: { value: 'นาย' } });
      fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: 'สมชาย' } });
      fireEvent.change(container.querySelector('input[name="lastname"]')!, { target: { value: 'ใจดี' } });
      fireEvent.change(container.querySelector('input[name="phone"]')!, { target: { value: '0812345679' } });
      pickFirstRealOption(container.querySelector('select[name="agency"]')!);
      await waitFor(() => {
        expect(container.querySelector('#province')!.querySelectorAll('option').length).toBe(2);
      });
      fireEvent.change(container.querySelector('#province')!, { target: { value: '1' } });
      await waitFor(() => {
        expect(container.querySelector('#district')!.querySelectorAll('option').length).toBe(2);
      });
      fireEvent.change(container.querySelector('#district')!, { target: { value: '10' } });
      await waitFor(() => {
        expect(container.querySelector('select[name="sub_district"]')!.querySelectorAll('option').length).toBe(2);
      });
      fireEvent.change(container.querySelector('select[name="sub_district"]')!, { target: { value: '100' } });
      pickFirstRealOption(container.querySelector('select[name="topic_category"]')!);
      await waitFor(() => {
        expect(container.querySelector('select[name="topic_subcategory"]')!.querySelectorAll('option').length).toBeGreaterThan(1);
      });
      pickFirstRealOption(container.querySelector('select[name="topic_subcategory"]')!);
      fireEvent.change(container.querySelector('[name="description"]')!, { target: { value: 'รายละเอียดคำร้องทดสอบ' } });
      fireEvent.submit(container.querySelector('form')!);

      await waitFor(() => {
        expect(screen.getByText('ยืนยันการส่งข้อมูล')).toBeTruthy();
      });
    } finally {
      restoreFetch();
    }
  });

  it('strips non-digits from the phone input (R3-M29)', () => {
    const { container } = render(<LiffServiceRequestSingle />);
    const phone = container.querySelector('input[name="phone"]') as HTMLInputElement;
    expect(phone.placeholder).toBe('08xxxxxxxx');
    expect(phone.maxLength).toBe(12);
    fireEvent.change(phone, { target: { value: '081-234-5678' } });
    expect(phone.value).toBe('0812345678');
  });

  it('rejects over-long phone numbers without opening confirm (F7)', async () => {
    const { container } = render(<LiffServiceRequestSingle />);

    fireEvent.change(container.querySelector('input[name="phone"]')!, { target: { value: '0812345678901234' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText('หมายเลขโทรศัพท์ไม่ถูกต้อง')).toBeTruthy();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('normalizes a pasted +66 prefix to 0 (F12)', () => {
    const { container } = render(<LiffServiceRequestSingle />);
    const phone = container.querySelector('input[name="phone"]') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '+66812345678' } });
    expect(phone.value).toBe('0812345678');
  });

  it('cancel asks before leaving when the form is dirty (leave-confirm)', async () => {
    const { container } = render(<LiffServiceRequestSingle />);
    fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: 'สมชาย' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(await screen.findByText('ปิดแบบฟอร์มนี้?')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => {
      expect(screen.queryByText('ปิดแบบฟอร์มนี้?')).not.toBeInTheDocument();
    });
  });

  it('cancel on a pristine form leaves at once without asking', async () => {
    render(<LiffServiceRequestSingle />);
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    await waitFor(() => {
      expect(screen.queryByText('ปิดแบบฟอร์มนี้?')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
