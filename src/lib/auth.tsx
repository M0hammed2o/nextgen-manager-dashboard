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
    // Clear client-side session state first -- the user is logged out the
    // moment their own token/localStorage is gone, regardless of whether
    // the server-side refresh-token revocation succeeds. Awaiting that
    // network call before clearing local state (the previous order here)
    // meant a slow/hanging request could block the UI from ever logging
    // the user out at all, since there is no request timeout anywhere in
    // apiClient. The revocation call is still made, just as a best-effort
    // background cleanup that can't block or fail the logout itself.
    const rt = localStorage.getItem('refresh_token');
    apiClient.clearTokens();
    setUser(null);
    if (rt) {
      apiClient.post('/v1/auth/logout', { refresh_token: rt }).catch(() => { /* best-effort only */ });
    }
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
