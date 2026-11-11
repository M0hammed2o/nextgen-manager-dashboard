import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesWalletsSection } from './SalesWalletsSection';
import { apiClient, ApiError } from '@/lib/api-client';
import type { SalesWalletsReport, SalesWalletOrdersResponse, SalesWallet } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn() },
  };
});

function renderSection(entitled = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesWalletsSection entitled={entitled} />
    </QueryClientProvider>,
  );
}

const PAYMENTS = { PAID: 1 };

function wallet(over: Partial<SalesWallet>): SalesWallet {
  return {
    key: 'X', label: 'X', sources: [], order_count: 0, gross_cents: 0, refunds_cents: 0, net_cents: 0,
    vat_cents: 0, voided_count: 0, voided_cents: 0, payment_status_counts: PAYMENTS,
    ...over,
  };
}

// Deliberately NOT the sum of the three wallets, so a client-side recompute would be caught.
const REPORT: SalesWalletsReport = {
  range: 'today', start_date: '2026-11-11', end_date: '2026-11-11',
  timezone: 'Africa/Johannesburg', currency: 'ZAR',
  wallets: [
    wallet({
      key: 'MR_D', label: 'Mr D Food', sources: ['MR_D'], order_count: 3,
      gross_cents: 100000, refunds_cents: 10000, net_cents: 90000,
      platform_fees: { available: false, reason: 'Mr D does not report commission yet' },
      settlement: { available: false, reason: 'no settlement feed' },
    }),
    wallet({
      key: 'UBER_EATS', label: 'Uber Eats', sources: ['UBER_EATS'], order_count: 2,
      gross_cents: 20000, refunds_cents: 0, net_cents: 20000,
      platform_fees: { available: false, reason: 'Uber fee data not synced' },
      settlement: { available: false, reason: 'no settlement feed' },
    }),
    wallet({
      key: 'GENERAL', label: 'General Sales', sources: ['POS'], order_count: 5,
      gross_cents: 30000, refunds_cents: 5000, net_cents: 25000,
      platform_fees: null, settlement: null,
    }),
  ],
  total: {
    key: 'TOTAL', label: 'Total Sales', order_count: 10, gross_cents: 155000, refunds_cents: 15000,
    net_cents: 140000, vat_cents: 0, voided_count: 0, voided_cents: 0, payment_status_counts: PAYMENTS,
  },
};

const ORDERS: SalesWalletOrdersResponse = {
  wallet: 'UBER_EATS', label: 'Uber Eats', start_date: '2026-11-11', end_date: '2026-11-11',
  timezone: 'Africa/Johannesburg', currency: 'ZAR', page: 1, page_size: 25, total_count: 1,
  summary: REPORT.wallets[1],
  by_source: [{ source: 'UBER_EATS', label: 'Uber Eats', order_count: 2, gross_cents: 20000, refunds_cents: 0, net_cents: 20000 }],
  orders: [{
    id: 'o1', order_number: 'UE-5E34F', source: 'UBER_EATS', source_label: 'Uber Eats',
    sale_at: '2026-11-11T14:52:33+00:00', status: 'READY', payment_status: 'PAID',
    payment_method: 'EXTERNAL_PLATFORM', gross_cents: 20000, refund_cents: 0, net_cents: 20000,
    external_order_id: 'c834',
  }],
};

function mockApi(overrides: { report?: unknown; orders?: unknown } = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    const value = path.includes('/orders?') ? (overrides.orders ?? ORDERS) : (overrides.report ?? REPORT);
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}

function paths(): string[] {
  return vi.mocked(apiClient.get).mock.calls.map((c) => c[0] as string);
}

