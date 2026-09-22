// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import BroadcastCreatePage from '../new/page';

const routerMock = vi.hoisted(() => ({
    push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMock,
}));

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Walks the 4-step wizard to the final review step, then presses the
 * dry-run button. Asserts the POST body carries dry_run:true, the preview
 * box renders, and no navigation to a real broadcast happens.
 */
async function walkToDryRun(user: ReturnType<typeof userEvent.setup>) {
    // step 0: message type — text is default-selected, just advance
    await user.click(screen.getAllByRole('button', { name: /ถัดไป/ })[0]);

    // step 1: title + text content (target by placeholder — labels are
    // unassociated <label> elements)
    const titleInput = screen.getByPlaceholderText('เช่น แจ้งข่าวสารประจำเดือน');
    await user.type(titleInput, 'ทดสอบ dry-run');
    const contentArea = screen.getByPlaceholderText('พิมพ์ข้อความที่ต้องการส่ง...');
    await user.type(contentArea, 'สวัสดี');
    await user.click(screen.getAllByRole('button', { name: /ถัดไป/ })[0]);

    // step 2: audience — default "all", advance
    await user.click(screen.getAllByRole('button', { name: /ถัดไป/ })[0]);

    // step 3: review + send — press dry-run
    const dryRunBtn = await screen.findByRole('button', { name: 'ทดลองส่ง' });
    await user.click(dryRunBtn);
}

describe('BroadcastCreatePage dry-run button', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        routerMock.push.mockClear();
    });

    it('sends dry_run:true, shows preview, does not navigate', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                dry_run: true,
                title: 'ทดสอบ dry-run',
                message_type: 'text',
                estimated_recipients: null,
                messages_valid: true,
            })
        );
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();

        render(
            <ToastProvider>
                <BroadcastCreatePage />
            </ToastProvider>
        );

        await walkToDryRun(user);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/v1/admin/broadcasts',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"dry_run":true'),
                })
            );
        });

        expect(await screen.findByText(/ผลทดลองส่ง/)).toBeDefined();
        expect(routerMock.push).not.toHaveBeenCalled();
    });
});
