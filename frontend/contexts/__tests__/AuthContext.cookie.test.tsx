import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

/**
 * Unit tests for the cookie-mode AuthContext (PR 2C).
 * Covers FR3 (bootstrap), FR4 (migration), FR6 (logout).
 */

// Mock authFetch so the interceptor doesn't install in jsdom (avoids heap OOM
// from the fetch-mock chain in the interceptor). The interceptor's cookie-mode
// behavior is covered by authFetch.cookie.test.ts.
vi.mock('@/lib/authFetch', () => ({
  installAdminAuthFetchInterceptor: vi.fn(),
  setAuthRefreshHandler: vi.fn(),
}));

// Static import — COOKIE_AUTH is true at module load.
import { AuthProvider, useAuth } from '../AuthContext';

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
  // Capture in an effect (react-hooks/immutability forbids render-time
  // mutation; ref-style names are the rule's sanctioned mutable escape).
  // Tests read the snapshot via waitFor, so post-render capture works.
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

const ME_USER = { id: 1, username: 'admin', role: 'ADMIN', display_name: 'Admin' };

describe('AuthContext — cookie mode', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    if (typeof globalThis.BroadcastChannel === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).BroadcastChannel = class {
        postMessage() {}
        close() {}
        set onmessage(_: unknown) {}
      };
    }
    originalFetch = global.fetch;
    localStorage.clear();
    hoisted.replace.mockClear();
    // Reset the interceptor install guard so each test captures its own mock
    // as the interceptor's nativeFetch.
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('bootstraps from GET /auth/me: 200 → authenticated', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ...ME_USER, csrf_token: 'csrf-1' }),
    );
    global.fetch = fetchMock;
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });
    expect(snapshot.current?.isLoading).toBe(false);
    expect(snapshot.current?.user).toEqual(ME_USER);
    const meCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string).includes('/auth/me'),
    );
    expect(meCall).toBeDefined();
    expect((meCall![1] as RequestInit).credentials).toBe('include');
  });

  it('bootstraps from GET /auth/me: 401 → unauthenticated', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401));
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    // Wait for bootstrap to finish (isLoading false) before asserting the
    // outcome — isAuthenticated is false in the initial state too, so waiting
    // on it directly passes before /auth/me resolves.
    await waitFor(() => {
      expect(snapshot.current?.isLoading).toBe(false);
    });
    expect(snapshot.current?.isAuthenticated).toBe(false);
  });

  it('migrates legacy Bearer token then bootstraps (FR4)', async () => {
    localStorage.setItem('auth_token', 'legacy-jwt');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrf_token: 'csrf-mig' }))
      .mockResolvedValueOnce(jsonResponse(200, { ...ME_USER, csrf_token: 'csrf-1' }));
    global.fetch = fetchMock;
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });
    const migrateCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string).includes('/migrate-session'),
    );
    expect(migrateCall).toBeDefined();
    expect(new Headers((migrateCall![1] as RequestInit).headers).get('Authorization')).toBe('Bearer legacy-jwt');
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('migration failure clears legacy storage and goes unauthenticated (FR4)', async () => {
    localStorage.setItem('auth_token', 'legacy-jwt');
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(401));
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isLoading).toBe(false);
    });
    expect(snapshot.current?.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('logout calls POST /auth/logout and goes unauthenticated (FR6)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ...ME_USER, csrf_token: 'csrf-1' }),
    );
    global.fetch = fetchMock;
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
      await snapshot.current?.logout();
    });
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(false);
    });
    const logoutCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string).includes('/auth/logout'),
    );
    expect(logoutCall).toBeDefined();
    expect(hoisted.replace).toHaveBeenCalledWith('/login');
  });
});

