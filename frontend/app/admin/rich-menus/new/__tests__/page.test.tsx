// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import NewRichMenuPage from '../page';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

describe('NewRichMenuPage — display period Thai schedule', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function renderPage() {
        // The create page makes no mount requests; stub fetch defensively.
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
        return render(
            <ToastProvider>
                <NewRichMenuPage />
            </ToastProvider>,
        );
    }

    it('schedules with the Thai (พ.ศ.) picker + time inputs, not datetime-local', () => {
        const { container } = renderPage();

        // DOM order: ALWAYS, SCHEDULED, MANUAL — the wrapping labels contain
        // long descriptions, so select the radios by role + index.
        const radios = screen.getAllByRole('radio');
        expect(radios.length).toBeGreaterThanOrEqual(2);
        fireEvent.click(radios[1]);

        expect(screen.getByLabelText('วันที่เริ่มแสดง')).toBeInTheDocument();
        expect(screen.getByLabelText('เวลาเริ่มแสดง')).toBeInTheDocument();
        expect(screen.getByLabelText('วันที่ซ่อนเมื่อถึง')).toBeInTheDocument();
        expect(screen.getByLabelText('เวลาซ่อนเมื่อถึง')).toBeInTheDocument();
        // P2 closure: no native Gregorian date entry left on the page.
        expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    });
});
