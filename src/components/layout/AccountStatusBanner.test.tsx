import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountStatusBanner } from './AccountStatusBanner';
import { apiClient } from '@/lib/api-client';
import type { AccountStatus } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function account(overrides: Partial<AccountStatus>): AccountStatus {
  return {
    status: 'TRIAL',
    plan: 'STARTER',
    billing_status: 'TRIAL',
    trial_started_at: '2026-09-01T00:00:00Z',
    trial_ends_at: '2026-09-30T00:00:00Z',
    trial_days_remaining: 7,
    alerts: [],
    ...overrides,
  };
}

describe('AccountStatusBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing (never blocks the dashboard) when GET /billing/account fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));

    const { container } = renderWithClient(<AccountStatusBanner />);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no alerts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(account({ status: 'ACTIVE', alerts: [] }));

    const { container } = renderWithClient(<AccountStatusBanner />);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the TRIAL_EXPIRED banner and it has no dismiss button', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(account({ status: 'EXPIRED', alerts: ['TRIAL_EXPIRED'], trial_days_remaining: 0 }));

    renderWithClient(<AccountStatusBanner />);

    await waitFor(() => expect(screen.getByText(/free trial has ended/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('shows a dismissible TRIAL_ENDS_7D banner and hides it after dismissal', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(account({ alerts: ['TRIAL_ENDS_7D'], trial_days_remaining: 7 }));

    renderWithClient(<AccountStatusBanner />);

    await waitFor(() => expect(screen.getByText(/free trial ends in 7 days/i)).toBeInTheDocument());
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    act(() => {
      dismissBtn.click();
    });

    await waitFor(() => expect(screen.queryByText(/free trial ends in 7 days/i)).not.toBeInTheDocument());
  });
});
