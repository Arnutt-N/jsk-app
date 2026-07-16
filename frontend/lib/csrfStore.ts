/**
 * In-memory CSRF token store for cookie-auth mode (P1.1b / PR 2B).
 *
 * The CSRF token is returned by the backend in login/refresh/me response
 * bodies (`csrf_token` field) and must be echoed back on state-changing
 * requests via the `X-CSRF-Token` header (double-submit: the server compares
 * the header against the HttpOnly `csrf_token` cookie with `compare_digest`).
 *
 * It is deliberately NEVER persisted to localStorage — an XSS that can read
 * module memory can already call fetch, so persisting adds exfil risk with no
 * benefit. On page reload the token is re-bootstrapped from `GET /auth/me`.
 */

let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}
