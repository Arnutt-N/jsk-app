declare global {
  interface Window {
    __JSK_ADMIN_AUTH_FETCH_INSTALLED__?: boolean;
    __JSK_ADMIN_AUTH_TOKEN__?: string | null;
  }
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
      if (!token || !isAdminApiRequest(input) || hasAuthorizationHeader(input, init)) {
        return await nativeFetch(input, init);
      }

      if (input instanceof Request) {
        const request = new Request(input, {
          ...init,
          headers: buildAuthHeaders(init?.headers ?? input.headers, token),
        });
        return await nativeFetch(request);
      }

      return await nativeFetch(input, {
        ...init,
        headers: buildAuthHeaders(init?.headers, token),
      });
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
