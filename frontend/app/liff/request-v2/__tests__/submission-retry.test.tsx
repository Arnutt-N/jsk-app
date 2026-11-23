// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiffRequestV2 from '../page';

vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true }),
  getWindowLiff: () => undefined,
}));
vi.mock('@/hooks/useAutoCloseCountdown', () => ({ useAutoCloseCountdown: () => ({}) }));
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
vi.mock('next/head', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
const submitMock = vi.fn();
vi.mock('@/lib/liff/submit-service-request', () => ({
  submitServiceRequest: (...args: unknown[]) => submitMock(...args),
}));

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function changeByName(container: HTMLElement, name: string, value: string) {
  fireEvent.change(container.querySelector(`[name="${name}"]`)!, { target: { value } });
}

async function fillValidForm(container: HTMLElement) {
  changeByName(container, 'prefix', 'นาย');
  changeByName(container, 'firstname', 'สมชาย');
  changeByName(container, 'lastname', 'ใจดี');
  changeByName(container, 'phone', '0812345679');
  const agency = container.querySelector('[name="agency"]') as HTMLSelectElement;
  fireEvent.change(agency, { target: { value: agency.options[1].value } });
  await waitFor(() => expect(container.querySelector('#province')!.querySelectorAll('option').length).toBeGreaterThan(1));
  fireEvent.change(container.querySelector('#province')!, { target: { value: '1' } });
  await waitFor(() => expect(container.querySelector('#district')!.querySelectorAll('option').length).toBeGreaterThan(1));
  fireEvent.change(container.querySelector('#district')!, { target: { value: '10' } });
  await waitFor(() => expect(container.querySelector('#sub_district')!.querySelectorAll('option').length).toBeGreaterThan(1));
  fireEvent.change(container.querySelector('#sub_district')!, { target: { value: '100' } });
  const category = container.querySelector('[name="topic_category"]') as HTMLSelectElement;
  fireEvent.change(category, { target: { value: category.options[1].value } });
  await waitFor(() => expect(container.querySelector('[name="topic_subcategory"]')).not.toBeNull());
  const subcategory = container.querySelector('[name="topic_subcategory"]') as HTMLSelectElement;
  fireEvent.change(subcategory, { target: { value: subcategory.options[1].value } });
  changeByName(container, 'description', 'รายละเอียดคำร้องทดสอบ');
}

describe('F02: request-v2 submission id follows the sent payload', () => {
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

  it('replays one case on unchanged retry and stops silently reusing the id after an edit', { timeout: 20000 }, async () => {
    // First reply is lost after the server saved the case.
    submitMock.mockRejectedValue(new Error('network lost'));
    const { container } = render(<LiffRequestV2 />);
    await fillValidForm(container);

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const firstId = submitMock.mock.calls[0][2] as string;

    // Lost reply: unchanged retry must send the same id.
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    expect(submitMock.mock.calls[1][2]).toBe(firstId);

    // Edit after the lost reply: must not silently reuse the saved id.

    changeByName(container, 'description', 'รายละเอียดที่แก้ไขแล้ว');
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(3));
    expect(submitMock.mock.calls[2][2]).not.toBe(firstId);
  });

  it('offers recovery and explicit new case when the server reports a payload conflict', { timeout: 20000 }, async () => {
    submitMock
      .mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce(jsonResponse(409, {
        detail: { code: 'SUBMISSION_PAYLOAD_CONFLICT', message: 'ข้อมูลไม่ตรงกับเดิม' },
      }))
      .mockResolvedValue(jsonResponse(201, {}));
    const { container } = render(<LiffRequestV2 />);
    await fillValidForm(container);

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const firstId = submitMock.mock.calls[0][2] as string;
    changeByName(container, 'description', 'รายละเอียดที่แก้ไขแล้ว');
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    const conflictId = submitMock.mock.calls[1][2] as string;
    expect(conflictId).not.toBe(firstId);

    expect(await screen.findByText(/พบคำร้องที่ส่งไปแล้ว/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำร้องใหม่' }));
    changeByName(container, 'description', 'เรื่องใหม่ไม่เกี่ยวกับเรื่องเก่า');
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(3));
    expect(submitMock.mock.calls[2][2]).not.toBe(conflictId);
  });
});
