'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { installAdminAuthFetchInterceptor, setAuthRefreshHandler } from '@/lib/authFetch';
import { setCsrfToken, clearCsrfToken } from '@/lib/csrfStore';
import { readErrorMessage } from '@/lib/api-error';
import {
  getAuthSnapshot,
  setAuthState,
  subscribeAuth,
  type AuthUser,
} from '@/lib/authStore';

// Moved verbatim to lib/authStore.ts so both provider trees (/login and
// /admin) share one state source; re-exported for existing importers.
export type { AuthStatus, AuthUser as User } from '@/lib/authStore';
type User = AuthUser;

const AUTH_CHANNEL_NAME = 'jsk:auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Bootstrap (GET /auth/me) exhausted retries on transient errors — auth
   *  state is UNKNOWN, not "logged out". Callers must not redirect to /login. */
  bootstrapFailed: boolean;
  retryBootstrap: () => void;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Shared store: single source of truth across the /login and /admin
  // provider trees (see lib/authStore.ts). Loading derives from status —
  // the old standalone isLoading state was never read by consumers.
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
  const user = auth.user;
  const status = auth.status;
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const router = useRouter();
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    installAdminAuthFetchInterceptor();
  }, []);

  // One-time Bearer→cookie migration, then bootstrap auth from GET /auth/me.
  useEffect(() => {
    let cancelled = false;

    const initCookieAuth = async () => {
      // A tree mounting after a client-side login already holds fresh state
      // in the shared store — skip the network re-verification entirely.
      if (getAuthSnapshot().status !== 'loading') return;
      try {
        // Dev bypass: skip network calls entirely.
        const devBypassActive = (DEV_MODE || process.env.NODE_ENV === 'development') && isLocalhostDevBypass();
        if (devBypassActive) {
          setAuthState({ user: MOCK_ADMIN, status: 'authenticated' });
          return;
        }

        // One-time migration: if a legacy Bearer token is in localStorage,
        // exchange it for a cookie session before bootstrapping.
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
            clearLegacyAuthStorage();
          } catch {
            clearLegacyAuthStorage();
          }
        }

        // Bootstrap: GET /auth/me — cookies carry auth. Transient failures
        // (5xx, network error) retry with backoff like login() does — a
        // single cold-start 502 here used to bounce a freshly-logged-in
        // user straight back to /login. Only a definitive non-transient
        // response (e.g. 401) means "not logged in"; exhausted retries
        // mean "unknown" (bootstrap_error), never "logged out".
        const maxAttempts = 4;
        let meRes: Response | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            meRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
          } catch (error) {
            console.error('Cookie auth bootstrap fetch error:', error);
            meRes = null;
          }
          if (cancelled) return;

          if (meRes && !isTransientLoginStatus(meRes.status)) break;
          if (attempt < maxAttempts) await waitBeforeRetry(attempt);
          if (cancelled) return;
        }

        if (!meRes || isTransientLoginStatus(meRes.status)) {
          setAuthState({ status: 'bootstrap_error' });
          return;
        }

        if (meRes.ok) {
          const meData = await meRes.json();
          if (cancelled) return;
          if (meData.csrf_token) setCsrfToken(meData.csrf_token);
          const { csrf_token: _csrf, ...userFields } = meData;
          setAuthState({ user: userFields, status: 'authenticated' });
        } else {
          setAuthState({ status: 'unauthenticated' });
        }
      } catch (error) {
        console.error('Cookie auth initialization error:', error);
        if (!cancelled) setAuthState({ status: 'bootstrap_error' });
      }
    };

    initCookieAuth();

    return () => { cancelled = true; };
  }, [bootstrapAttempt]);

  // Multi-tab logout/expiry sync via BroadcastChannel.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const bc = new BroadcastChannel(AUTH_CHANNEL_NAME);
    bcRef.current = bc;
    bc.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'logout' || event.data?.type === 'expired') {
        clearCsrfToken();
        setAuthState({ user: null, status: 'unauthenticated' });
        router.replace('/login');
      }
    };

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [router]);

  const retryBootstrap = useCallback(() => {
    setAuthState({ status: 'loading' });
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const maxAttempts = 4;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
          });

          if (!response.ok) {
            const message = await readErrorMessage(response, `Request failed with status ${response.status}`);

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
          if (data.csrf_token) setCsrfToken(data.csrf_token);
          setAuthState({ user: data.user, status: 'authenticated' });
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
  }, []);

  const logout = useCallback(() => {
    fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearCsrfToken();
    clearLegacyAuthStorage();
    localStorage.removeItem('dev_bypass');
    setAuthState({ user: null, status: 'unauthenticated' });
    bcRef.current?.postMessage({ type: 'logout' });
    router.replace('/login');
  }, [router]);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (isLocalhostDevBypass()) {
      return null;
    }

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
      return 'cookie-refreshed';
    } catch (error) {
      console.error('Cookie token refresh error:', error);
      return null;
    }
  }, []);

  const refreshToken = useCallback(async () => {
    const result = await refreshAccessToken();
    if (!result && !isLocalhostDevBypass()) {
      logout();
    }
  }, [refreshAccessToken, logout]);

  useEffect(() => {
    setAuthRefreshHandler(refreshAccessToken);
    const onAuthExpired = () => logout();
    window.addEventListener('jsk:auth-expired', onAuthExpired as EventListener);
    return () => {
      setAuthRefreshHandler(null);
      window.removeEventListener('jsk:auth-expired', onAuthExpired as EventListener);
    };
  }, [refreshAccessToken, logout]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    token: null,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    bootstrapFailed: status === 'bootstrap_error',
    retryBootstrap,
    login,
    logout,
    refreshToken
  }), [user, status, retryBootstrap, login, logout, refreshToken]);

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
