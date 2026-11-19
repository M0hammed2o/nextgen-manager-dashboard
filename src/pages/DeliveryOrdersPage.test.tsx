import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeliveryOrdersPage from './DeliveryOrdersPage';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings, DeliveryOrderResponse } from '@/types/api';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() },
  };
});

const ENABLED_SETTINGS = { delivery_platforms_enabled: true } as unknown as BusinessSettings;

function order(overrides: Partial<DeliveryOrderResponse>): DeliveryOrderResponse {
  return {
    id: 'do-1', provider: 'UBER_EATS', provider_label: 'Uber Eats', external_order_id: 'f9f363d1-uber-uuid',
    status: 'READY_TO_ACCEPT', order_id: null, gross_cents: 7000, fee_cents: 0, currency: 'ZAR',
    placed_at: new Date().toISOString(), accept_deadline_at: new Date(Date.now() + 8 * 60_000).toISOString(),
    accepted_at: null, denied_at: null, cancelled_at: null, deny_reason_code: null, deny_reason_text: null,
    unresolved_items: null, failure_reason: null, display_id: 'BC953',
    last_provider_sync_at: null, last_provider_sync_error: null,
    lines: [{ external_id: 'Muffin', title: 'Fresh-baked muffin', quantity: 2, unit_price_cents: 3500,
      total_price_cents: 7000, special_instructions: null,
      modifiers: [{ external_id: 'Sugar', title: 'Sugar', quantity: 1, removed: true, group_title: 'Add sugar' }] }],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderWith(orders: DeliveryOrderResponse[]) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path === '/v1/business/settings') return Promise.resolve(ENABLED_SETTINGS);
    if (path.startsWith('/v1/business/delivery/orders')) return Promise.resolve({ orders, total: orders.length });
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  vi.mocked(apiClient.post).mockResolvedValue({});
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><DeliveryOrdersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeliveryOrdersPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('lets a manager accept a READY_TO_ACCEPT order into the kitchen (previously no button existed)', async () => {
    renderWith([order({})]);
    expect(await screen.findByText('Uber Eats · #BC953')).toBeInTheDocument();
    expect(screen.getByText(/2x Fresh-baked muffin/)).toBeInTheDocument();
    expect(screen.getByText(/no Sugar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /accept into kitchen/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/delivery/orders/do-1/accept'));
  });

  it('offers retry and manual confirmation for an accept Uber never confirmed', async () => {
    renderWith([order({ status: 'ACCEPT_UNCONFIRMED', order_id: 'ord-1', accept_deadline_at: null })]);
    expect(await screen.findByText(/Uber never confirmed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry accept with uber/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/delivery/orders/do-1/retry-accept'));
    fireEvent.click(screen.getByRole('button', { name: /uber shows it accepted/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/delivery/orders/do-1/mark-accepted'));
    expect(screen.queryByRole('button', { name: /^deny$/i })).not.toBeInTheDocument();
  });

  it('deep-links an unmapped modifier to the mapping screen with its id and kind', async () => {
    renderWith([order({
      status: 'NEEDS_MAPPING',
      unresolved_items: [{ kind: 'MODIFIER', external_id: 'u-anch', external_text: 'Anchovies',
        parent_external_text: 'Margherita' }],
    })]);
    expect(await screen.findByText(/option on Margherita/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /map this item/i }));
    const target = navigateMock.mock.calls[0][0] as string;
    const params = new URLSearchParams(target.split('?')[1]);
    expect(params.get('external_id')).toBe('u-anch');
    expect(params.get('kind')).toBe('MODIFIER');
  });

  it('does not offer a mapping deep link for a legacy entry that has no platform id', async () => {
    renderWith([order({
      status: 'NEEDS_MAPPING',
      unresolved_items: [{ kind: null, external_id: null, external_text: 'Old Name' }],
    })]);
    expect(await screen.findByText('Old Name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /map this item/i })).not.toBeInTheDocument();
    expect(screen.getByText(/import the menu to map/i)).toBeInTheDocument();
  });

  it('shows a failed kitchen-to-Uber status push', async () => {
    renderWith([order({
      status: 'ACCEPTED', accept_deadline_at: null,
      last_provider_sync_error: 'Could not mark ready on the provider: timed out',
    })]);
    // The default filter is "open"; the page renders whatever the API returns for it.
    expect(await screen.findByText(/could not mark ready/i)).toBeInTheDocument();
  });
});
