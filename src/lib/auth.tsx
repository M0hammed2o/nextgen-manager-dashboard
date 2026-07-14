import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser, LoginRequest, LoginResponse, SetPasswordRequest } from '@/types/api';
import { apiClient } from './api-client';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (req: LoginRequest) => Promise<void>;
  setNewPassword: (req: SetPasswordRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      apiClient.get<AuthUser>('/v1/auth/me')
        .then((u) => {
          setUser(u);
          localStorage.setItem('auth_user', JSON.stringify(u));
        })
        .catch(() => {
          apiClient.clearTokens();
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const res = await apiClient.post<LoginResponse>('/v1/auth/login', req);
    localStorage.setItem('access_token', res.tokens.access_token);
    localStorage.setItem('refresh_token', res.tokens.refresh_token);
    localStorage.setItem('auth_user', JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const setNewPassword = useCallback(async (req: SetPasswordRequest) => {
    // Same response shape as /auth/login — auto-logs-in on success.
    const res = await apiClient.post<LoginResponse>('/v1/auth/set-password', req);
    localStorage.setItem('access_token', res.tokens.access_token);
    localStorage.setItem('refresh_token', res.tokens.refresh_token);
    localStorage.setItem('auth_user', JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = localStorage.getItem('refresh_token');
      if (rt) await apiClient.post('/v1/auth/logout', { refresh_token: rt });
    } catch { /* ignore */ }
    apiClient.clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, setNewPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
