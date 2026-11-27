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
const RESOLVE_URL = '/api/v1/admin/broadcasts/42/resolve';

function detail(status: string) {
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

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('BroadcastDetailPage recovery states', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentStatus = 'unknown';
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (String(url) === DETAIL_URL && !init?.method) {
                return new Response(JSON.stringify(detail(currentStatus)), { status: 200 });
            }
            if (String(url) === RESOLVE_URL) {
                currentStatus = JSON.parse(String(init?.body)).outcome;
                return new Response(JSON.stringify(detail(currentStatus)), { status: 200 });
            }
            return new Response('{}', { status: 404 });
        });
    });

    let currentStatus = 'unknown';

    it('offers explicit resolution for an unknown provider outcome', async () => {
        render(<BroadcastDetailPage />);
        expect(await screen.findByText('ผลส่งไม่แน่นอน')).toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'บันทึกว่าส่งสำเร็จ' }));
        await user.click(await screen.findByRole('button', { name: 'ยืนยัน' }));

        await waitFor(() => {
            expect(fetchMock.mock.calls.some(([url, init]) =>
                String(url) === RESOLVE_URL &&
                JSON.parse(String(init?.body)).outcome === 'completed')).toBe(true);
        });
    });

    it('requires confirmation before recording failure', async () => {
        render(<BroadcastDetailPage />);
        await screen.findByText('ผลส่งไม่แน่นอน');

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'บันทึกว่าล้มเหลว' }));
        expect(screen.getByText('ยืนยันบันทึกว่าล้มเหลว')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'ยืนยัน' }));

        await waitFor(() => {
            expect(fetchMock.mock.calls.some(([url, init]) =>
                String(url) === RESOLVE_URL &&
                JSON.parse(String(init?.body)).outcome === 'failed')).toBe(true);
        });
    });

    it('offers a correction path for an invalid draft', async () => {
        currentStatus = 'invalid';
        render(<BroadcastDetailPage />);
        expect(await screen.findByText('ข้อมูลไม่ถูกต้อง')).toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'สร้างประกาศใหม่' }));
        expect(mockPush).toHaveBeenCalledWith('/admin/chatbot/broadcast/new');
        expect(screen.queryByRole('button', { name: 'ส่ง' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'ลบ' })).not.toBeInTheDocument();
    });
});