describe('SalesWalletsSection', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the four cards with the right net, gross and refund figures and the reporting-only subtitle', async () => {
    mockApi();
    renderSection();

    await waitFor(() => expect(screen.getByText('Mr D Food')).toBeInTheDocument());
    expect(screen.getByText('Uber Eats')).toBeInTheDocument();
    expect(screen.getByText('General Sales')).toBeInTheDocument();
    expect(screen.getByText('Total Sales')).toBeInTheDocument();
    expect(screen.getByText(/reporting only, not money held/i)).toBeInTheDocument();

    // en-ZA formatting: "R 900,00" (nbsp-insensitive match via normalised text)
    const norm = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');
    const mrD = screen.getByRole('button', { name: /open mr d food breakdown/i });
    expect(norm(mrD)).toContain('R 900,00');
    expect(norm(mrD)).toContain('Gross R 1 000,00');
    expect(norm(mrD)).toContain('Refunds R 100,00');
    expect(norm(mrD)).toContain('3 orders');
    expect(norm(screen.getByRole('button', { name: /open general sales breakdown/i }))).toContain('R 250,00');
  });

  it('shows the API total as-is and does not recompute it from the three wallets', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument());
    const total = screen.getByRole('button', { name: /open total sales breakdown/i });
    const norm = (total.textContent ?? '').replace(/\s/g, ' ');
    // API says 140000 net; the three wallets sum to 135000. The card must show the API's figure.
    expect(norm).toContain('R 1 400,00');
    expect(norm).not.toContain('R 1 350,00');
    expect(norm).toContain('Gross R 1 550,00');
    expect(norm).toContain('10 orders');
    expect(norm).toContain('Refunds R 150,00');
  });

  it('shows platform fees as a muted not-available note with the reason, and never a number', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Mr D Food')).toBeInTheDocument());

    expect(screen.getByText(/platform fees: not available, mr d does not report commission yet/i)).toBeInTheDocument();
    expect(screen.getByText(/platform fees: not available, uber fee data not synced/i)).toBeInTheDocument();
    // General Sales (null) and Total have no fees note at all: 2 notes in total.
    expect(screen.getAllByText(/platform fees/i)).toHaveLength(2);
  });

  it('defaults to today and requests the chosen preset ranges without start/end', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Mr D Food')).toBeInTheDocument());
    expect(paths()).toContain('/v1/business/analytics/sales-wallets?range=today');

    for (const [name, range] of [['Yesterday', 'yesterday'], ['Last 7 days', '7d'], ['This month', 'month']] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(paths()).toContain(`/v1/business/analytics/sales-wallets?range=${range}`));
    }
    expect(paths().every((p) => !p.includes('start='))).toBe(true);
  });

  it('sends start and end only for a complete custom range, and waits until both are chosen', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Mr D Food')).toBeInTheDocument());
    vi.mocked(apiClient.get).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByText(/choose a start and end date/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } });
    expect(paths()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-09' } });
    await waitFor(() =>
      expect(paths()).toContain('/v1/business/analytics/sales-wallets?range=custom&start=2026-11-01&end=2026-11-09'),
    );
  });

  it('does not call the API when the custom end is before the start', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Mr D Food')).toBeInTheDocument());
    vi.mocked(apiClient.get).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-09' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-01' } });
    expect(screen.getByText(/end date must be on or after the start date/i)).toBeInTheDocument();
    expect(paths()).toHaveLength(0);
  });

  it('opens the breakdown for the clicked wallet and requests that wallet with the range and paging', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Uber Eats')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /open uber eats breakdown/i }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('UE-5E34F')).toBeInTheDocument());
    expect(paths()).toContain(
      '/v1/business/analytics/sales-wallets/UBER_EATS/orders?range=today&page=1&page_size=25',
    );
    expect(within(dialog).getByText('Gross sales')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Refunds').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Net sales')).toBeInTheDocument();
    expect(within(dialog).getByText('Paid: 1')).toBeInTheDocument();
    // Fees/settlement are unavailable: notes with reasons, no figures.
    expect(within(dialog).getByText(/platform fees: not available, uber fee data not synced/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/settlement: not available, no settlement feed/i)).toBeInTheDocument();
    // 14:52 UTC is 16:52 in Africa/Johannesburg.
    expect(within(dialog).getByText(/4:52\s?PM/)).toBeInTheDocument();
  });

  it('requests the TOTAL wallet when the Total card is clicked', async () => {
    mockApi();
    renderSection();
    await waitFor(() => expect(screen.getByText('Total Sales')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /open total sales breakdown/i }));
    await waitFor(() => expect(paths().some((p) => p.includes('/sales-wallets/TOTAL/orders?'))).toBe(true));
  });

  it('shows the existing locked state (and never calls the endpoint) for a non-entitled tenant', () => {
    mockApi();
    renderSection(false);
    expect(screen.getByText(/aren't available on your plan/i)).toBeInTheDocument();
    expect(paths()).toHaveLength(0);
  });

  it('shows the existing "Not enabled" upsell state when the API answers 409 ADVANCED_ANALYTICS_NOT_ENABLED', async () => {
    mockApi({
      report: new ApiError('Advanced Analytics is not enabled for this business', 409, 'ADVANCED_ANALYTICS_NOT_ENABLED'),
    });
    renderSection();
    await waitFor(() => expect(screen.getByText('Not enabled')).toBeInTheDocument());
    expect(screen.getByText(/advanced analytics isn't enabled for your account/i)).toBeInTheDocument();
    expect(screen.queryByText('Mr D Food')).not.toBeInTheDocument();
  });

  it("shows the API's message on a 422 instead of cards", async () => {
    mockApi({ report: new ApiError('end must not be before start', 422) });
    renderSection();
    await waitFor(() => expect(screen.getByText(/end must not be before start/i)).toBeInTheDocument());
    expect(screen.queryByText('Mr D Food')).not.toBeInTheDocument();
  });
});
