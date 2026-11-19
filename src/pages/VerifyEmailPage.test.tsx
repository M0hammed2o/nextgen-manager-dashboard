import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StrictMode } from 'react';
import VerifyEmailPage from './VerifyEmailPage';
import { apiClient, ApiError } from '@/lib/api-client';
import { tokenFromLocation, verifyErrorMessage } from '@/lib/souk';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() } };
});

function renderAt(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('VerifyEmailPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('spends the token from the URL fragment exactly once (even under StrictMode) and shows the business code', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ verified: true, next: 'login', business_code: 'K7Q2XM' } as never);
    renderAt('/verify-email#token=abc_DEF-123');
    expect(await screen.findByText('Email confirmed')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/v1/public/auth/verify-email', { token: 'abc_DEF-123' });
    expect(screen.getByTestId('business-code')).toHaveTextContent('K7Q2XM');
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login');
  });

  it('shows one generic message for an invalid, expired or used link, with a resend form', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new ApiError('This verification link is invalid or has expired.', 400, 'VERIFICATION_TOKEN_INVALID'));
    renderAt('/verify-email#token=spent');
    expect(await screen.findByText('We could not confirm your email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/);
    const button = screen.getByRole('button', { name: /Resend verification email/ });
    expect(button).toBeDisabled(); // no email typed yet

    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 'accepted', message: 'ok' } as never);
    fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: ' thandi@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: /Resend verification email/ }));
    expect(await screen.findByRole('button', { name: /Resend in 60s/ })).toBeDisabled();
    expect(apiClient.post).toHaveBeenLastCalledWith('/v1/public/auth/resend-verification', { email: 'thandi@example.com' });
  });

  it('re-enables resend after the cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new ApiError('bad', 400, 'VERIFICATION_TOKEN_INVALID'))
      .mockResolvedValueOnce({ status: 'accepted', message: 'ok' } as never);
    renderAt('/verify-email#token=x');
    fireEvent.change(await screen.findByLabelText('Your email address'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Resend verification email/ }));
    await screen.findByRole('button', { name: /Resend in 60s/ });
    for (let i = 0; i < 61; i += 1) {
      await act(async () => { vi.advanceTimersByTime(1000); });
    }
    expect(screen.getByRole('button', { name: /Resend verification email/ })).toBeEnabled();
  });

  it('without a token it asks for a new link and calls nothing', async () => {
    renderAt('/verify-email');
    expect(await screen.findByText('We could not confirm your email')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

describe('verification helpers', () => {
  it('reads the token from the fragment, falling back to the query string', () => {
    expect(tokenFromLocation('#token=abc', '')).toBe('abc');
    expect(tokenFromLocation('', '?token=xyz')).toBe('xyz');
    expect(tokenFromLocation('#token=frag', '?token=query')).toBe('frag');
    expect(tokenFromLocation('', '')).toBeNull();
  });

  it('never distinguishes invalid from expired from used', () => {
    const a = verifyErrorMessage(new ApiError('x', 400, 'VERIFICATION_TOKEN_INVALID'));
    expect(a).toMatch(/invalid or has expired/);
    expect(verifyErrorMessage(new ApiError('y', 429))).toMatch(/Too many attempts/);
  });
});
