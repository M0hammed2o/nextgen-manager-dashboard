import { cloneElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BestSellersSection } from './BestSellersSection';
import { apiClient, ApiError } from '@/lib/api-client';
import type {
  BestSellerChannel, BestSellerRow, BestSellersReport, ProductPerformance,
} from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

// recharts' ResponsiveContainer renders nothing without a layout box in jsdom;
// give it a fixed size so the chart (and its legend) actually mounts.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      cloneElement(children, { width: 600, height: 240 }),
  };
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BestSellersSection />
    </QueryClientProvider>,
  );
}

function row(rank: 1 | 2 | 3, over: Partial<BestSellerRow> = {}): BestSellerRow {
  return {
    rank, menu_item_id: `m${rank}`, name: `Burger ${rank}`, image_url: null, is_deleted: false,
    quantity: 10 - rank, gross_cents: 10000 * (4 - rank), refund_adjusted_cents: 10000 * (4 - rank) - 500,
    has_unattributed_refund: false, quantity_share_pct: 40 - rank, revenue_share_pct: 50 - rank,
    ...over,
  };
}

function channel(key: BestSellerChannel['key'], label: string, over: Partial<BestSellerChannel> = {}): BestSellerChannel {
  return {
    key, label, product_count: 3, total_quantity: 30, total_item_gross_cents: 300000,
    ranking: [row(1), row(2), row(3)],
    unmapped: { quantity: 0, gross_cents: 0, names: [] },
    unattributed_refunds: { order_count: 0, refunds_cents: 0 },
    awaiting_mapping_orders: 0,
    ...over,
  };
}

function report(over: Partial<BestSellersReport> = {}): BestSellersReport {
  return {
    range: 'today', start_date: '2026-11-11', end_date: '2026-11-11', timezone: 'Africa/Johannesburg', currency: 'ZAR',
    rank_by: 'quantity',
    share_basis: 'Shares are of item sales in the channel.',
    refund_basis: 'Refund-adjusted figures need a full refund on the order.',
    channels: [
      channel('UBER_EATS', 'Uber Eats'),
      channel('MR_D', 'Mr D Food', {
        ranking: [], product_count: 0, total_quantity: 0, total_item_gross_cents: 0,
      }),
      channel('GENERAL', 'General Sales'),
      channel('ALL', 'All Sales'),
    ],
    ...over,
  };
}

const PERFORMANCE: ProductPerformance = {
  range: 'today', start_date: '2026-11-10', end_date: '2026-11-11', timezone: 'Africa/Johannesburg', currency: 'ZAR',
  menu_item_id: 'm1', name: 'Burger 1', image_url: null, is_deleted: false, total_quantity: 9, total_gross_cents: 30000,
  channels: [
    { key: 'UBER_EATS', label: 'Uber Eats', quantity: 5, gross_cents: 17500, quantity_share_pct: 55.6, revenue_share_pct: 58.3 },
    { key: 'MR_D', label: 'Mr D Food', quantity: 1, gross_cents: 2500, quantity_share_pct: 11.1, revenue_share_pct: 8.3 },
    { key: 'GENERAL', label: 'General Sales', quantity: 3, gross_cents: 10000, quantity_share_pct: 33.3, revenue_share_pct: 33.3 },
  ],
  variants: [
    { label: 'Standard', quantity: 7, gross_cents: 21000 },
    { label: 'Large', quantity: 2, gross_cents: 9000 },
  ],
  daily: [
    { day: '2026-11-10', uber_eats: { quantity: 2, gross_cents: 7000 }, mr_d: { quantity: 0, gross_cents: 0 }, general: { quantity: 1, gross_cents: 3000 } },
    { day: '2026-11-11', uber_eats: { quantity: 3, gross_cents: 10500 }, mr_d: { quantity: 1, gross_cents: 2500 }, general: { quantity: 2, gross_cents: 7000 } },
  ],
};

function mockApi(opts: { best?: unknown; perf?: unknown } = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    const value = path.includes('/products/') ? (opts.perf ?? PERFORMANCE) : (opts.best ?? report());
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}

