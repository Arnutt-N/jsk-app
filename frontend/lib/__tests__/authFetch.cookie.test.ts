import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAdminAuthFetchInterceptor, setAuthRefreshHandler } from '../authFetch';
import { setCsrfToken, clearCsrfToken } from '../csrfStore';

/**
 * Unit tests for the cookie-mode fetch interceptor (PR 2C).
 * Cookie auth is now the unconditional path — no env flag needed.
 */

const ADMIN_POST = '/api/v1/admin/requests';
const ADMIN_GET = '/api/v1/admin/requests';

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('admin auth fetch interceptor — cookie mode', () => {
  const originalFetch = window.fetch;
  let nativeFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nativeFetch = vi.fn();
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
    window.fetch = nativeFetch as unknown as typeof window.fetch;
    setAuthRefreshHandler(null);
    clearCsrfToken();
    installAdminAuthFetchInterceptor();
  });

  afterEach(() => {
    setAuthRefreshHandler(null);
    clearCsrfToken();
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
    window.fetch = originalFetch;
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

  it('attaches X-CSRF-Token on non-admin API POST (ws-ticket)', async () => {
    setCsrfToken('csrf-xyz');
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch('/api/v1/auth/ws-ticket', { method: 'POST' });
    const init = nativeFetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-xyz');
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

  it('does NOT refresh or retry a login 401 (F-012)', async () => {
    // A wrong password answers 401 at /auth/login. Refreshing there is
    // pointless — the session was never the problem — and it hides the real
    // answer behind a refresh cycle.
    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    const refresh = vi.fn().mockResolvedValue('cookie-refreshed');
    setAuthRefreshHandler(refresh);

    const res = await window.fetch('/api/v1/auth/login', { method: 'POST' });

    expect(refresh).not.toHaveBeenCalled();
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('does NOT refresh or retry a migrate-session 401 (F-012)', async () => {
    const refresh = vi.fn().mockResolvedValue('cookie-refreshed');
    setAuthRefreshHandler(refresh);

    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    const res = await window.fetch('/api/v1/auth/migrate-session', { method: 'POST' });

    expect(refresh).not.toHaveBeenCalled();
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('DOES refresh and retry a ws-ticket 401: it mints for an existing session', async () => {
    // The ticket mints against the current session, so a 401 means the access
    // token expired — exactly what refresh-then-replay recovers. Treating it as
    // an auth-entry endpoint made an expired token kill the socket for good.
    nativeFetch
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200));
    const refresh = vi.fn().mockResolvedValue('cookie-refreshed');
    setAuthRefreshHandler(refresh);

    const res = await window.fetch('/api/v1/auth/ws-ticket', { method: 'POST' });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(nativeFetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('still refreshes an expired-session 401 on a regular admin call (F-012)', async () => {
    nativeFetch
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200));
    const refresh = vi.fn().mockResolvedValue('cookie-refreshed');
    setAuthRefreshHandler(refresh);

    const res = await window.fetch(ADMIN_GET);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(nativeFetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
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

  it('bypasses non-API traffic without credentials', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch('https://cdn.example.com/lib.js');
    expect(nativeFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/lib.js',
      undefined
    );
  });

  it('does NOT refresh or signal auth-expired on non-API 401', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    const refresh = vi.fn().mockResolvedValue('cookie-refreshed');
    setAuthRefreshHandler(refresh);
    const onExpired = vi.fn();
    window.addEventListener('jsk:auth-expired', onExpired);

    const res = await window.fetch('https://cdn.example.com/lib.js');

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    window.removeEventListener('jsk:auth-expired', onExpired);
  });

  it('rethrows the ORIGINAL network error on non-API traffic (no rewrap)', async () => {
    const original = new TypeError('Failed to fetch');
    nativeFetch.mockRejectedValueOnce(original);
    await expect(window.fetch('https://cdn.example.com/lib.js')).rejects.toBe(
      original
    );
  });

  it('bypasses URLs that merely contain /api/v1/ outside the pathname (F13)', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch('https://cdn.example.com/lib.js?from=/api/v1/admin');
    expect(nativeFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/lib.js?from=/api/v1/admin',
      undefined
    );
  });

  it('still intercepts absolute cross-origin API URLs (F13)', async () => {
    nativeFetch.mockResolvedValueOnce(jsonResponse(200));
    await window.fetch('https://koyeb.example.com/api/v1/admin/requests');
    const init = nativeFetch.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
  });
});
