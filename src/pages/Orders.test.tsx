import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrdersPage from './Orders';
import { apiClient } from '@/lib/api-client';
import type { Order, PaginatedResponse } from '@/types/api';

// Orders.tsx opens an SSE connection on mount via createOrderStream(), which
// only actually calls `new EventSource(...)` when a stored access token is
// present (src/lib/sse.ts::getStoredToken). No token is set in this test
// environment, so createOrderStream() no-ops and needs no separate mock.

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: null, staff_name: 'Test Owner', role: 'OWNER', business_id: 'b1', business_name: 'Test Biz' } }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: overrides.id ?? 'o1',
    order_number: overrides.order_number ?? '1001',
    status: 'NEW',
    payment_status: 'PAID',
    payment_method: null,
    payment_reference: null,
    payment_link_url: null,
    payment_required: true,
    paid_at: null,
    order_mode: 'DELIVERY',
    source: 'POS',
    subtotal_cents: 10000,
    delivery_fee_cents: 0,
    total_cents: 10000,
    currency: 'ZAR',
    refund_amount_cents: null,
    refund_reference: null,
    refunded_at: null,
    customer_name: 'Jane Doe',
    phone_number: null,
    delivery_address: null,
    estimated_ready_at: null,
    confirmed_at: null,
    accepted_at: null,
    ready_at: null,
    completed_at: null,
    cancelled_reason: null,
    items: [],
    created_at: '2026-09-22T10:00:00Z',
    updated_at: '2026-09-22T10:00:00Z',
    ...overrides,
  };
}

const ORDERS: Order[] = [
  makeOrder({ id: 'o1', order_number: '1001', source: 'POS' }),
  makeOrder({ id: 'o2', order_number: '1002', source: 'UBER_EATS' }),
  makeOrder({ id: 'o3', order_number: '1003', source: 'MR_D' }),
];

function mockOrdersList(orders: Order[]) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path.startsWith('/v1/business/orders')) {
      const res: PaginatedResponse<Order> = {
        data: orders,
        pagination: { per_page: 25, next_cursor: null, has_more: false },
      };
      return Promise.resolve(res);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('OrdersPage — order source filter and badge', () => {
  // jsdom has no scrollIntoView; Radix's Select calls it when opening the
  // listbox. Local to this file since no other test in the repo drives a
  // Radix Select yet.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.clearAllMocks());

  it('renders a source badge per row for POS, Uber Eats and Mr D orders', async () => {
    mockOrdersList(ORDERS);
    renderWithClient(<OrdersPage />);

    await waitFor(() => expect(screen.getByText('#1001')).toBeInTheDocument());
    expect(screen.getByText('Uber Eats')).toBeInTheDocument();
    expect(screen.getByText('Mr D')).toBeInTheDocument();
    // POS appears both as a row badge and inside the source filter's
    // trigger/options — assert at least one instance exists.
    expect(screen.getAllByText('POS').length).toBeGreaterThan(0);
  });

  it('filters the visible orders by source without dropping rows for other sources from the API response', async () => {
    mockOrdersList(ORDERS);
    renderWithClient(<OrdersPage />);

    await waitFor(() => expect(screen.getByText('#1002')).toBeInTheDocument());

    // The source filter's trigger already shows its selected value ("All
    // Sources" by default), not the placeholder — find it by that text.
    const sourceFilter = screen.getByText('All Sources').closest('button')!;
    fireEvent.click(sourceFilter);
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Uber Eats'));

    await waitFor(() => {
      expect(screen.getByText('#1002')).toBeInTheDocument();
      expect(screen.queryByText('#1001')).not.toBeInTheDocument();
      expect(screen.queryByText('#1003')).not.toBeInTheDocument();
    });
  });

  it('shows a distinct empty state (with a clear-filter action) when a source filter matches nothing, vs no orders at all', async () => {
    mockOrdersList([makeOrder({ id: 'o1', order_number: '1001', source: 'POS' })]);
    renderWithClient(<OrdersPage />);

    await waitFor(() => expect(screen.getByText('#1001')).toBeInTheDocument());

    const sourceFilter = screen.getByText('All Sources').closest('button')!;
    fireEvent.click(sourceFilter);
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Mr D'));

    await waitFor(() => expect(screen.getByText(/no orders match this source/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /clear source filter/i })).toBeInTheDocument();
  });
});
