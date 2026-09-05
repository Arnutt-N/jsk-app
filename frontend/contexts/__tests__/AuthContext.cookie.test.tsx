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
import { resetAuthStore, setAuthState } from '@/lib/authStore';

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
    resetAuthStore();
    hoisted.replace.mockClear();
    // Reset the interceptor install guard so each test captures its own mock
    // as the interceptor's nativeFetch.
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    vi.useRealTimers();
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

  it('bootstrap retries a transient 5xx then authenticates', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200, { ...ME_USER, csrf_token: 'csrf-1' }));
    global.fetch = fetchMock;
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const meCalls = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).includes('/auth/me'),
    );
    expect(meCalls).toHaveLength(2);
    expect(snapshot.current?.isAuthenticated).toBe(true);
    expect(snapshot.current?.bootstrapFailed).toBe(false);
  });

  it('bootstrap exhausting transient retries → bootstrapFailed (NOT unauthenticated), retryBootstrap recovers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503));
    global.fetch = fetchMock;
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(
      fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/auth/me')),
    ).toHaveLength(4);
    expect(snapshot.current?.bootstrapFailed).toBe(true);
    expect(snapshot.current?.isAuthenticated).toBe(false);
    expect(snapshot.current?.isLoading).toBe(false);
    // A guard must NOT have been sent to /login: auth state is unknown.
    expect(hoisted.replace).not.toHaveBeenCalled();

    // Backend recovers → retryBootstrap re-runs the bootstrap and succeeds.
    fetchMock.mockResolvedValue(jsonResponse(200, { ...ME_USER, csrf_token: 'csrf-1' }));
    await act(async () => {
      snapshot.current?.retryBootstrap();
      await vi.runAllTimersAsync();
    });
    expect(snapshot.current?.isAuthenticated).toBe(true);
    expect(snapshot.current?.bootstrapFailed).toBe(false);
  });

  it('bootstrap network errors on all attempts → bootstrapFailed', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    global.fetch = fetchMock;
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(snapshot.current?.bootstrapFailed).toBe(true);
    expect(snapshot.current?.isAuthenticated).toBe(false);
    expect(snapshot.current?.isLoading).toBe(false);
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

describe('shared auth store across provider trees (login-flake fix)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    resetAuthStore();
    originalFetch = global.fetch;
    localStorage.clear();
    hoisted.replace.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('a freshly mounted provider does not re-verify when the store already holds a session', async () => {
    setAuthState({ user: { id: '1', username: 'admin', role: 'ADMIN' }, status: 'authenticated' });
    // 500 on every call: if the provider wrongly re-bootstraps, it retries
    // with backoff and never reports authenticated -> waitFor times out.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500));
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
    expect(snapshot.current?.user?.username).toBe('admin');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('state survives a provider tree swap: unmount + remount needs no /me round-trip', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ...ME_USER, csrf_token: 'csrf-1' }),
    );
    global.fetch = fetchMock;
    const first = makeSnapshot();
    const { unmount } = render(
      <AuthProvider>
        <TestConsumer snapshot={first} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(first.current?.isAuthenticated).toBe(true);
    });
    const callsAfterFirstMount = fetchMock.mock.calls.length;
    unmount();

    // Mirrors the /login -> /admin client-side navigation: a NEW provider
    // tree mounts while the shared store already holds the session.
    const second = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={second} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(second.current?.isAuthenticated).toBe(true);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstMount);
  });
});

describe('cross-tab logout broadcast (login-flake fix)', () => {
  let originalFetch: typeof global.fetch;

  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: { data?: unknown }) => void) | null = null;
    postMessage = vi.fn();
    close = vi.fn();
    constructor() {
      MockChannel.instances.push(this);
    }
  }

  beforeEach(() => {
    resetAuthStore();
    originalFetch = global.fetch;
    localStorage.clear();
    hoisted.replace.mockClear();
    MockChannel.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).BroadcastChannel = MockChannel;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function renderAuthenticated(): Promise<AuthSnapshot> {
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });
    return snapshot;
  }

  it('keeps the session when a logout broadcast arrives but the server still recognises us', async () => {
    // /auth/me 200: our session is valid — the broadcast was another tab's.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ME_USER));
    global.fetch = fetchMock;
    const snapshot = await renderAuthenticated();

    const channel = MockChannel.instances[0];
    expect(channel).toBeDefined();
    await act(async () => {
      channel.onmessage?.({ data: { type: 'logout' } });
    });

    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });
    expect(hoisted.replace).not.toHaveBeenCalledWith('/login');
  });

  it('clears the session when a logout broadcast arrives and the server says 401', async () => {
    // /auth/me 401 (definitive, non-transient): the broadcast is about us.
    // The 401 mock is global, so seed the session via the store — the
    // bootstrap skip-guard keeps the mount fetch-free.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401));
    global.fetch = fetchMock;
    setAuthState({ user: { id: '1', username: 'admin', role: 'ADMIN' }, status: 'authenticated' });
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(true);
    });

    const channel = MockChannel.instances[0];
    await act(async () => {
      channel.onmessage?.({ data: { type: 'expired' } });
    });

    await waitFor(() => {
      expect(snapshot.current?.isAuthenticated).toBe(false);
    });
    expect(hoisted.replace).toHaveBeenCalledWith('/login');
  });

  it('a tab that was never authenticated does not log out or broadcast on auth-expired', async () => {
    // Unauthenticated tab (e.g. its own /login bootstrap 401 chain) — the
    // auth-expired event must not trigger logout()/broadcast: it has no
    // session to end and must not evict other tabs.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    global.fetch = fetchMock;
    setAuthState({ user: null, status: 'unauthenticated' });
    const snapshot = makeSnapshot();
    render(
      <AuthProvider>
        <TestConsumer snapshot={snapshot} />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(snapshot.current?.isLoading).toBe(false);
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('jsk:auth-expired'));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(MockChannel.instances.every((c) => c.postMessage.mock.calls.length === 0)).toBe(true);
    expect(hoisted.replace).not.toHaveBeenCalledWith('/login');
  });
});

