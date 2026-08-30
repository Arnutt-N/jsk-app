// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import RichMenuListPage from '../page';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

interface MenuFixture {
    id: number;
    name: string;
    chat_bar_text: string;
    line_rich_menu_id: string | null;
    status: string;
    sync_status: string;
    last_sync_error: string | null;
    image_url: string | null;
    user_link_count?: number;
}

function menuFixture(overrides: Partial<MenuFixture> = {}): MenuFixture {
    return {
        id: 1,
        name: 'Menu',
        chat_bar_text: 'Open',
        line_rich_menu_id: 'richmenu-live',
        status: 'DRAFT',
        sync_status: 'SYNCED',
        last_sync_error: null,
        image_url: null,
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
            <RichMenuListPage />
        </ToastProvider>,
    );
}

describe('RichMenuListPage — sync-state honesty', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('offers Set Active only when the menu is synced AND its last sync succeeded', async () => {
        const menus = [
            menuFixture({ id: 1, name: 'Synced Menu', sync_status: 'SYNCED' }),
            // failed image upload: has a LINE id but must NOT be publishable
            menuFixture({
                id: 2,
                name: 'Failed Menu',
                sync_status: 'FAILED',
                last_sync_error: 'Image upload to LINE failed',
            }),
        ];
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(menus));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('Synced Menu')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Set Active' })).toBeInTheDocument();
        expect(screen.getByText('SYNC FAILED')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Re-sync' })).toBeInTheDocument();
    });

    it('renders the preview from the media-pipeline image_url', async () => {
        const menus = [
            menuFixture({ id: 1, name: 'Menu With Image', image_url: '/api/v1/media/11111111-2222-3333-4444-555555555555' }),
            menuFixture({ id: 2, name: 'Menu Without Image', image_url: null }),
        ];
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(menus));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByText('Menu With Image')).toBeInTheDocument());
        const img = screen.getByAltText('Menu With Image') as HTMLImageElement;
        expect(img.src).toContain('/api/v1/media/11111111-2222-3333-4444-555555555555');
        // no image -> clean "No Image" state, not a broken img
        expect(screen.getByText('No Image')).toBeInTheDocument();
    });

    it('shows an error toast when a 200 sync response carries image_upload_error', async () => {
        const menus = [menuFixture({ id: 1, name: 'Broken Menu', sync_status: 'FAILED' })];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menus)) // initial load
            .mockResolvedValueOnce(jsonResponse({ // sync result: half-failed
                success: true,
                message: 'Already synced with LINE',
                image_upload_error: 'LINE rejected image',
            }))
            .mockResolvedValue(jsonResponse(menus)); // refetch after sync
        renderPage(fetchMock);

        // A FAILED menu shows Re-sync instead of Set Active — clicking it hits
        // POST /{id}/sync, whose 200 body carries image_upload_error.
        await waitFor(() => expect(screen.getByRole('button', { name: 'Re-sync' })).toBeInTheDocument());

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Re-sync' }));

        // parseSyncResult turns the half-failure into an error toast, not success
        await waitFor(() => expect(screen.getByText('Sync ไม่สมบูรณ์')).toBeInTheDocument());
        expect(screen.getByText(/อัปโหลดรูปไม่สำเร็จ/)).toBeInTheDocument();
        // and the list was refetched
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('disables the Re-sync button with loading state while the sync is in flight', async () => {
        const menus = [menuFixture({ id: 1, name: 'Broken Menu', sync_status: 'FAILED' })];
        let resolveSync!: (value: Response) => void;
        const syncPromise = new Promise<Response>((resolve) => { resolveSync = resolve; });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menus)) // initial load
            .mockReturnValueOnce(syncPromise) // sync: pending until we resolve
            .mockResolvedValue(jsonResponse(menus)); // refetch after sync
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByRole('button', { name: 'Re-sync' })).toBeInTheDocument());
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Re-sync' }));

        // While the sync fetch is pending the button is disabled and shows the
        // loading text (spinner state) — the "is it working?" feedback (PRD G3).
        await waitFor(() => expect(screen.getByText('กำลังซิงค์...')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Re-sync/ })).toBeDisabled();

        resolveSync(jsonResponse({ success: true, message: 'Synced', sync_status: 'SYNCED' }));
        await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    });

    it('names the Set Active next step in the sync success toast (not yet published)', async () => {
        const menus = [menuFixture({ id: 1, name: 'Broken Menu', sync_status: 'FAILED' })];
        const recovered = [menuFixture({ id: 1, name: 'Broken Menu', sync_status: 'SYNCED' })];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menus)) // initial load
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'Synced with LINE' }))
            .mockResolvedValueOnce(jsonResponse(recovered)) // refetch: now publishable
            .mockResolvedValue(jsonResponse(recovered));
        renderPage(fetchMock);

        await waitFor(() => expect(screen.getByRole('button', { name: 'Re-sync' })).toBeInTheDocument());
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Re-sync' }));

        // The toast tells the admin the sync alone did NOT go live (PRD AC-3.2) —
        // scoped to the toast title so it cannot collide with the Set Active
        // button that the refetch reveals in the same tick.
        await waitFor(() => expect(screen.getByText('ซิงค์สำเร็จ')).toBeInTheDocument());
        const toastDescriptions = screen.getAllByText(/Set Active/);
        expect(toastDescriptions.length).toBeGreaterThanOrEqual(1);

        // and after the refetch the row reveals the Set Active button (AC-3.3)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Set Active' })).toBeInTheDocument());
    });

    it('says the menu is already live when re-syncing a PUBLISHED menu', async () => {
        const menus = [menuFixture({ id: 1, name: 'Live Menu', sync_status: 'SYNCED', status: 'PUBLISHED' })];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(menus))
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'Already synced with LINE' }))
            .mockResolvedValue(jsonResponse(menus));
        renderPage(fetchMock);

        // PUBLISHED rows show "Live Now", not a publish button
        await waitFor(() => expect(screen.getByText('Live Now')).toBeInTheDocument());
        // still reachable via sync through the edit-free path: publish button absent
        expect(screen.queryByRole('button', { name: 'Set Active' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Re-sync' })).not.toBeInTheDocument();
    });
});
