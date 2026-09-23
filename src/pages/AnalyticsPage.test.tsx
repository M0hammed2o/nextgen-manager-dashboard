import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalyticsPage from './AnalyticsPage';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AnalyticsSummaryRaw, BusinessSettings } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn() },
  };
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const SUMMARY: AnalyticsSummaryRaw = {
  period: '7d',
  total_orders: 5,
  completed_orders: 4,
  cancelled_orders: 1,
  revenue_cents: 12345,
  total_messages: 10,
  llm_calls: 3,
  llm_cost_cents: 50,
  unique_customers: 4,
};

const NOT_ENTITLED_SETTINGS = { advanced_analytics_enabled: false } as unknown as BusinessSettings;
const ENTITLED_SETTINGS = { advanced_analytics_enabled: true } as unknown as BusinessSettings;

function mockGet(map: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    for (const key of Object.keys(map)) {
      if (path.startsWith(key)) {
        const value = map[key];
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('AnalyticsPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows a real error state (not a silently-zeroed dashboard) when the summary request fails', async () => {
    mockGet({
      '/v1/business/analytics/summary': new ApiError('Request failed (500)', 500),
      '/v1/business/analytics/top-items': [],
      '/v1/business/analytics/daily': [],
      '/v1/business/settings': NOT_ENTITLED_SETTINGS,
    });
    renderWithClient(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load/i)).toBeInTheDocument());
    // The previous isLoading-only version rendered a "Total Orders: 0"
    // stat card even on a failed request — must not happen any more.
    expect(screen.queryByText('Total Orders')).not.toBeInTheDocument();
  });

  it('shows an upgrade prompt (not a raw error or a silent no-op) for a non-entitled tenant, and never calls the gated endpoints', async () => {
    mockGet({
      '/v1/business/analytics/summary': SUMMARY,
      '/v1/business/analytics/top-items': [],
      '/v1/business/analytics/daily': [],
      '/v1/business/settings': NOT_ENTITLED_SETTINGS,
    });
    renderWithClient(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText(/advanced analytics isn't enabled/i)).toBeInTheDocument());

    const calledPaths = vi.mocked(apiClient.get).mock.calls.map((c) => c[0]);
    expect(calledPaths.some((p) => p.includes('average-order-value'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('payment-methods'))).toBe(false);
    expect(calledPaths.some((p) => p.includes('external-orders/channels'))).toBe(false);
  });

  it('shows real Average Order Value, Payment Methods, and Channel Breakdown data for an entitled tenant', async () => {
    mockGet({
      '/v1/business/analytics/summary': SUMMARY,
      '/v1/business/analytics/top-items': [],
      '/v1/business/analytics/daily': [],
      '/v1/business/settings': ENTITLED_SETTINGS,
      '/v1/business/analytics/average-order-value': {
        period: '7d', completed_orders: 4, net_cents: 12000, average_order_value_cents: 3000,
      },
      '/v1/business/analytics/payment-methods': {
        days: 7, since: '2026-09-16T00:00:00Z',
        methods: [{ payment_method: 'CASH', order_count: 2, gross_cents: 6000, vat_cents: 780, refunds_cents: 0, net_cents: 6000 }],
        total_orders: 2, total_gross_cents: 6000, total_refunds_cents: 0, total_net_cents: 6000,
      },
      '/v1/business/external-orders/channels': {
        days: 7, since: '2026-09-16T00:00:00Z',
        channels: [{ source: 'POS', label: 'In store (till)', is_external: false, order_count: 2, gross_cents: 6000, vat_cents: 780, refunds_cents: 0, net_cents: 6000 }],
        total_orders: 2, total_gross_cents: 6000, total_refunds_cents: 0, total_net_cents: 6000, external_gross_cents: 0,
      },
    });
    renderWithClient(<AnalyticsPage />);

    // en-ZA Intl formatting renders as "R 30,00" (space + comma decimal), not "R30.00".
    await waitFor(() => expect(screen.getByText('R 30,00')).toBeInTheDocument()); // average order value
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('In store (till)')).toBeInTheDocument();
  });

  it('degrades gracefully (upgrade prompt, not a raw error toast) if an Advanced Analytics query still 409s despite the entitled flag', async () => {
    mockGet({
      '/v1/business/analytics/summary': SUMMARY,
      '/v1/business/analytics/top-items': [],
      '/v1/business/analytics/daily': [],
      '/v1/business/settings': ENTITLED_SETTINGS,
      '/v1/business/analytics/average-order-value': new ApiError(
        'Advanced Analytics is not enabled for this business', 409, 'ADVANCED_ANALYTICS_NOT_ENABLED'
      ),
      '/v1/business/analytics/payment-methods': {
        days: 7, since: '2026-09-16T00:00:00Z', methods: [],
        total_orders: 0, total_gross_cents: 0, total_refunds_cents: 0, total_net_cents: 0,
      },
      '/v1/business/external-orders/channels': {
        days: 7, since: '2026-09-16T00:00:00Z', channels: [],
        total_orders: 0, total_gross_cents: 0, total_refunds_cents: 0, total_net_cents: 0, external_gross_cents: 0,
      },
    });
    renderWithClient(<AnalyticsPage />);

    await waitFor(() => expect(screen.getAllByText(/not enabled/i).length).toBeGreaterThan(0));
  });
});
