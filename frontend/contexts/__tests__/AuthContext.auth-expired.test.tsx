import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

import { AuthProvider, useAuth } from '../AuthContext';
import { resetAuthStore, setAuthState } from '@/lib/authStore';
import { stubBroadcastChannel } from './broadcast-channel-stub';

vi.mock('@/lib/authFetch', () => ({
  installAdminAuthFetchInterceptor: vi.fn(),
  setAuthRefreshHandler: vi.fn(),
}));

const hoisted = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: hoisted.replace }),
}));

type AuthValue = ReturnType<typeof useAuth>;
type AuthSnapshot = { current: AuthValue | null };

function makeSnapshot(): AuthSnapshot {
  return { current: null };
}

function TestConsumer({ snapshot: snapshotRef }: { snapshot: AuthSnapshot }) {
  const auth = useAuth();
  React.useEffect(() => {
    snapshotRef.current = auth;
  });
  return null;
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ME_USER = { id: '1', username: 'admin', role: 'ADMIN', display_name: 'Admin' } as const;

describe('AuthContext — direct 401 (jsk:auth-expired) verifies before logout', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    stubBroadcastChannel();
    originalFetch = global.fetch;
    localStorage.clear();
    resetAuthStore();
    hoisted.replace.mockClear();
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the session when jsk:auth-expired fires but /auth/me is 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ME_USER));
    global.fetch = fetchMock;
    setAuthState({ user: { ...ME_USER }, status: 'authenticated' });
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('jsk:auth-expired'));
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/auth/me'))).toBe(true);
    });
    expect(snapshot.current?.isAuthenticated).toBe(true);
    expect(hoisted.replace).not.toHaveBeenCalledWith('/login');
  });

  it('logs out and routes to /login when jsk:auth-expired fires and /auth/me is 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401));
    global.fetch = fetchMock;
    setAuthState({ user: { ...ME_USER }, status: 'authenticated' });
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('jsk:auth-expired'));
    });

    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(false);
    });
    expect(hoisted.replace).toHaveBeenCalledWith('/login');
  });
});
