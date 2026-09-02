// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import EditRichMenuPage from '../page';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useParams: () => ({ id: '1' }),
}));

interface EditMenuFixture {
    id: number;
    name: string;
    chat_bar_text: string;
    line_rich_menu_id: string | null;
    status: string;
    sync_status: string;
    last_sync_error: string | null;
    image_url: string | null;
    display_mode?: string;
    display_start_at?: string;
    display_end_at?: string;
    config: {
        size: { width: number; height: number };
        areas: Array<{
            bounds: { x: number; y: number; width: number; height: number };
            action: { type: string; label: string; uri?: string };
        }>;
    };
}

function editMenuFixture(overrides: Partial<EditMenuFixture> = {}): EditMenuFixture {
    return {
        id: 1,
        name: 'Main Menu',
        chat_bar_text: 'Open Menu',
        line_rich_menu_id: 'richmenu-live',
        status: 'DRAFT',
        sync_status: 'SYNCED',
        last_sync_error: null,
        image_url: '/api/v1/media/11111111-2222-3333-4444-555555555555',
        display_mode: 'ALWAYS',
        config: {
            size: { width: 2500, height: 1686 },
            areas: [
                {
                    bounds: { x: 0, y: 0, width: 1250, height: 843 },
                    action: { type: 'uri', label: 'Top Left', uri: 'https://example.com' },
                },
                {
                    bounds: { x: 1250, y: 0, width: 1250, height: 843 },
                    action: { type: 'uri', label: 'Top Right', uri: 'https://example.com' },
                },
            ],
        },
        ...overrides,
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    return render(
        <ToastProvider>
            <EditRichMenuPage />
        </ToastProvider>,
    );
}

describe('EditRichMenuPage — area overlay + sync machine', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('overlays numbered area boxes on the stored image (saved bounds, not a preset)', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(editMenuFixture())) // menu
            .mockResolvedValue(jsonResponse([])); // aliases
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByAltText('Preview')).toBeInTheDocument());
        // 2-area menu -> numbered overlay markers 1 and 2 (PRD AC-1.1)
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows SYNC FAILED badge and Re-sync button when the last sync failed', async () => {
        const menu = editMenuFixture({
            sync_status: 'FAILED',
            last_sync_error: 'Image upload to LINE failed',
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('SYNC FAILED')).toBeInTheDocument());
        // FAILED sync must not offer Set Active — recovery is Re-sync (AC-2.2)
        expect(screen.getByRole('button', { name: 'Re-sync' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Set Active' })).not.toBeInTheDocument();
    });

    it('shows Live Now (no Set Active) for a published menu', async () => {
        const menu = editMenuFixture({ status: 'PUBLISHED', sync_status: 'SYNCED' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('Live Now')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Set Active' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Re-sync' })).not.toBeInTheDocument();
    });

    it('offers Set Active when synced but not yet published', async () => {
        const menu = editMenuFixture({ status: 'DRAFT', sync_status: 'SYNCED' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByRole('button', { name: 'Set Active' })).toBeInTheDocument());
    });

    it('shows รอซิงค์ badge and ซิงค์การแก้ไข button when edits are local-only', async () => {
        // PENDING on a synced menu = backend flagged a local edit (PUT/upload)
        // that LINE has not received yet — must not read SYNCED or offer publish.
        const menu = editMenuFixture({ status: 'DRAFT', sync_status: 'PENDING' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('รอซิงค์')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'ซิงค์การแก้ไข' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Set Active' })).not.toBeInTheDocument();
    });

    it('shows รอซิงค์ (not Live Now) for a published menu with unsynced edits', async () => {
        const menu = editMenuFixture({ status: 'PUBLISHED', sync_status: 'PENDING' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('รอซิงค์')).toBeInTheDocument());
        expect(screen.queryByText('Live Now')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ซิงค์การแก้ไข' })).toBeInTheDocument();
    });

    it('renders both save actions from the create page (draft + save-and-sync)', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(editMenuFixture()))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByAltText('Preview')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'บันทึกฉบับร่าง' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'บันทึกและซิงค์' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'ยกเลิก' })).toBeInTheDocument();
    });

    it('save-and-sync issues PUT then sync and stays on the page (no redirect)', async () => {
        const menu = editMenuFixture();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu)) // initial load
            .mockResolvedValue(jsonResponse([])) // aliases
            // save-and-sync: PUT -> sync -> refetch after refresh
            .mockResolvedValueOnce(jsonResponse({ ...menu, sync_status: 'PENDING' }))
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'อัปเดตบน LINE แล้ว', recreated: true }))
            .mockResolvedValueOnce(jsonResponse({ ...menu }));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByAltText('Preview')).toBeInTheDocument());
        screen.getByRole('button', { name: 'บันทึกและซิงค์' }).click();

        await waitFor(() => {
            const calls = fetchMock.mock.calls.map((c) => String(c[0]));
            const putIdx = calls.findIndex((u) => u.includes('/admin/rich-menus/1') && !u.includes('/sync'));
            const syncIdx = calls.findIndex((u) => u.includes('/admin/rich-menus/1/sync'));
            expect(putIdx).toBeGreaterThan(-1);
            expect(syncIdx).toBeGreaterThan(putIdx);
        });
        // stayed on the page: the menu was re-fetched (badge refresh), no router.push
        await waitFor(() => {
            const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.endsWith('/admin/rich-menus/1'));
            expect(calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('draft save of a synced menu says the edit has not reached LINE', async () => {
        const menu = editMenuFixture();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu)) // initial load
            .mockResolvedValue(jsonResponse([])) // aliases
            .mockResolvedValueOnce(jsonResponse({ ...menu, sync_status: 'PENDING' })) // PUT
            .mockResolvedValueOnce(jsonResponse({ ...menu })); // refetch
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByAltText('Preview')).toBeInTheDocument());
        screen.getByRole('button', { name: 'บันทึกฉบับร่าง' }).click();

        await waitFor(() => expect(screen.getByText(/ยังไม่ส่งไป LINE/)).toBeInTheDocument());
        // draft save must NOT call the sync endpoint
        const calls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(calls.some((u) => u.includes('/sync'))).toBe(false);
    });

    it('renders the display-mode radios from the saved menu (SCHEDULED preselects)', async () => {
        const menu = editMenuFixture({
            display_mode: 'SCHEDULED',
            display_start_at: '2026-09-03T02:00:00.000Z',
            display_end_at: '2026-09-10T14:00:00.000Z',
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu))
            .mockResolvedValue(jsonResponse([]));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('การแสดงผล')).toBeInTheDocument());
        expect(screen.getByText('แสดงตลอดเวลา')).toBeInTheDocument();
        expect(screen.getByText('ตามช่วงเวลา')).toBeInTheDocument();
        expect(screen.getByText('ซ่อน (เตรียมใช้งาน)')).toBeInTheDocument();
        // SCHEDULED reveals both period inputs, prefilled with the saved period
        const starts = screen.getAllByLabelText(/เริ่มแสดง/);
        expect(starts[0]).toBeInTheDocument();
        expect((starts[0] as HTMLInputElement).value).not.toBe('');
    });

    it('save-and-sync on a MANUAL menu never auto-publishes', async () => {
        const menu = editMenuFixture({ display_mode: 'MANUAL', status: 'DRAFT' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu)) // initial load
            .mockResolvedValue(jsonResponse([])) // aliases
            .mockResolvedValueOnce(jsonResponse({ ...menu, sync_status: 'PENDING' })) // PUT
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'Sync ok' })) // sync
            .mockResolvedValueOnce(jsonResponse({ ...menu })); // refetch
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByAltText('Preview')).toBeInTheDocument());
        screen.getByRole('button', { name: 'บันทึกและซิงค์' }).click();

        await waitFor(() => {
            const calls = fetchMock.mock.calls.map((c) => String(c[0]));
            expect(calls.some((u) => u.includes('/sync'))).toBe(true);
        });
        // MANUAL mode: no publish call may follow the sync
        const calls = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(calls.some((u) => u.includes('/publish'))).toBe(false);
    });

    it('save-and-sync on an ALWAYS, unpublished menu publishes right after sync', async () => {
        const menu = editMenuFixture({ display_mode: 'ALWAYS', status: 'DRAFT' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menu)) // initial load
            .mockResolvedValue(jsonResponse([])) // aliases
            .mockResolvedValueOnce(jsonResponse({ ...menu, sync_status: 'PENDING' })) // PUT
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'Sync ok' })) // sync
            .mockResolvedValueOnce(jsonResponse({ message: 'Rich Menu is now default' })) // publish
            .mockResolvedValueOnce(jsonResponse({ ...menu, status: 'PUBLISHED' })); // refetch
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByAltText('Preview')).toBeInTheDocument());
        screen.getByRole('button', { name: 'บันทึกและซิงค์' }).click();

        await waitFor(() => {
            const calls = fetchMock.mock.calls.map((c) => String(c[0]));
            expect(calls.some((u) => u.includes('/publish'))).toBe(true);
        });
    });
});