'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { installAdminAuthFetchInterceptor, syncAdminAuthToken } from '@/lib/authFetch';

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
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    installAdminAuthFetchInterceptor();
  }, []);

  useEffect(() => {
    syncAdminAuthToken(token);
  }, [token]);

  // เริ่มต้น auth state จาก localStorage เมื่อ component mount
  useEffect(() => {
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

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const maxAttempts = 4;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

          setToken(data.access_token);
          setUser(data.user);

          // Current auth flow stores tokens in localStorage; moving to httpOnly cookies requires coordinated backend changes.
          localStorage.setItem('auth_token', data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('auth_refresh_token', data.refresh_token);
          }
          localStorage.setItem('auth_user', JSON.stringify(data.user));
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

  const refreshToken = useCallback(async () => {
    if (isLocalhostDevBypass()) {
      return;
    }

    try {
      const refreshTokenValue = localStorage.getItem('auth_refresh_token');
      if (!refreshTokenValue) {
        logout();
        return;
      }

      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshTokenValue}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        localStorage.setItem('auth_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('auth_refresh_token', data.refresh_token);
        }
      } else {
        // Token refresh failed, logout
        logout();
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      logout();
    }
  }, [logout]);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && (isLocalhostDevBypass() || !!token),
    isLoading,
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
