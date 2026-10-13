import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import { apiClient } from './api-client';
import { authStorage } from './auth-storage';
import type { LoginResponse } from '@/types/api';

vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      post: vi.fn(),
      get: vi.fn(),
      clearTokens: vi.fn(actual.apiClient.clearTokens.bind(actual.apiClient)),
    },
  };
});

// NOTE on password safety: this is a placeholder credential used only to
// prove the password string is passed through byte-for-byte -- it is not a
// real account password.
const FAKE_LOGIN_RESPONSE: LoginResponse = {
  tokens: {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
  },
  user: {
    id: 'user-1',
    email: 'owner@example.com',
    staff_name: 'Demo Owner',
    role: 'OWNER',
    business_id: 'biz-1',
    business_name: 'Demo Restaurant',
  },
};

describe('AuthProvider — login/logout storage behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiClient.get).mockRejectedValue(new Error('no session'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('trims and lowercases the email before the login request; leaves the password byte-for-byte unchanged', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(FAKE_LOGIN_RESPONSE);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    const rawPassword = '  Sup3r-Fake-Placeholder-Pw \t'; // deliberately has whitespace
    await act(async () => {
      await result.current.login({ email: '  Owner@Example.COM  ', password: rawPassword });
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0];
    expect(path).toBe('/v1/auth/login');
    expect(body).toEqual({ email: 'owner@example.com', password: rawPassword });
    // Explicit byte-for-byte check, independent of toEqual's string comparison semantics.
    expect((body as { password: string }).password).toBe(rawPassword);
  });

  it('completes an ordinary desktop login end-to-end: stores tokens/user and flips isAuthenticated', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(FAKE_LOGIN_RESPONSE);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login({ email: 'owner@example.com', password: 'whatever' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('owner@example.com');
    expect(authStorage.getItem('access_token')).toBe('fake-access-token');
    expect(authStorage.getItem('refresh_token')).toBe('fake-refresh-token');
    expect(JSON.parse(authStorage.getItem('auth_user') ?? 'null')?.email).toBe('owner@example.com');
    // On an ordinary desktop browser this really did land in localStorage,
    // not just the abstraction -- proving the fallback chain doesn't
    // downgrade everyone to session-only storage when localStorage works.
    expect(localStorage.getItem('access_token')).toBe('fake-access-token');
  });

  it('logout clears auth values from every storage layer, not just the one currently in use', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(FAKE_LOGIN_RESPONSE);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login({ email: 'owner@example.com', password: 'whatever' });
    });

    // Simulate values having ended up in sessionStorage too (e.g. an earlier
    // part of the session fell back there before localStorage recovered).
    sessionStorage.setItem('access_token', 'leftover-session-token');
    sessionStorage.setItem('refresh_token', 'leftover-session-refresh');
    sessionStorage.setItem('auth_user', 'leftover-session-user');

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(authStorage.getItem('access_token')).toBeNull();
    expect(authStorage.getItem('refresh_token')).toBeNull();
    expect(authStorage.getItem('auth_user')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('refresh_token')).toBeNull();
    expect(sessionStorage.getItem('auth_user')).toBeNull();
  });
});
