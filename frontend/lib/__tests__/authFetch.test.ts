import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installAdminAuthFetchInterceptor,
  syncAdminAuthToken,
  setAuthRefreshHandler,
} from '../authFetch';

/**
 * Unit tests for the admin fetch interceptor's silent token refresh.
 *
 * The interceptor monkey-patches window.fetch, capturing the current
 * window.fetch as its "native" fetch at install time. Each test installs a
 * fresh vi.fn() as the native fetch, so we can drive 401/200 sequences and
 * assert refresh + retry behaviour without a real backend.
 */

const ADMIN_URL = '/api/v1/admin/requests';

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('admin auth fetch interceptor — silent refresh + retry', () => {
  const originalFetch = window.fetch;
  let nativeFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nativeFetch = vi.fn();
    // Reset the install guard + token so each test installs against its own
    // native fetch mock.
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
    window.fetch = nativeFetch as unknown as typeof window.fetch;
    setAuthRefreshHandler(null);
    syncAdminAuthToken(null);
    installAdminAuthFetchInterceptor();
  });

  afterEach(() => {
    setAuthRefreshHandler(null);
    syncAdminAuthToken(null);
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false;
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('refreshes and retries once with the new token on a 401', async () => {
    syncAdminAuthToken('expired-token');
    nativeFetch
      .mockResolvedValueOnce(jsonResponse(401)) // first attempt — expired
      .mockResolvedValueOnce(jsonResponse(200)); // retry — fresh token
    const refresh = vi.fn().mockResolvedValue('fresh-token');
    setAuthRefreshHandler(refresh);

    const res = await window.fetch(ADMIN_URL);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(nativeFetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);

    const retryInit = nativeFetch.mock.calls[1][1] as RequestInit;
    expect(new Headers(retryInit.headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('does not retry and signals auth-expired when refresh fails', async () => {
    syncAdminAuthToken('expired-token');
    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    setAuthRefreshHandler(vi.fn().mockResolvedValue(null));
    const onExpired = vi.fn();
    window.addEventListener('jsk:auth-expired', onExpired);

    const res = await window.fetch(ADMIN_URL);

    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
    expect(onExpired).toHaveBeenCalledTimes(1);

    window.removeEventListener('jsk:auth-expired', onExpired);
  });

  it('refreshes only once for concurrent 401s (dedupe)', async () => {
    syncAdminAuthToken('expired-token');
    // 401 unless the request carries the refreshed token.
    nativeFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization');
      return Promise.resolve(jsonResponse(auth === 'Bearer fresh-token' ? 200 : 401));
    });
    let resolveRefresh: (token: string) => void = () => {};
    const refresh = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolveRefresh = resolve;
      })
    );
    setAuthRefreshHandler(refresh);

    const p1 = window.fetch(ADMIN_URL);
    const p2 = window.fetch(ADMIN_URL);
    // Drain microtasks so both first attempts 401 and both reach runRefresh
    // before the single in-flight refresh resolves.
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveRefresh('fresh-token');
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('retries at most once even if the refreshed token still 401s', async () => {
    syncAdminAuthToken('expired-token');
    nativeFetch.mockResolvedValue(jsonResponse(401)); // always 401
    const refresh = vi.fn().mockResolvedValue('fresh-token');
    setAuthRefreshHandler(refresh);

    const res = await window.fetch(ADMIN_URL);

    expect(nativeFetch).toHaveBeenCalledTimes(2); // first + exactly one retry
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('does not refresh non-admin requests', async () => {
    syncAdminAuthToken('expired-token');
    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    const refresh = vi.fn();
    setAuthRefreshHandler(refresh);

    const res = await window.fetch('/api/v1/liff/profile');

    expect(refresh).not.toHaveBeenCalled();
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('does not refresh when the caller set its own Authorization', async () => {
    syncAdminAuthToken('expired-token');
    nativeFetch.mockResolvedValueOnce(jsonResponse(401));
    const refresh = vi.fn();
    setAuthRefreshHandler(refresh);

    const res = await window.fetch(ADMIN_URL, {
      headers: { Authorization: 'Bearer caller-set' },
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });
});
