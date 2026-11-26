// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import UserDetailPage from '../page';

const { params, mockPush } = vi.hoisted(() => ({
  params: { id: '2' },
  mockPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => params,
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => 'edit' }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', role: 'SUPER_ADMIN' } }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function okResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}

function makeUser(id: number, name: string) {
  return {
    id,
    username: `user${id}`,
    email: null,
    display_name: name,
    picture_url: null,
    role: 'AGENT',
    is_active: true,
    line_user_id: null,
    created_at: null,
    updated_at: null,
  };
}

describe('UserDetailPage request order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params.id = '2';
  });

  it('keeps the new route profile when the old route resolves late', async () => {
    const old = deferred<Response>();
    const fresh = deferred<Response>();
    mockFetch.mockImplementation((url: string) => {
      if (String(url).endsWith('/admin/users/2')) return old.promise;
      return fresh.promise;
    });

    const view = render(<UserDetailPage />);
    params.id = '3';
    view.rerender(<UserDetailPage />);

    fresh.resolve(okResponse(makeUser(3, 'Agent Three')));
    expect(await screen.findByText('Agent Three')).toBeInTheDocument();

    old.resolve(okResponse(makeUser(2, 'Agent Two')));
    await waitFor(() => expect(screen.queryByText('Agent Two')).not.toBeInTheDocument());
    expect(screen.getByText('Agent Three')).toBeInTheDocument();
  });

  it('does not save a profile loaded for another route id', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(okResponse(makeUser(2, 'Agent Two'))));
    params.id = '3';
    render(<UserDetailPage />);
    await screen.findByText('Agent Two');

    fireEvent.change(screen.getByDisplayValue('Agent Two'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(mockFetch.mock.calls.some((c) => String(c[1]?.method).toUpperCase() === 'PUT')).toBe(false);
  });
});
