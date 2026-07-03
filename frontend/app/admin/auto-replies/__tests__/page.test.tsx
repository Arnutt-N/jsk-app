// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import IntentsPage from '../page';

const routerMock = vi.hoisted(() => ({
    push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMock,
}));

interface CategoryFixture {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
    keyword_count: number;
    response_count: number;
    keywords_preview: string[];
}

const emptyCategories: CategoryFixture[] = [];

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function renderPage() {
    return render(
        <ToastProvider>
            <IntentsPage />
        </ToastProvider>
    );
}

function mockInitialCategories(categories: CategoryFixture[] = emptyCategories) {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(categories));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

async function waitForInitialFetch(fetchMock: ReturnType<typeof vi.fn>) {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/intents/categories'));
}

async function openCreateModal(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: '+ New Category' }));
    fireEvent.change(screen.getByLabelText('ชื่อ Category'), { target: { value: 'หมวดใหม่' } });
}

describe('IntentsPage create-category flow', () => {
    beforeEach(() => {
        routerMock.push.mockReset();
        vi.unstubAllGlobals();
    });

    it('creates a draft and redirects to configuration on the primary submit', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ id: 123 }));
        vi.stubGlobal('fetch', fetchMock);

        renderPage();
        await waitForInitialFetch(fetchMock);
        await openCreateModal(user);
        await user.click(screen.getByRole('button', { name: 'สร้างและตั้งค่าต่อ' }));

        await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/admin/auto-replies/123?created=1'));
        const [, postInit] = fetchMock.mock.calls[1];
        expect(JSON.parse(postInit.body as string)).toMatchObject({
            name: 'หมวดใหม่',
            is_active: false,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('creates a draft, refetches, closes the modal, and does not redirect on secondary submit', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ id: 123 }))
            .mockResolvedValueOnce(jsonResponse([{ id: 123, name: 'หมวดใหม่', is_active: false, keyword_count: 0, response_count: 0, keywords_preview: [] }]));
        vi.stubGlobal('fetch', fetchMock);

        renderPage();
        await waitForInitialFetch(fetchMock);
        await openCreateModal(user);
        await user.click(screen.getByRole('button', { name: 'สร้างอย่างเดียว' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(routerMock.push).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(screen.getByText('หมวดใหม่')).toBeInTheDocument();
    });

    it('ignores duplicate primary submits while the POST is in flight', async () => {
        const user = userEvent.setup();
        let resolvePost: (response: Response) => void = () => {};
        const postPromise = new Promise<Response>((resolve) => {
            resolvePost = resolve;
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockReturnValueOnce(postPromise);
        vi.stubGlobal('fetch', fetchMock);

        renderPage();
        await waitForInitialFetch(fetchMock);
        await openCreateModal(user);
        const primary = screen.getByRole('button', { name: 'สร้างและตั้งค่าต่อ' });

        await user.dblClick(primary);
        expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/v1/admin/intents/categories' && init?.method === 'POST')).toHaveLength(1);
        expect(primary).toBeDisabled();

        resolvePost(jsonResponse({ id: 123 }));
        await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/admin/auto-replies/123?created=1'));
    });

    it('keeps the modal open, focuses the name field, and maps 400 errors to Thai copy', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ detail: 'duplicate' }, 400));
        vi.stubGlobal('fetch', fetchMock);

        renderPage();
        await waitForInitialFetch(fetchMock);
        await openCreateModal(user);
        await user.click(screen.getByRole('button', { name: 'สร้างและตั้งค่าต่อ' }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('ชื่อ Category นี้ถูกใช้แล้ว หรือข้อมูลไม่ถูกต้อง');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText('ชื่อ Category')).toHaveFocus();
        expect(routerMock.push).not.toHaveBeenCalled();
    });

    it('does not navigate to an undefined category when the configure response has no id', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({}))
            .mockResolvedValueOnce(jsonResponse([{ id: 124, name: 'หมวดใหม่', is_active: false, keyword_count: 0, response_count: 0, keywords_preview: [] }]));
        vi.stubGlobal('fetch', fetchMock);

        renderPage();
        await waitForInitialFetch(fetchMock);
        await openCreateModal(user);
        await user.click(screen.getByRole('button', { name: 'สร้างและตั้งค่าต่อ' }));

        await screen.findByText('สร้าง Category แล้ว แต่ระบบยังไม่สามารถเปิดหน้าตั้งค่าต่อได้');
        expect(routerMock.push).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('shows readiness badges for incomplete rows and hides them for ready rows', async () => {
        const fetchMock = mockInitialCategories([
            { id: 1, name: 'Draft empty', is_active: false, keyword_count: 0, response_count: 0, keywords_preview: [] },
            { id: 2, name: 'Live missing response', is_active: true, keyword_count: 1, response_count: 0, keywords_preview: ['hello'] },
            { id: 3, name: 'Ready', is_active: true, keyword_count: 1, response_count: 1, keywords_preview: ['ready'] },
        ]);

        renderPage();
        await waitForInitialFetch(fetchMock);

        expect(await screen.findByText('ยังไม่พร้อมใช้งาน')).toBeInTheDocument();
        expect(screen.getByText('ยังไม่มีข้อความตอบกลับ')).toBeInTheDocument();
        expect(screen.queryByText('Ready', { selector: '.rounded-full' })).not.toBeInTheDocument();
    });

    it('blocks enabling an incomplete category and shows a warning toast without a PUT', async () => {
        const user = userEvent.setup();
        const fetchMock = mockInitialCategories([
            { id: 1, name: 'Draft empty', is_active: false, keyword_count: 0, response_count: 0, keywords_preview: [] },
        ]);

        renderPage();
        await waitForInitialFetch(fetchMock);
        await user.click(await screen.findByRole('button', { name: 'เปิดใช้งาน Category' }));

        expect(await screen.findByText('ต้องมีอย่างน้อย 1 คีย์เวิร์ดและ 1 ข้อความตอบกลับก่อนเปิดใช้งาน')).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    });
});
