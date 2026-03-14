'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' | 'USER';
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

// Mock JWT token for development (expires in 24 hours)
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJBRE1JTiIsImV4cCI6OTk5OTk5OTk5OX0.mock_signature';

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

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    const initAuth = () => {
      try {
        if (DEV_MODE) {
          // In dev mode, auto-login as mock admin
          setUser(MOCK_ADMIN);
          setToken(MOCK_TOKEN);
          localStorage.setItem('auth_token', MOCK_TOKEN);
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
              window.location.href = '/login';
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
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error('Login failed');
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
    
    // Disconnect WebSocket if connected
    // This is handled by the component using the hook
    
    // Redirect to login page
    window.location.href = '/login';
  }, []);

  const refreshToken = useCallback(async () => {
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
    isAuthenticated: !!user && !!token,
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
