// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import CannedResponsesPage from '../page';

interface CannedFixture {
  id: number;
  shortcut: string;
  title: string;
  content: string;
  category: string;
  usage_count?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The list endpoint returns an envelope: `{ items: [...], total }`. */
function listResponse(items: CannedFixture[]): Response {
  return jsonResponse({ items, total: items.length });
}

function renderPage() {
  return render(
    <ToastProvider>
      <CannedResponsesPage />
    </ToastProvider>
  );
}

async function waitForInitialFetch(fetchMock: ReturnType<typeof vi.fn>) {
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/canned-responses')
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'เพิ่มข้อความ' }));
  fireEvent.change(screen.getByPlaceholderText('greeting'), { target: { value: 'greet' } });
  fireEvent.change(screen.getByPlaceholderText('ข้อความทักทาย'), { target: { value: 'ทักทายลูกค้า' } });
  fireEvent.change(screen.getByPlaceholderText('สวัสดีค่ะ ยินดีให้บริการค่ะ'), {
    target: { value: 'สวัสดีค่ะ' },
  });
}

describe('CannedResponsesPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the list and shows the empty state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitForInitialFetch(fetchMock);

    expect(
      await screen.findByText('ยังไม่มีข้อความสำเร็จรูป — กด “เพิ่มข้อความ” เพื่อเริ่มต้น')
    ).toBeInTheDocument();
  });

  it('renders a response with its /shortcut and the Thai category label', async () => {
    // Category code 'greeting' must render as its Thai label 'ทักทาย', not the raw code.
    // Title is deliberately different from the label so the two never collide.
    const fetchMock = vi.fn().mockResolvedValue(
      listResponse([
        { id: 1, shortcut: 'hello', title: 'ข้อความต้อนรับ', content: 'สวัสดีค่ะ', category: 'greeting', usage_count: 3 },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitForInitialFetch(fetchMock);

    expect(await screen.findByText('/hello')).toBeInTheDocument();
    expect(screen.getByText('ข้อความต้อนรับ')).toBeInTheDocument();
    expect(screen.getByText('ทักทาย', { selector: '.rounded-full' })).toBeInTheDocument();
  });

  it('creates a response: POSTs the trimmed payload then refetches', async () => {
    const user = userEvent.setup();
    const created: CannedFixture = { id: 9, shortcut: 'greet', title: 'ทักทายลูกค้า', content: 'สวัสดีค่ะ', category: 'info' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([]))          // initial
      .mockResolvedValueOnce(jsonResponse(created))     // POST
      .mockResolvedValueOnce(listResponse([created]));  // refetch
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitForInitialFetch(fetchMock);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/v1/admin/canned-responses' && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/v1/admin/canned-responses' && init?.method === 'POST'
    )!;
    expect(JSON.parse(postCall[1].body as string)).toMatchObject({
      shortcut: 'greet',
      title: 'ทักทายลูกค้า',
      content: 'สวัสดีค่ะ',
      category: 'info',
    });

    // Modal closes and the new row shows up after refetch.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('/greet')).toBeInTheDocument();
  });

  it('keeps the modal open and shows an error when the shortcut is a duplicate (409)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(jsonResponse({ detail: 'exists' }, 409));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitForInitialFetch(fetchMock);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ชอร์ตคัตนี้ถูกใช้แล้ว กรุณาเลือกคำอื่น');
    // POST failed → no refetch, still exactly the initial GET + the failed POST.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deletes a response after confirmation', async () => {
    const user = userEvent.setup();
    const row: CannedFixture = { id: 5, shortcut: 'bye', title: 'ลาก่อน', content: 'ขอบคุณค่ะ', category: 'closing' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listResponse([row]))                       // initial
      .mockResolvedValueOnce(jsonResponse({ status: 'deleted', id: 5 })) // DELETE
      .mockResolvedValueOnce(listResponse([]));                         // refetch
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitForInitialFetch(fetchMock);
    await screen.findByText('/bye');

    // The row's trash action opens the confirm dialog; a second 'ลบ' button
    // (the dialog's confirm) then appears — click that one.
    await user.click(screen.getByRole('button', { name: 'ลบ' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'ลบ' }).length).toBeGreaterThan(1)
    );
    const confirmButtons = screen.getAllByRole('button', { name: 'ลบ' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/v1/admin/canned-responses/5' && init?.method === 'DELETE'
      );
      expect(delCall).toBeTruthy();
    });
  });
});
