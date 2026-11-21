// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BroadcastDetailPage from '../page';

const mockPush = vi.fn();
const mockToast = vi.fn();

vi.mock('next/navigation', () => ({
    useParams: () => ({ id: '42' }),
    useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/ui/Toast', () => ({
    useToast: () => ({ toast: mockToast }),
}));

const DETAIL_URL = '/api/v1/admin/broadcasts/42';
const CANCEL_URL = '/api/v1/admin/broadcasts/42/cancel';

type Detail = {
    id: number;
    title: string;
    message_type: string;
    content: Record<string, unknown>;
    target_audience: string;
    target_filter: Record<string, unknown> | null;
    scheduled_at: string | null;
    sent_at: string | null;
    status: string;
    total_recipients: number;
    success_count: number;
    failure_count: number;
    created_by: number | null;
    created_at: string | null;
    updated_at: string | null;
};

function detail(status: string): Detail {
    return {
        id: 42,
        title: 'แคมเปญทดสอบ',
        message_type: 'text',
        content: { text: 'สวัสดี' },
        target_audience: 'all',
        target_filter: null,
        scheduled_at: null,
        sent_at: null,
        status,
        total_recipients: 10,
        success_count: 0,
        failure_count: 0,
        created_by: 1,
        created_at: '2026-09-03T07:44:00+07:00',
        updated_at: null,
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function responseKey(url: string, init?: RequestInit): string {
    return `${(init?.method ?? 'GET').toUpperCase()} ${String(url)}`;
}

function getCalls(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter(([url, init]) => responseKey(String(url), init) === `GET ${DETAIL_URL}`).length;
}

function cancelCalls(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter(([url, init]) => responseKey(String(url), init) === `POST ${CANCEL_URL}`).length;
}

/**
 * Route-keyed mock. A mutable holder makes GET before POST and GET after POST
 * return different statuses without relying on call order. Both variants are
 * object-backed so any fetch implementation that reads `.status` or `.ok`
 * sees the same response contract.
 */
function routeFetch(postStatus: number, initial: Detail, postResponse: Detail) {
    // GET before POST is the authoritative status snapshot. GET after POST is
    // the current server status; a conflict is stale only when those differ.
    let posted = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
        const key = responseKey(url, init);
        if (key === `POST ${CANCEL_URL}`) {
            posted = true;
            return jsonResponse({ ok: postStatus < 400 }, postStatus);
        }
        if (key === `GET ${DETAIL_URL}`) {
            return jsonResponse(posted ? postResponse : initial);
        }
        return jsonResponse({}, 404);
    });
    return fetchMock;
}

async function openCancelDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'ยกเลิกการส่ง' }));
    await screen.findByRole('dialog', { name: 'ยกเลิกการส่ง' });
    return screen.getByRole('dialog', { name: 'ยกเลิกการส่ง' });
}

async function confirmCancel(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));
}

describe('BroadcastDetailPage cancel status conflicts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('shows cancelled status after a successful cancel without a toast', async () => {
        const fetchMock = routeFetch(200, detail('scheduled'), detail('cancelled'));
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<BroadcastDetailPage />);

        expect(await screen.findByText('ตั้งเวลาแล้ว')).toBeInTheDocument();
        await openCancelDialog(user);
        await confirmCancel(user);

        await waitFor(() => expect(screen.getAllByText('ยกเลิกแล้ว').length).toBeGreaterThan(0));
        expect(mockToast).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ยกเลิกการส่ง' })).toBeNull());
        expect(getCalls(fetchMock)).toBe(2);
        expect(cancelCalls(fetchMock)).toBe(1);
    });

    it('shows a warning toast and the refreshed status after a 409 conflict', async () => {
        const fetchMock = routeFetch(409, detail('scheduled'), detail('cancelled'));
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<BroadcastDetailPage />);

        expect(await screen.findByText('ตั้งเวลาแล้ว')).toBeInTheDocument();
        await openCancelDialog(user);
        await confirmCancel(user);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledTimes(1);
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'warning' }));
        });
        expect((await screen.findAllByText('ยกเลิกแล้ว')).length).toBeGreaterThan(0);
        expect(getCalls(fetchMock)).toBe(2);
        expect(cancelCalls(fetchMock)).toBe(1);
    });

    it('shows a warning toast when a 400 arrives with a changed status', async () => {
        const fetchMock = routeFetch(400, detail('scheduled'), detail('cancelled'));
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<BroadcastDetailPage />);

        expect(await screen.findByText('ตั้งเวลาแล้ว')).toBeInTheDocument();
        await openCancelDialog(user);
        await confirmCancel(user);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledTimes(1);
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'warning' }));
        });
        expect((await screen.findAllByText('ยกเลิกแล้ว')).length).toBeGreaterThan(0);
        expect(getCalls(fetchMock)).toBe(2);
        expect(cancelCalls(fetchMock)).toBe(1);
    });

    it('shows an error toast when a 400 arrives with the status unchanged', async () => {
        const fetchMock = routeFetch(400, detail('scheduled'), detail('scheduled'));
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<BroadcastDetailPage />);

        expect(await screen.findByText('ตั้งเวลาแล้ว')).toBeInTheDocument();
        await openCancelDialog(user);
        await confirmCancel(user);

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledTimes(1);
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
        });
        expect(screen.queryByText('ยกเลิกแล้ว')).toBeNull();
        expect(getCalls(fetchMock)).toBe(2);
        expect(cancelCalls(fetchMock)).toBe(1);
    });
});
