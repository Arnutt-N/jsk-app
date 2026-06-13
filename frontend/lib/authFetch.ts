declare global {
  interface Window {
    __JSK_ADMIN_AUTH_FETCH_INSTALLED__?: boolean;
    __JSK_ADMIN_AUTH_TOKEN__?: string | null;
  }
}

/**
 * Refresh handler registered by AuthContext. Returns a fresh access token,
 * or null when refresh is impossible (no refresh token / refresh rejected).
 * Kept here (not in React) so the fetch interceptor can transparently
 * refresh + retry an admin request that 401s on an expired access token.
 */
type RefreshHandler = () => Promise<string | null>;
let refreshHandler: RefreshHandler | null = null;

// Single in-flight refresh shared across concurrent 401s, so a burst of
// expired-token requests triggers exactly ONE /auth/refresh call.
let inflightRefresh: Promise<string | null> | null = null;

export function setAuthRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

async function runRefresh(): Promise<string | null> {
  if (!refreshHandler) {
    return null;
  }
  if (!inflightRefresh) {
    const handler = refreshHandler;
    inflightRefresh = (async () => {
      try {
        return await handler();
      } catch {
        return null;
      } finally {
        inflightRefresh = null;
      }
    })();
  }
  return inflightRefresh;
}

// Fired only for an admin request that 401s and could NOT be recovered by a
// silent refresh. AuthContext listens for this to logout. Deliberately NOT
// fired for login/refresh 401s (bad credentials etc.) so those keep their own
// error handling instead of being turned into a logout.
function notifyAuthExpired(res: Response): Response {
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('jsk:auth-expired', { detail: { response: res.clone() } }))
  }
  return notifyForbidden(res)
}

function notifyForbidden(res: Response): Response {
  if (res.status === 403) {
    window.dispatchEvent(new CustomEvent('jsk:forbidden', { detail: { response: res.clone() } }))
  }
  return res
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof Request) {
    return input.url;
  }

  return input.toString();
}

function isAdminApiRequest(input: RequestInfo | URL): boolean {
  return getRequestUrl(input).includes('/api/v1/admin/');
}

// Never refresh+retry the refresh call itself (guards against recursion).
function isRefreshRequest(input: RequestInfo | URL): boolean {
  return getRequestUrl(input).includes('/auth/refresh');
}

function hasAuthorizationHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
  const initHeaders = new Headers(init?.headers);
  if (initHeaders.has('Authorization')) {
    return true;
  }

  if (input instanceof Request) {
    return new Headers(input.headers).has('Authorization');
  }

  return false;
}

function buildAuthHeaders(headersInit: HeadersInit | undefined, token: string): Headers {
  const headers = new Headers(headersInit);
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

export function installAdminAuthFetchInterceptor(): void {
  if (typeof window === 'undefined' || window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = window.__JSK_ADMIN_AUTH_TOKEN__ ?? null;

    try {
      // Pass through untouched: no token, non-admin call, or caller already
      // set its own Authorization (e.g. AuthContext's /auth/refresh). A 401
      // here (e.g. bad login credentials) must NOT trigger a logout.
      if (!token || !isAdminApiRequest(input) || hasAuthorizationHeader(input, init)) {
        return notifyForbidden(await nativeFetch(input, init));
      }

      // Admin API with an injected bearer token. On 401 (expired token),
      // refresh once and retry the same request a single time.
      const canRetry = !isRefreshRequest(input);

      if (input instanceof Request) {
        // Clone before sending: the first attempt consumes the body stream,
        // so a retry must be built from an untouched copy.
        const retrySource = input.clone();
        const firstRes = await nativeFetch(
          new Request(input, { headers: buildAuthHeaders(input.headers, token) })
        );

        if (firstRes.status !== 401 || !canRetry) {
          return notifyAuthExpired(firstRes);
        }

        const newToken = await runRefresh();
        if (!newToken) {
          return notifyAuthExpired(firstRes);
        }

        const retriedRes = await nativeFetch(
          new Request(retrySource, { headers: buildAuthHeaders(retrySource.headers, newToken) })
        );
        return notifyAuthExpired(retriedRes);
      }

      const firstRes = await nativeFetch(input, {
        ...init,
        headers: buildAuthHeaders(init?.headers, token),
      });

      if (firstRes.status !== 401 || !canRetry) {
        return notifyAuthExpired(firstRes);
      }

      const newToken = await runRefresh();
      if (!newToken) {
        return notifyAuthExpired(firstRes);
      }

      const retriedRes = await nativeFetch(input, {
        ...init,
        headers: buildAuthHeaders(init?.headers, newToken),
      });
      return notifyAuthExpired(retriedRes);
    } catch (error: unknown) {
      const url = getRequestUrl(input);
      if (error instanceof TypeError && (error.message === 'Failed to fetch' || error.message === 'Load failed')) {
        throw new TypeError(
          `ไม่สามารถเชื่อมต่อ Backend ได้ (${url}) — กรุณาตรวจสอบว่า Backend เปิดอยู่`,
          { cause: error }
        );
      }
      throw error;
    }
  }) as typeof window.fetch;

  window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = true;
}

export function syncAdminAuthToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.__JSK_ADMIN_AUTH_TOKEN__ = token;
}
