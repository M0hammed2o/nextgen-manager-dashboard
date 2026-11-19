import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VariantSalesSection } from './VariantSalesSection';
import { apiClient, ApiError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VariantSalesSection /></QueryClientProvider>);
}

const ZERO = { units_sold: 0, gross_cents: 0, units_returned: 0, returned_cents: 0, net_units: 0, net_cents: 0 };
const row = {
  variant_id: 'v1', menu_item_id: 'm1', name: 'Tee', sku: 'TEE-M', label: 'M',
  units_sold: 5, gross_cents: 50000, units_returned: 1, returned_cents: 10000, net_units: 4, net_cents: 40000,
};

describe('VariantSalesSection', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the table, totals and the API basis footnote', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      range: '7d', start_date: '2026-11-13', end_date: '2026-11-19', timezone: 'Africa/Johannesburg',
      variants: [row], totals: { units_sold: 5, gross_cents: 50000, units_returned: 1, returned_cents: 10000, net_units: 4, net_cents: 40000 },
      basis: 'Net = gross - returned.',
    } as never);
    renderIt();
    await screen.findByText('Tee');
    expect(apiClient.get).toHaveBeenCalledWith('/v1/business/analytics/variants?range=7d');
    expect(screen.getByText(/M · TEE-M/)).toBeInTheDocument();
    expect(screen.getByText('Net = gross - returned.')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      range: '7d', start_date: 'a', end_date: 'b', timezone: 'x', variants: [], totals: ZERO, basis: 'b',
    } as never);
    renderIt();
    await screen.findByText('No variant sales in this period.');
  });

  it('shows an error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new ApiError('Request failed (500)', 500));
    renderIt();
    await waitFor(() => expect(screen.getByText('Request failed (500)')).toBeInTheDocument());
  });
});
