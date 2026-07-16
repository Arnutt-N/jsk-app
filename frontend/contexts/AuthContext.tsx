'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { installAdminAuthFetchInterceptor, syncAdminAuthToken, setAuthRefreshHandler } from '@/lib/authFetch';
import { setCsrfToken, clearCsrfToken } from '@/lib/csrfStore';

// Cookie-auth mode gate (P1.1b / PR 2B). When true, the provider uses HttpOnly
// cookies + CSRF + server bootstrap instead of Bearer+localStorage.
const COOKIE_AUTH = process.env.NEXT_PUBLIC_COOKIE_AUTH === 'true';

// Multi-tab logout/expiry sync channel (cookie mode only).
const AUTH_CHANNEL_NAME = 'jsk:auth';

interface User {
  id: string;
  username: string;
  // Mirrors backend UserRole enum (backend/app/models/user.py).
  // DIRECTOR + HEAD added 2026-05-04 alongside the request workflow split.
  role: 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'HEAD' | 'AGENT' | 'USER';
  display_name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
const MOCK_ADMIN: User = {
  id: '1',
  username: 'admin',
  role: 'ADMIN',
  display_name: 'Administrator'
};

// Cookie-mode auth state machine — `isAuthenticated` is derived from this,
// NOT from token presence (eliminates the "stale localStorage token looks
// authenticated" class of bugs). Bearer mode keeps its existing logic.
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

// Legacy localStorage keys (cleared during one-time Bearer→cookie migration).
const LEGACY_TOKEN_KEY = 'auth_token';
const LEGACY_REFRESH_KEY = 'auth_refresh_token';
const LEGACY_USER_KEY = 'auth_user';

function clearLegacyAuthStorage(): void {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_ERROR'
  | 'AUTH_SERVICE_UNAVAILABLE'
  | 'UNKNOWN';

type AuthRequestError = Error & {
  status?: number;
  code?: AuthErrorCode;
};

function createAuthRequestError(
  message: string,
  status?: number,
  code: AuthErrorCode = 'UNKNOWN'
): AuthRequestError {
  const error = new Error(message) as AuthRequestError;
  error.status = status;
  error.code = code;
  return error;
}

function isAuthRequestError(error: unknown): error is AuthRequestError {
  return error instanceof Error && ('status' in error || 'code' in error);
}

function isTransientLoginStatus(status: number): boolean {
  return [500, 502, 503, 504].includes(status);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const payload = await response.json() as { detail?: string; message?: string };
      return payload.detail ?? payload.message ?? `Request failed with status ${response.status}`;
    }

    const text = (await response.text()).trim();
    return text || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 800 + attempt * 500));
}

/**
 * ตรวจสอบ dev bypass — ใช้ได้เฉพาะ development build + localhost เท่านั้น
 * process.env.NODE_ENV จะถูก dead-code eliminate ใน production build
 * ทำให้ฟังก์ชันนี้ return false เสมอใน production bundle
 *
 * ต้องมี dev_bypass ใน localStorage เสมอ (แม้ DEV_MODE=true)
 * เพื่อให้ logout ทำงานจริง — logout ลบ dev_bypass ออก
 */
