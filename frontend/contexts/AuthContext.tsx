'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { installAdminAuthFetchInterceptor, setAuthRefreshHandler } from '@/lib/authFetch';
import { setCsrfToken, clearCsrfToken } from '@/lib/csrfStore';

const AUTH_CHANNEL_NAME = 'jsk:auth';

interface User {
  id: string;
  username: string;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const router = useRouter();
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    installAdminAuthFetchInterceptor();
  }, []);

  // One-time Bearer→cookie migration, then bootstrap auth from GET /auth/me.
  useEffect(() => {
    let cancelled = false;

    const initCookieAuth = async () => {
      try {
        // Dev bypass: skip network calls entirely.
        const devBypassActive = (DEV_MODE || process.env.NODE_ENV === 'development') && isLocalhostDevBypass();
        if (devBypassActive) {
          setUser(MOCK_ADMIN);
          setStatus('authenticated');
          setIsLoading(false);
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

        // Bootstrap: GET /auth/me — cookies carry auth.
        const meRes = await fetch('/api/v1/auth/me', { credentials: 'include' });
        if (cancelled) return;

        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.csrf_token) setCsrfToken(meData.csrf_token);
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

  // Multi-tab logout/expiry sync via BroadcastChannel.
  useEffect(() => {
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
            credentials: 'include',
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
          setUser(data.user);
          if (data.csrf_token) setCsrfToken(data.csrf_token);
          setStatus('authenticated');
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
    fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearCsrfToken();
    clearLegacyAuthStorage();
    localStorage.removeItem('dev_bypass');
    setUser(null);
    setStatus('unauthenticated');
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

  const value: AuthContextType = {
    user,
    token: null,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
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
