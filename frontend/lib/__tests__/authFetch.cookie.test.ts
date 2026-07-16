import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the cookie-mode fetch interceptor (P1.1b / PR 2B).
 *
 * Each test re-imports the module with NEXT_PUBLIC_COOKIE_AUTH=true so the
 * COOKIE_AUTH constant evaluates to true at module load. The existing
 * authFetch.test.ts covers the bearer (flag-off) path.
 */

const ADMIN_POST = '/api/v1/admin/requests';
const ADMIN_GET = '/api/v1/admin/requests';

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Re-imported in beforeEach with the env stubbed true.
let installAdminAuthFetchInterceptor: () => void;
let setAuthRefreshHandler: (h: (() => Promise<string | null>) | null) => void;
let syncAdminAuthToken: (t: string | null) => void;
let setCsrfToken: (t: string | null) => void;
let clearCsrfToken: () => void;

describe('admin auth fetch interceptor — cookie mode', () => {
  const originalFetch = window.fetch;
  let nativeFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_COOKIE_AUTH', 'true');
    const authFetch = await import('../authFetch');
    const csrfStore = await import('../csrfStore');
    installAdminAuthFetchInterceptor = authFetch.installAdminAuthFetchInterceptor;
    setAuthRefreshHandler = authFetch.setAuthRefreshHandler;
    syncAdminAuthToken = authFetch.syncAdminAuthToken;
    setCsrfToken = csrfStore.setCsrfToken;
    clearCsrfToken = csrfStore.clearCsrfToken;

    nativeFetch = vi.fn();
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
    window.fetch = nativeFetch as unknown as typeof window.fetch;
    setAuthRefreshHandler(null);
    syncAdminAuthToken(null);
    clearCsrfToken();
    installAdminAuthFetchInterceptor();
  });

  afterEach(() => {
    setAuthRefreshHandler(null);
    syncAdminAuthToken(null);
    clearCsrfToken();
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
    window.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends credentials: include on all requests', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch(ADMIN_GET);
    const init = nativeFetch.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('attaches X-CSRF-Token on admin POST when CSRF is set', async () => {
    setCsrfToken('csrf-xyz');
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch(ADMIN_POST, { method: 'POST' });
    const init = nativeFetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-xyz');
  });

  it('does NOT attach X-CSRF-Token on admin GET', async () => {
    setCsrfToken('csrf-xyz');
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch(ADMIN_GET, { method: 'GET' });
    const init = nativeFetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBeNull();
  });

  it('does NOT inject an Authorization header', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch(ADMIN_GET);
    const init = nativeFetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });

  it('refreshes once and retries on 401 (single-flight for N concurrent 401s)', async () => {
    nativeFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse(401)),
    );
    const refresh = vi.fn().mockResolvedValue('cookie-refreshed');
    setAuthRefreshHandler(refresh);

    const p1 = window.fetch(ADMIN_GET);
    const p2 = window.fetch(ADMIN_GET);
    await new Promise((r) => setTimeout(r, 0));
    const [r1, r2] = await Promise.all([p1, p2]);

    // Exactly one refresh call for two concurrent 401s (round-2 N3).
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(nativeFetch).toHaveBeenCalledTimes(4); // 2 first + 2 retry
    expect(r1.status).toBe(401); // retry still 401 (mock always 401)
    expect(r2.status).toBe(401);
  });

  it('signals auth-expired when refresh fails', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    setAuthRefreshHandler(vi.fn().mockResolvedValue(null));
    const onExpired = vi.fn();
    window.addEventListener('jsk:auth-expired', onExpired);

    const res = await window.fetch(ADMIN_GET);

    expect(res.status).toBe(401);
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener('jsk:auth-expired', onExpired);
  });
});
