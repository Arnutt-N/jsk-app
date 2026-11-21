// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiffRequestV2 from '../page';

vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true }),
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
vi.mock('next/script', () => ({ default: function MockScript() { return null; } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
const submitMock = vi.fn();
vi.mock('@/lib/liff/submit-service-request', () => ({
  submitServiceRequest: (...args: unknown[]) => submitMock(...args),
}));

const originalFetch = global.fetch;
function mockFetch() {
  global.fetch = vi.fn().mockImplementation(async () => new Response(
    JSON.stringify([{ PROVINCE_ID: 1, PROVINCE_THAI: 'กทม' }]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
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

describe('F1: request-v2 submit waits for in-flight uploads', () => {
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

    const { container } = render(<LiffRequestV2 />);
    await fillValidForm(container);

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/รอให้ไฟล์แนบอัปโหลดเสร็จ/)).toBeTruthy());
    expect(submitMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpload(new Response(JSON.stringify({ id: '1', filename: 'a.png' }), { status: 200 }));
    });
    await waitFor(() => expect(screen.getByText('a.png')).toBeTruthy());

    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const payload = submitMock.mock.calls[0][0] as { attachments: Array<{ id: string; name: string }> };
    expect(payload.attachments).toEqual([{ id: '1', url: '/api/v1/media/1', name: 'a.png' }]);
  });
});