const paths = () => vi.mocked(apiClient.get).mock.calls.map((c) => c[0] as string);
const norm = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('BestSellersSection', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the four channel cards in order, each ranking 1st/2nd/3rd', async () => {
    mockApi();
    renderSection();

    const uber = await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Uber Eats', 'Mr D Food', 'General Sales', 'All Sales']);

    expect(within(uber).getByText('1st')).toBeInTheDocument();
    expect(within(uber).getByText('2nd')).toBeInTheDocument();
    expect(within(uber).getByText('3rd')).toBeInTheDocument();
    expect(within(uber).getByText('Burger 1')).toBeInTheDocument();
    expect(norm(uber)).toContain('9 sold');
    expect(norm(uber)).toContain('R 300,00 gross');
    // Quantity ranking (default) shows the units share with its label.
    expect(norm(uber)).toContain('39%');
    expect(within(uber).getAllByText('% of channel units').length).toBe(3);
    expect(paths()).toContain('/v1/business/analytics/best-sellers?range=today&rank_by=quantity');
  });

  it('shows the API disclosure notes (share basis, refund basis)', async () => {
    mockApi();
    renderSection();
    expect(await screen.findByText(/shares are of item sales in the channel/i)).toBeInTheDocument();
    expect(screen.getByText(/refund-adjusted figures need a full refund/i)).toBeInTheDocument();
  });

  it('toggling Rank by sends rank_by=revenue and switches to the revenue share label', async () => {
    mockApi();
    renderSection();
    await screen.findByRole('region', { name: 'Uber Eats best sellers' });

    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));
    await waitFor(() => expect(paths()).toContain('/v1/business/analytics/best-sellers?range=today&rank_by=revenue'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revenue' })).toHaveAttribute('aria-pressed', 'true'));
    // The mocked response still says rank_by quantity until the new one lands; once it does
    // the label follows the response. Re-answer with a revenue report and check the label.
    vi.mocked(apiClient.get).mockImplementation(() => Promise.resolve(report({ rank_by: 'revenue' })));
    fireEvent.click(screen.getByRole('button', { name: 'Quantity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));
    await waitFor(() => expect(screen.getAllByText('% of channel item sales').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Quantity' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a clean empty state for a channel with no sales and no placeholder rankings', async () => {
    mockApi();
    renderSection();
    const mrD = await screen.findByRole('region', { name: 'Mr D Food best sellers' });
    expect(within(mrD).getByText('No sales in this period')).toBeInTheDocument();
    expect(within(mrD).queryByText('1st')).not.toBeInTheDocument();
    expect(within(mrD).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows the unmapped-lines warning, awaiting-mapping warning and unattributed refund note', async () => {
    mockApi({
      best: report({
        channels: [
          channel('UBER_EATS', 'Uber Eats', {
            unmapped: { quantity: 4, gross_cents: 8000, names: ['Mystery Wrap', 'Old Combo'] },
            awaiting_mapping_orders: 2,
            unattributed_refunds: { order_count: 1, refunds_cents: 1500 },
          }),
          channel('MR_D', 'Mr D Food'),
          channel('GENERAL', 'General Sales'),
          channel('ALL', 'All Sales'),
        ],
      }),
    });
    renderSection();
    const uber = await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    expect(norm(uber)).toContain('2 orders waiting for menu mapping are not included');
    expect(norm(uber)).toContain('4 units (R 80,00) with no matching product can’t be ranked'.replace('’', "'"));
    expect(norm(uber)).toContain('Mystery Wrap, Old Combo');
    expect(norm(uber)).toContain("1 refunded order (R 15,00) can't be attributed to a single product");

    // Other channels have none of these.
    const general = screen.getByRole('region', { name: 'General Sales best sellers' });
    expect(within(general).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an em dash with an explanation when refund_adjusted_cents is null, and the figure otherwise', async () => {
    mockApi({
      best: report({
        channels: [
          channel('UBER_EATS', 'Uber Eats', {
            ranking: [row(1, { refund_adjusted_cents: null, has_unattributed_refund: true }), row(2)],
          }),
          channel('MR_D', 'Mr D Food'), channel('GENERAL', 'General Sales'), channel('ALL', 'All Sales'),
        ],
      }),
    });
    renderSection();
    const uber = await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    const dash = within(uber).getByTitle(/partial refund on an order can't be attributed to a single product/i);
    expect(dash).toHaveTextContent('—');
    // Rank 2 has a real refund-adjusted figure (R 195,00).
    expect(norm(uber)).toContain('R 195,00');
  });

  it('shows a null share as an em dash, never 0%', async () => {
    mockApi({
      best: report({
        channels: [
          channel('UBER_EATS', 'Uber Eats', { ranking: [row(1, { quantity_share_pct: null })] }),
          channel('MR_D', 'Mr D Food'), channel('GENERAL', 'General Sales'), channel('ALL', 'All Sales'),
        ],
      }),
    });
    renderSection();
    const uber = await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    const btn = within(uber).getByRole('button', { name: /compare burger 1/i });
    expect(btn.textContent).toContain('—');
    expect(btn.textContent).not.toContain('0%');
  });

  it('falls back to a placeholder when there is no product image, and uses the image when present', async () => {
    mockApi({
      best: report({
        channels: [
          channel('UBER_EATS', 'Uber Eats', { ranking: [row(1, { image_url: 'https://cdn.example/b1.jpg' }), row(2)] }),
          channel('MR_D', 'Mr D Food'), channel('GENERAL', 'General Sales'), channel('ALL', 'All Sales'),
        ],
      }),
    });
    renderSection();
    const uber = await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    expect(within(uber).getByAltText('Burger 1')).toHaveAttribute('src', 'https://cdn.example/b1.jpg');
    expect(within(uber).getAllByTestId('product-image-placeholder')).toHaveLength(1);
  });

  it('shows a loading skeleton, then an error state with Retry that refetches', async () => {
    let fail = true;
    vi.mocked(apiClient.get).mockImplementation(() =>
      fail ? Promise.reject(new ApiError('Request failed (500)', 500)) : Promise.resolve(report()),
    );
    renderSection();
    expect(screen.getByTestId('best-sellers-loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/request failed \(500\)/i)).toBeInTheDocument());
    expect(screen.queryByText('1st')).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Uber Eats best sellers' })).toBeInTheDocument());
  });

  it('sends start and end only for a complete custom range and waits until both are chosen', async () => {
    mockApi();
    renderSection();
    await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    vi.mocked(apiClient.get).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByText(/choose a start and end date to see best sellers/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } });
    expect(paths()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-09' } });
    await waitFor(() =>
      expect(paths()).toContain('/v1/business/analytics/best-sellers?range=custom&start=2026-11-01&end=2026-11-09&rank_by=quantity'),
    );
  });

  it('clicking a ranked product opens the comparison sheet with channels, variants and the daily chart, for the current range', async () => {
    mockApi();
    renderSection();
    const uber = await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    await waitFor(() => expect(paths()).toContain('/v1/business/analytics/best-sellers?range=yesterday&rank_by=quantity'));

    fireEvent.click(within(await screen.findByRole('region', { name: 'Uber Eats best sellers' })).getByRole('button', { name: /compare burger 1/i }));
    expect(uber).toBeDefined();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('By channel')).toBeInTheDocument());
    expect(paths()).toContain('/v1/business/analytics/products/m1/performance?range=yesterday');

    // Units and revenue by channel, with shares of the product's total.
    const table = within(dialog).getAllByRole('table')[0];
    const uberRow = within(table).getByText('Uber Eats').closest('tr') as HTMLElement;
    expect(norm(uberRow)).toContain('5');
    expect(norm(uberRow)).toContain('55.6%');
    expect(norm(uberRow)).toContain('R 175,00');
    expect(norm(uberRow)).toContain('58.3%');
    expect(within(table).getByText('Mr D Food')).toBeInTheDocument();
    expect(within(table).getByText('General Sales')).toBeInTheDocument();

    // Variants.
    expect(within(dialog).getByText('Standard')).toBeInTheDocument();
    expect(within(dialog).getByText('Large')).toBeInTheDocument();
    // Daily trend chart.
    expect(within(dialog).getByTestId('product-daily-chart')).toBeInTheDocument();
    expect(within(dialog).getByText('Daily units by channel')).toBeInTheDocument();
  });

  it('shows "Product not found" when the performance endpoint answers 404', async () => {
    mockApi({ perf: new ApiError('Product not found', 404) });
    renderSection();
    await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    fireEvent.click(screen.getAllByRole('button', { name: /compare burger 1/i })[0]);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Product not found')).toBeInTheDocument());
    expect(within(dialog).queryByText('By channel')).not.toBeInTheDocument();
  });

  it('shows an error with Retry in the sheet for a non-404 failure', async () => {
    mockApi({ perf: new ApiError('Request failed (500)', 500) });
    renderSection();
    await screen.findByRole('region', { name: 'Uber Eats best sellers' });
    fireEvent.click(screen.getAllByRole('button', { name: /compare burger 1/i })[0]);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText(/request failed \(500\)/i)).toBeInTheDocument());
    expect(within(dialog).queryByText('Product not found')).not.toBeInTheDocument();
  });
});
