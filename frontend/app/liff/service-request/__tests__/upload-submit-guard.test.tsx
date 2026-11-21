// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiffServiceRequest from '../page';

vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true, setIsInLineApp: vi.fn() }),
  getWindowLiff: () => undefined,
}));
vi.mock('@/hooks/useAutoCloseCountdown', () => ({ useAutoCloseCountdown: () => ({}) }));
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
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
const submitMock = vi.fn();
vi.mock('@/lib/liff/submit-service-request', () => ({
  submitServiceRequest: (...args: unknown[]) => submitMock(...args),
}));

const originalFetch = global.fetch;
function mockFetch() {
  global.fetch = (async (url: string) => {
    if (String(url).includes('/api/v1/locations/provinces')) {
      return new Response(
        JSON.stringify([{ PROVINCE_ID: 1, PROVINCE_THAI: 'กทม', PROVINCE_ENGLISH: 'BKK' }]),
      );
    }
    return originalFetch(url);
  }) as unknown as typeof fetch;
}
function pickFirstRealOption(select: HTMLElement) {
  const opts = (select as HTMLSelectElement).querySelectorAll('option');
  expect(opts.length).toBeGreaterThan(1);
  fireEvent.change(select, { target: { value: opts[1].value } });
}
async function reachUploadStep(container: HTMLElement) {
  fireEvent.change(container.querySelector('select[name="prefix"]')!, { target: { value: 'นาย' } });
  fireEvent.change(container.querySelector('input[name="firstname"]')!, { target: { value: 'สมชาย' } });
  fireEvent.change(container.querySelector('input[name="lastname"]')!, { target: { value: 'ใจดี' } });
  fireEvent.change(container.querySelector('input[name="phone_number"]')!, { target: { value: '0812345679' } });
  fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
  await waitFor(() => expect(container.querySelectorAll('select').length).toBeGreaterThanOrEqual(3));

  pickFirstRealOption(container.querySelector('select[name="agency"]')!);
  await waitFor(() => expect(container.querySelectorAll('select')[1].querySelectorAll('option').length).toBe(2));
  fireEvent.change(container.querySelectorAll('select')[1], { target: { value: '1' } });
  await waitFor(() => expect(container.querySelectorAll('select')[2].querySelectorAll('option').length).toBe(2));
  fireEvent.change(container.querySelectorAll('select')[2], { target: { value: '10' } });
  await waitFor(() => expect(container.querySelector('select[name="sub_district"]')!.querySelectorAll('option').length).toBe(2));
  fireEvent.change(container.querySelector('select[name="sub_district"]')!, { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
  await waitFor(() => expect(container.querySelector('select[name="topic_category"]')).not.toBeNull());

  pickFirstRealOption(container.querySelector('select[name="topic_category"]')!);
  await waitFor(() => expect(container.querySelector('select[name="topic_subcategory"]')!.querySelectorAll('option').length).toBeGreaterThan(1));
  pickFirstRealOption(container.querySelector('select[name="topic_subcategory"]')!);
  fireEvent.change(container.querySelector('[name="description"]')!, { target: { value: 'รายละเอียดคำร้องทดสอบ' } });
  fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
  await waitFor(() => expect(container.querySelector('input[type=file]')).not.toBeNull());
}

describe('F1: wizard submit waits for in-flight uploads', () => {
  beforeEach(() => {
    submitMock.mockReset();
    submitMock.mockResolvedValue(new Response('{}', { status: 200 }));
    uploadMock.mockReset();
    mockFetch();
    window.scrollTo = vi.fn();
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('blocks submit while an upload is pending and posts the attachment after it settles', async () => {
    let resolveUpload!: (res: Response) => void;
    uploadMock.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));

    const { container } = render(<LiffServiceRequest />);
    await reachUploadStep(container);

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/รอให้ไฟล์แนบอัปโหลดเสร็จ/)).toBeTruthy());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(submitMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpload(new Response(JSON.stringify({ id: '1', filename: 'a.png' }), { status: 200 }));
    });
    await waitFor(() => expect(screen.getByText('a.png')).toBeTruthy());

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const payload = submitMock.mock.calls[0][0] as { attachments: Array<{ id: string; name: string }> };
    expect(payload.attachments).toEqual([{ id: '1', url: '/api/v1/media/1', name: 'a.png' }]);
  });
});
