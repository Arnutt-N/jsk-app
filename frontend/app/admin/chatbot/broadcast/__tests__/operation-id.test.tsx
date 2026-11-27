// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import BroadcastCreatePage from '../new/page';

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: /ถัดไป/ })[0]);
  await user.type(screen.getByPlaceholderText('เช่น แจ้งข่าวสารประจำเดือน'), 'ทดสอบ operation');
  await user.type(screen.getByPlaceholderText('พิมพ์ข้อความที่ต้องการส่ง...'), 'สวัสดี');
  await user.click(screen.getAllByRole('button', { name: /ถัดไป/ })[0]);
  await user.click(screen.getAllByRole('button', { name: /ถัดไป/ })[0]);
  await screen.findByRole('button', { name: 'ส่งเลย' });
}

describe('BroadcastCreatePage operation id', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    routerMock.push.mockClear();
  });

  it('keeps the same operation id on a repeated send after a failed response', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === '/api/v1/admin/broadcasts' && init?.method === 'POST') {
        return jsonResponse({ id: 7 }, 201);
      }
      return jsonResponse({ detail: 'send failed' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ToastProvider>
        <BroadcastCreatePage />
      </ToastProvider>
    );
    const user = userEvent.setup();
    await walkToReview(user);

    await user.click(screen.getByRole('button', { name: 'ส่งเลย' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: 'ส่งเลย' }));

    await waitFor(() => {
      const createCalls = fetchMock.mock.calls.filter(([url, init]) =>
        String(url) === '/api/v1/admin/broadcasts' && init?.method === 'POST');
      expect(createCalls.length).toBe(2);
      const ids = createCalls.map(([, init]) => JSON.parse(String(init?.body)).operation_id);
      expect(ids[0]).toBeTruthy();
      expect(ids[1]).toBe(ids[0]);
    });
  });
});
