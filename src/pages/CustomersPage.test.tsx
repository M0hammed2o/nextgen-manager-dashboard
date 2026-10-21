import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomersPage from './CustomersPage';
import { apiClient } from '@/lib/api-client';
import type { Customer, CustomerDetail, CustomersListResponse, Order } from '@/types/api';

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

function makeCustomer(overrides: Partial<Customer>): Customer {
  return {
    id: overrides.id ?? 'c1',
    display_name: 'Jane Doe',
    phone_number: '27821234567',
    order_count: 3,
    total_spent_cents: 15000,
    last_order_at: '2026-09-22T10:00:00Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: overrides.id ?? 'o1',
    order_number: overrides.order_number ?? '2001',
    status: 'COLLECTED',
    payment_status: 'PAID',
    payment_method: null,
    payment_reference: null,
    payment_link_url: null,
    payment_required: true,
    paid_at: null,
    order_mode: 'PICKUP',
    source: 'WHATSAPP',
    subtotal_cents: 5000,
    delivery_fee_cents: 0,
    total_cents: 5000,
    currency: 'ZAR',
    refund_amount_cents: null,
    refund_reference: null,
    refunded_at: null,
    customer_name: 'Jane Doe',
    phone_number: '27821234567',
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

const CUSTOMERS: Customer[] = [
  makeCustomer({ id: 'c1', display_name: 'Jane Doe', phone_number: '27821111111' }),
  makeCustomer({ id: 'c2', display_name: 'John Smith', phone_number: '27822222222' }),
];

function mockCustomersList(customers: Customer[], overrides: Partial<CustomersListResponse['pagination']> = {}) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path.startsWith('/v1/business/customers/')) {
      return Promise.reject(new Error(`unexpected detail GET ${path}`));
    }
    if (path.startsWith('/v1/business/customers')) {
      const res: CustomersListResponse = {
        data: customers,
        pagination: { page: 1, per_page: 20, total: customers.length, total_pages: 1, ...overrides },
      };
      return Promise.resolve(res);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('CustomersPage — list, search, pagination, loading/error/empty states', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders the loading skeleton, then the customer list once data arrives', async () => {
    mockCustomersList(CUSTOMERS);
    renderWithClient(<CustomersPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('27821111111')).toBeInTheDocument();
  });

  it('shows a genuine error state (with retry) when the initial load fails, never the empty state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network down'));
    renderWithClient(<CustomersPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this page/i)).toBeInTheDocument());
    expect(screen.queryByText(/no customers yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows the "no customers yet" empty state distinct from a failed load when there is genuinely no data', async () => {
    mockCustomersList([]);
    renderWithClient(<CustomersPage />);

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });

  it('debounces the search box into a server-side search param, resetting to page 1', async () => {
    mockCustomersList(CUSTOMERS);
    renderWithClient(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    mockCustomersList([makeCustomer({ id: 'c1', display_name: 'Jane Doe' })]);
    fireEvent.change(screen.getByPlaceholderText(/search name or phone/i), { target: { value: 'Jane' } });

    await waitFor(
      () => expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/business\/customers\?page=1&per_page=20&search=Jane/)
      ),
      { timeout: 2000 }
    );
  });

  it('shows Previous/Next pagination controls only when there is more than one page, and pages forward', async () => {
    mockCustomersList(CUSTOMERS, { total_pages: 2, total: 40 });
    renderWithClient(<CustomersPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    mockCustomersList([makeCustomer({ id: 'c3', display_name: 'Page Two Customer' })], { page: 2, total_pages: 2, total: 40 });
    fireEvent.click(nextButton);

    await waitFor(() => expect(screen.getByText('Page Two Customer')).toBeInTheDocument());
  });

  it('does not render pagination controls when everything fits on one page', async () => {
    mockCustomersList(CUSTOMERS);
    renderWithClient(<CustomersPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });
});

describe('CustomersPage — detail dialog with order history', () => {
  afterEach(() => vi.clearAllMocks());

  it('opens the detail dialog on row click and shows order history reusing Orders.tsx formatting', async () => {
    mockCustomersList(CUSTOMERS);
    renderWithClient(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    const detail: CustomerDetail = {
      ...CUSTOMERS[0],
      orders: [makeOrder({ id: 'o1', order_number: '2001' })],
    };
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/customers/c1') return Promise.resolve(detail);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    fireEvent.click(screen.getByText('Jane Doe'));

    await waitFor(() => expect(screen.getByText('#2001')).toBeInTheDocument());
    // Order history item uses the same status/payment labels as Orders.tsx
    expect(screen.getByText('COLLECTED')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('shows a retryable error state inside the dialog when the detail fetch fails', async () => {
    mockCustomersList(CUSTOMERS);
    renderWithClient(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/customers/c1') return Promise.reject(new Error('could not load customer'));
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    fireEvent.click(screen.getByText('Jane Doe'));

    await waitFor(() => expect(screen.getByText(/couldn't load this page/i)).toBeInTheDocument());
  });

  it('shows "No orders yet" when a customer has no order history', async () => {
    mockCustomersList(CUSTOMERS);
    renderWithClient(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());

    const detail: CustomerDetail = { ...CUSTOMERS[0], orders: [] };
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/customers/c1') return Promise.resolve(detail);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    fireEvent.click(screen.getByText('Jane Doe'));

    await waitFor(() => expect(screen.getByText(/no orders yet/i)).toBeInTheDocument());
  });
});