function isLocalhostDevBypass(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal && localStorage.getItem('dev_bypass') === 'true';
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokenState, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Cookie-mode state machine (ignored in bearer mode — see isAuthenticated below).
  const [status, setStatus] = useState<AuthStatus>(COOKIE_AUTH ? 'loading' : 'authenticated');
  const router = useRouter();
  // BroadcastChannel for cross-tab logout/expiry sync (cookie mode only).
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Wrap setToken so the window-global mirror used by the fetch
  // interceptor is updated SYNCHRONOUSLY, before React schedules the
  // re-render. The previous useEffect-based sync ran AFTER children's
  // effects on update (React fires children's effects before parent's
  // on subsequent renders), so any child fetch fired during a token
  // change would see the stale window global and 401. Centralising the
  // sync here makes every authenticated page race-free without needing
  // belt-and-suspenders calls in each one.
  const token = tokenState;
  const setToken = useCallback((next: string | null) => {
    syncAdminAuthToken(next);
    setTokenState(next);
  }, []);

  useEffect(() => {
    installAdminAuthFetchInterceptor();
  }, []);

  // Bearer mode: restore auth state from localStorage on mount.
  // (Cookie mode uses the dedicated effect below — P1.1b / PR 2B.)
  useEffect(() => {
    if (COOKIE_AUTH) return;
    const initAuth = () => {
      try {
        // Dev bypass ต้องมี dev_bypass flag ใน localStorage เสมอ
        // DEV_MODE=true เพียงแค่อนุญาตให้ใช้ bypass ได้ — ไม่ได้หมายว่า auto-login
        const devBypassActive = (DEV_MODE || process.env.NODE_ENV === 'development') && isLocalhostDevBypass();
        if (devBypassActive) {
          setUser(MOCK_ADMIN);
          setToken(null);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_refresh_token');
          localStorage.setItem('auth_user', JSON.stringify(MOCK_ADMIN));
        } else {
          // Production mode: Restore from localStorage
          const storedToken = localStorage.getItem('auth_token');
          const storedUser = localStorage.getItem('auth_user');

          if (storedToken && storedUser) {
            if (isTokenExpired(storedToken)) {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('auth_refresh_token');
              localStorage.removeItem('auth_user');
              router.replace('/login');
              return;
            }
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [router]);
  // Cookie mode (P1.1b / PR 2B): one-time Bearer→cookie migration, then
  // bootstrap auth from GET /auth/me (HttpOnly cookies carry the session).
  useEffect(() => {
    if (!COOKIE_AUTH) return;

    let cancelled = false;

    const initCookieAuth = async () => {
      try {
        // One-time migration: if a legacy Bearer token is in localStorage,
        // exchange it for a cookie session before bootstrapping (FR4).
        const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
        if (legacyToken) {
          try {
            const migrateRes = await fetch('/api/v1/auth/migrate-session', {
              method: 'POST',
              headers: { Authorization: `Bearer ${legacyToken}` },
            });
            if (migrateRes.ok) {
              const migrateData = await migrateRes.json();
              if (migrateData.csrf_token) setCsrfToken(migrateData.csrf_token);
            }
            // Whether success or failure, clear legacy storage (one-time).
            clearLegacyAuthStorage();
          } catch {
            clearLegacyAuthStorage();
          }
        }

        // Bootstrap: GET /auth/me — cookies (set by login/refresh/migrate)
        // carry auth. 200 → authenticated; 401 → unauthenticated (FR3).
        const meRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
        if (cancelled) return;

        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.csrf_token) setCsrfToken(meData.csrf_token);
          // Strip csrf_token — it's a response-only field, not part of User.
          const { csrf_token: _csrf, ...userFields } = meData;
          setUser(userFields);
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      } catch (error) {
        console.error('Cookie auth initialization error:', error);
        setStatus('unauthenticated');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initCookieAuth();

    return () => { cancelled = true; };
  }, []);

  // Multi-tab logout/expiry sync via BroadcastChannel (cookie mode only, FR8).
  useEffect(() => {
    if (!COOKIE_AUTH) return;
    if (typeof BroadcastChannel === 'undefined') return;

    const bc = new BroadcastChannel(AUTH_CHANNEL_NAME);
    bcRef.current = bc;
    bc.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'logout' || event.data?.type === 'expired') {
        clearCsrfToken();
        setUser(null);
        setStatus('unauthenticated');
        router.replace('/login');
      }
    };

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [router]);



  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const maxAttempts = 4;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...(COOKIE_AUTH ? { credentials: 'include' as const } : {}),
            body: JSON.stringify({ username, password })
          });

          if (!response.ok) {
            const message = await readErrorMessage(response);

            if (response.status === 401) {
              throw createAuthRequestError(
                message || 'Invalid username or password',
                response.status,
                'INVALID_CREDENTIALS'
              );
            }

            if (isTransientLoginStatus(response.status) && attempt < maxAttempts) {
              await waitBeforeRetry(attempt);
              continue;
            }

            throw createAuthRequestError(
              message,
              response.status,
              response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : 'UNKNOWN'
            );
          }

          const data = await response.json();

          if (COOKIE_AUTH) {
            // Cookie mode (P1.1b): cookies carry the session; CSRF from body.
            setUser(data.user);
            if (data.csrf_token) setCsrfToken(data.csrf_token);
            setStatus('authenticated');
          } else {
            setToken(data.access_token);
            setUser(data.user);
            // Current auth flow stores tokens in localStorage; moving to httpOnly cookies requires coordinated backend changes.
            localStorage.setItem('auth_token', data.access_token);
            if (data.refresh_token) {
              localStorage.setItem('auth_refresh_token', data.refresh_token);
            }
            localStorage.setItem('auth_user', JSON.stringify(data.user));
          }
          return;
        } catch (error) {
          if (isAuthRequestError(error)) {
            if (
              (error.code === 'NETWORK_ERROR' || error.code === 'AUTH_SERVICE_UNAVAILABLE') &&
              attempt < maxAttempts
            ) {
              await waitBeforeRetry(attempt);
              continue;
            }

            throw error;
          }

          const networkMessage =
            error instanceof Error ? error.message : 'Unable to reach login service';
          const networkError = createAuthRequestError(
            networkMessage,
            0,
            'NETWORK_ERROR'
          );

          if (attempt < maxAttempts) {
            await waitBeforeRetry(attempt);
            continue;
          }

          throw networkError;
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    if (COOKIE_AUTH) {
      // Cookie mode (P1.1b): POST /auth/logout clears cookies + revokes family.
      // Fire-and-forget — clear local state regardless of the response (FR6).
      fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      clearCsrfToken();
      setUser(null);
      setStatus('unauthenticated');
      // Broadcast to other tabs so they also log out (FR8).
      bcRef.current?.postMessage({ type: 'logout' });
      router.replace('/login');
      return;
    }

    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_refresh_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('dev_bypass');

    // WebSocket จะถูก cleanup โดย useLiveChatSocket hook ตอน unmount
    
    // Redirect to login page
    router.replace('/login');
  }, [router]);

  // Perform the refresh and RETURN the new access token (or null on failure).
  // Deliberately does NOT logout here — the caller decides. The fetch
  // interceptor registers this so an expired-token admin request can refresh
  // and retry transparently; an unrecoverable 401 then logs out via the
  // jsk:auth-expired listener below.
  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (isLocalhostDevBypass()) {
      return null;
    }

    // Cookie mode (P1.1b / PR 2B): POST /auth/refresh with credentials — the
    // refresh cookie (scoped to /api/v1/auth) is sent automatically. NO
    // Authorization header. Single-flight is guaranteed by the interceptor's
    // `inflightRefresh` (runRefresh) — concurrent 401s share ONE call, avoiding
    // the strict-rotation race that would revoke the family (round-2 N3).
    if (COOKIE_AUTH) {
      try {
        const response = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        if (data.csrf_token) setCsrfToken(data.csrf_token);
        // Return a truthy sentinel — the interceptor only needs to know refresh
        // succeeded to retry; cookies carry the new access token.
        return 'cookie-refreshed';
      } catch (error) {
        console.error('Cookie token refresh error:', error);
        return null;
      }
    }

    try {
      const refreshTokenValue = localStorage.getItem('auth_refresh_token');
      if (!refreshTokenValue) {
        return null;
      }

      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshTokenValue}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      setToken(data.access_token);
      localStorage.setItem('auth_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('auth_refresh_token', data.refresh_token);
      }
      return data.access_token as string;
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }, [setToken]);

  const refreshToken = useCallback(async () => {
    const newToken = await refreshAccessToken();
    if (!newToken && !isLocalhostDevBypass()) {
      logout();
    }
  }, [refreshAccessToken, logout]);

  // Wire the fetch interceptor's silent refresh to this provider, and treat a
  // genuine auth-expired signal (the interceptor already tried to refresh and
  // failed) as a logout.
  useEffect(() => {
    setAuthRefreshHandler(refreshAccessToken);
    const onAuthExpired = () => logout();
    window.addEventListener('jsk:auth-expired', onAuthExpired as EventListener);
    return () => {
      setAuthRefreshHandler(null);
      window.removeEventListener('jsk:auth-expired', onAuthExpired as EventListener);
    };
  }, [refreshAccessToken, logout]);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: COOKIE_AUTH
      ? status === 'authenticated'
      : (!!user && (isLocalhostDevBypass() || !!token)),
    isLoading: COOKIE_AUTH ? status === 'loading' : isLoading,
    login,
    logout,
    refreshToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
