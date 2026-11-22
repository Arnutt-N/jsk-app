// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiffServiceRequest from '../page';

vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true, setIsInLineApp: vi.fn() }),
  getWindowLiff: () => undefined,
}));
vi.mock('@/hooks/useAutoCloseCountdown', () => ({ useAutoCloseCountdown: () => ({}) }));
vi.mock('@/hooks/useLiffLeave', () => ({
  useLiffLeave: () => ({
    leaveOpen: false, requestLeave: vi.fn(), cancelLeave: vi.fn(), confirmLeave: vi.fn(),
  }),
}));
vi.mock('@/components/liff/LeaveConfirmDialog', () => ({ LeaveConfirmDialog: () => null }));
vi.mock('@/lib/liff/upload-media', () => ({
  uploadLiffMedia: vi.fn(), attachmentCapMessage: () => null, readErrorDetail: async () => null,
}));
vi.mock('@/lib/liff/location-cascade', () => ({
  fetchDistricts: async () => [
    { DISTRICT_ID: 10, PROVINCE_ID: 1, DISTRICT_THAI: 'เขต', DISTRICT_ENGLISH: 'K' },
  ],
  fetchSubDistricts: async () => [
    { SUB_DISTRICT_ID: 100, DISTRICT_ID: 10, SUB_DISTRICT_THAI: 'แขวง', SUB_DISTRICT_ENGLISH: 'K', POSTAL_CODE: '10100' },
  ],
}));
vi.mock('next/head', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
const submitMock = vi.fn();
vi.mock('@/lib/liff/submit-service-request', () => ({
  submitServiceRequest: (...args: unknown[]) => submitMock(...args),
}));

const originalFetch = global.fetch;
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function pickFirstRealOption(select: HTMLElement) {
  const opts = (select as HTMLSelectElement).querySelectorAll('option');
  fireEvent.change(select, { target: { value: opts[1].value } });
}
async function reachSubmitStep(container: HTMLElement) {
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'ยื่นคำขอ' })).toBeTruthy());
}

async function confirmSubmit() {
  fireEvent.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'ยืนยันคำขอ' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันคำขอ' }));
}

describe('F02: wizard submission id follows the sent payload', () => {
  beforeEach(() => {
    submitMock.mockReset();
    global.fetch = (async (url: string) => {
      if (String(url).includes('/api/v1/locations/provinces')) {
        return jsonResponse(200, [{ PROVINCE_ID: 1, PROVINCE_THAI: 'กทม' }]);
      }
      return originalFetch(url);
    }) as unknown as typeof fetch;
    window.scrollTo = vi.fn();
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('keeps one id for unchanged retry, rotates on edit, and offers explicit new case', { timeout: 25000 }, async () => {
    submitMock
      .mockRejectedValueOnce(new Error('network lost'))
      .mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce(jsonResponse(409, {
        detail: { code: 'SUBMISSION_PAYLOAD_CONFLICT', message: 'ข้อมูลไม่ตรงกับเดิม' },
      }))
      .mockResolvedValue(jsonResponse(201, {}));
    const { container } = render(<LiffServiceRequest />);
    await reachSubmitStep(container);

    await confirmSubmit();
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const firstId = submitMock.mock.calls[0][2] as string;

    await confirmSubmit();
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    expect(submitMock.mock.calls[1][2]).toBe(firstId);

    fireEvent.click(screen.getByRole('button', { name: 'กลับ' }));
    await waitFor(() => expect(container.querySelector('[name="description"]')).not.toBeNull());
    fireEvent.change(container.querySelector('[name="description"]')!, { target: { value: 'รายละเอียดที่แก้ไขแล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ยื่นคำขอ' })).toBeTruthy());
    await confirmSubmit();
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(3));
    const conflictId = submitMock.mock.calls[2][2] as string;
    expect(conflictId).not.toBe(firstId);

    expect(await screen.findByText(/พบคำร้องที่ส่งไปแล้ว/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำร้องใหม่' }));
    expect(screen.queryByText(/พบคำร้องที่ส่งไปแล้ว/)).toBeNull();
  });
});
