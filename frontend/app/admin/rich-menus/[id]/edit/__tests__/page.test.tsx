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
});