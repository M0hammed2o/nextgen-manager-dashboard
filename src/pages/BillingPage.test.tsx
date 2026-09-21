import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanAndInvoicesSection } from './BillingPage';
import { apiClient } from '@/lib/api-client';
import type { AccountStatus, CommercialInvoice } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: vi.fn(),
      getBlob: vi.fn(),
    },
  };
});

const ACCOUNT: AccountStatus = {
  status: 'TRIAL',
  plan: 'STARTER',
  billing_status: 'TRIAL',
  trial_started_at: '2026-09-01T00:00:00Z',
  trial_ends_at: '2026-09-30T00:00:00Z',
  trial_days_remaining: 5,
  alerts: ['TRIAL_ENDS_7D'],
};

const INVOICES: CommercialInvoice[] = [
  {
    id: 'inv-1',
    invoice_number: 'INV-0001',
    status: 'SENT',
    invoice_date: '2026-09-01',
    due_date: '2026-09-15',
    currency: 'ZAR',
    subtotal_cents: 100000,
    vat_cents: 15000,
    total_cents: 115000,
    payment_method: null,
    paid_at: null,
  },
];

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('PlanAndInvoicesSection — invoice list role gating', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/billing/account') return Promise.resolve(ACCOUNT);
      if (path === '/v1/business/billing/commercial-invoices') return Promise.resolve(INVOICES);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('OWNER sees the invoices table, and the invoices endpoint is called', async () => {
    renderWithClient(<PlanAndInvoicesSection isOwner={true} />);

    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/v1/business/billing/commercial-invoices');
    expect(screen.queryByText(/only the account owner can view invoices/i)).not.toBeInTheDocument();
  });

  it('MANAGER sees status but not invoices, and the invoices endpoint is never called', async () => {
    renderWithClient(<PlanAndInvoicesSection isOwner={false} />);

    await waitFor(() => expect(screen.getByText(/only the account owner can view invoices/i)).toBeInTheDocument());
    expect(screen.queryByText('INV-0001')).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/v1/business/billing/commercial-invoices');
  });

  it('shows a retryable ErrorState (not a silent blank page) when the account-status endpoint fails', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/billing/account') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderWithClient(<PlanAndInvoicesSection isOwner={true} />);

    // useAccountStatus sets retry: 1 with a ~1s backoff, so allow enough
    // time for that retry to also fail before the query settles as errored.
    await waitFor(
      () => expect(screen.getByText(/couldn't load your account status/i)).toBeInTheDocument(),
      { timeout: 3000 }
    );
  });
});
