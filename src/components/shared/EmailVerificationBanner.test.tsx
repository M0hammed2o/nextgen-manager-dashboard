import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { apiClient, ApiError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});

function renderBanner(props: Parameters<typeof EmailVerificationBanner>[0]) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><EmailVerificationBanner {...props} /></QueryClientProvider>);
}

describe('EmailVerificationBanner', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders nothing when verification is not required, already done, or unknown', () => {
    for (const status of [undefined, { required: false, verified: true }, { required: true, verified: true }]) {
      const { container, unmount } = renderBanner({ status, email: 'a@example.com' });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('offers a resend for the signed-in owner email', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'accepted', message: 'ok' } as never);
    renderBanner({ status: { required: true, verified: false }, email: 'owner@example.com' });
    expect(screen.getByTestId('email-verification-banner')).toHaveTextContent('owner@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Resend verification email/ }));
    expect(await screen.findByRole('button', { name: /Resend in 60s/ })).toBeDisabled();
    expect(apiClient.post).toHaveBeenCalledWith('/v1/public/auth/resend-verification', { email: 'owner@example.com' });
  });

  it('a 429 shows the wait message and also cools down', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('Too Many Requests', 429));
    renderBanner({ status: { required: true, verified: false }, email: 'owner@example.com' });
    fireEvent.click(screen.getByRole('button', { name: /Resend verification email/ }));
    expect(await screen.findByTestId('resend-note')).toHaveTextContent(/Too many attempts/);
    expect(screen.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  });
});
