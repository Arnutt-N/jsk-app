import { getCsrfToken } from '@/lib/csrfStore';

declare global {
  interface Window {
    __JSK_ADMIN_AUTH_FETCH_INSTALLED__?: boolean;
  }
}

/**
 * Refresh handler registered by AuthContext. Returns a truthy sentinel on
 * success, or null when refresh is impossible. Kept here (not in React) so
 * the fetch interceptor can transparently refresh + retry an admin request
 * that 401s on an expired access token.
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
// silent refresh. AuthContext listens for this to logout.
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

function isApiRequest(input: RequestInfo | URL): boolean {
  return getRequestUrl(input).includes('/api/v1/');
}

// Never refresh+retry the refresh call itself (guards against recursion).
function isRefreshRequest(input: RequestInfo | URL): boolean {
  return getRequestUrl(input).includes('/auth/refresh');
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  return method.toUpperCase();
}

function buildCookieHeaders(headersInit: HeadersInit | undefined): Headers {
  const headers = new Headers(headersInit);
  const csrf = getCsrfToken();
  if (csrf) {
    headers.set('X-CSRF-Token', csrf);
  }
  return headers;
}

/**
 * Cookie-mode fetch handler. Sends `credentials: 'include'` (HttpOnly auth
 * cookies) + an `X-CSRF-Token` header on mutating API requests (the backend
 * enforces CSRF on every cookie-sourced mutation, e.g. POST /auth/ws-ticket,
 * not just admin endpoints). On a 401, single-flight refreshes once
 * (runRefresh) and retries once.
 */
async function handleCookieModeFetch(
  nativeFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const canRetry = !isRefreshRequest(input);
  const needsCsrf =
    isApiRequest(input) && MUTATING_METHODS.has(getRequestMethod(input, init));

  const cookieRequestInit = (baseInit?: RequestInit): RequestInit => ({
    ...baseInit,
    credentials: 'include',
    headers: needsCsrf ? buildCookieHeaders(baseInit?.headers) : new Headers(baseInit?.headers),
  });

  if (input instanceof Request) {
    const retrySource = input.clone();
    const firstRes = await nativeFetch(
      new Request(input, cookieRequestInit({ headers: input.headers })),
    );

    if (firstRes.status !== 401 || !canRetry) {
      return notifyAuthExpired(firstRes);
    }

    const refreshed = await runRefresh();
    if (!refreshed) {
      return notifyAuthExpired(firstRes);
    }

    const retriedRes = await nativeFetch(
      new Request(retrySource, cookieRequestInit({ headers: retrySource.headers })),
    );
    return notifyAuthExpired(retriedRes);
  }

  const firstRes = await nativeFetch(input, cookieRequestInit(init));

  if (firstRes.status !== 401 || !canRetry) {
    return notifyAuthExpired(firstRes);
  }

  const refreshed = await runRefresh();
  if (!refreshed) {
    return notifyAuthExpired(firstRes);
  }

  const retriedRes = await nativeFetch(input, cookieRequestInit(init));
  return notifyAuthExpired(retriedRes);
}

export function installAdminAuthFetchInterceptor(): void {
  if (typeof window === 'undefined' || window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      return await handleCookieModeFetch(nativeFetch, input, init);
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
