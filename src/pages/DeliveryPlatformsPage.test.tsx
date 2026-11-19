import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeliveryPlatformsPage from './DeliveryPlatformsPage';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings, DeliveryConnectionResponse } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() },
  };
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const ENABLED_SETTINGS = { delivery_platforms_enabled: true } as unknown as BusinessSettings;
const DISABLED_SETTINGS = { delivery_platforms_enabled: false } as unknown as BusinessSettings;

function connection(overrides: Partial<DeliveryConnectionResponse>): DeliveryConnectionResponse {
  return {
    id: 'c1', provider: 'UBER_EATS', provider_label: 'Uber Eats', status: 'NOT_CONNECTED',
    environment: 'production', external_store_id: null, store_status: null, last_status_synced_at: null,
    activated_at: null, disconnected_at: null, error_reason: null, needs_attention: false,
    last_webhook_at: null, last_order_at: null, created_at: null, updated_at: null,
    ...overrides,
  };
}

function mockGet(map: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path in map) return Promise.resolve(map[path]);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('DeliveryPlatformsPage — honesty contract', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows a graceful module-not-enabled state and never calls the connections endpoint when delivery_platforms_enabled is false', async () => {
    mockGet({ '/v1/business/settings': DISABLED_SETTINGS });
    renderWithProviders(<DeliveryPlatformsPage />);

    await waitFor(() => expect(screen.getByText(/delivery marketplace isn't enabled/i)).toBeInTheDocument());
    expect(apiClient.get).not.toHaveBeenCalledWith('/v1/business/delivery/connections');
  });

  it('SANDBOX never renders "Connected" anywhere on the Uber Eats card', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'SANDBOX' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
    });
    renderWithProviders(<DeliveryPlatformsPage />);

    await waitFor(() => expect(screen.getAllByText(/sandbox/i).length).toBeGreaterThan(0));
    // "Connected" must not appear ANYWHERE on the page in this state.
    expect(screen.queryByText(/^connected$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/connected — live/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/not live/i).length).toBeGreaterThan(0);
  });

  it('AWAITING_APPROVAL never renders "Connected" anywhere on the Uber Eats card', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'AWAITING_APPROVAL' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
    });
    renderWithProviders(<DeliveryPlatformsPage />);

    await waitFor(() => expect(screen.getByText(/awaiting uber approval/i)).toBeInTheDocument());
    expect(screen.queryByText(/connected — live/i)).not.toBeInTheDocument();
    expect(screen.getByText(/not yet approved/i)).toBeInTheDocument();
  });

  it('CONNECTED shows live wording for Uber Eats (the one true positive case)', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'CONNECTED', external_store_id: 'store-123' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
    });
    renderWithProviders(<DeliveryPlatformsPage />);

    await waitFor(() => expect(screen.getByText(/connected — live/i)).toBeInTheDocument());
  });

  it('Mr D always renders as "Mr D File Reconciliation" and never as live/connected, even if the backend somehow returned CONNECTED', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'NOT_CONNECTED' }),
        connection({ provider: 'MR_D', status: 'CONNECTED' }),
      ],
    });
    renderWithProviders(<DeliveryPlatformsPage />);

    await waitFor(() => expect(screen.getByText('Mr D File Reconciliation')).toBeInTheDocument());
    // No "Connected — live" badge anywhere for Mr D, and a link to the CSV importer instead.
    expect(screen.queryByText(/connected — live/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to csv import/i })).toHaveAttribute('href', '/delivery-orders');
  });

  it('labels Mr D live connectivity "Pending partner approval"', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'NOT_CONNECTED' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
    });
    renderWithProviders(<DeliveryPlatformsPage />);
    await waitFor(() => expect(screen.getByText('Pending partner approval')).toBeInTheDocument());
  });

  it('shows 24h order-flow health and flags an acceptance rate under Uber\'s 99% bar', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'CONNECTED', external_store_id: 'store-123' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
      '/v1/business/delivery/health': [{
        provider: 'UBER_EATS', provider_label: 'Uber Eats', connection_status: 'CONNECTED', environment: 'production',
        needs_attention: false, error_reason: null, store_status: 'ONLINE', last_webhook_at: null,
        open_orders: 1, needs_mapping: 0, ready_to_accept: 1, accept_unconfirmed: 0, provider_sync_errors: 0,
        accepted_24h: 97, denied_24h: 3, failed_24h: 0, acceptance_rate_24h: 0.97, unmapped_menu_entries: 4,
      }],
    });
    renderWithProviders(<DeliveryPlatformsPage />);
    await waitFor(() => expect(screen.getByText('97.0%')).toBeInTheDocument());
    expect(screen.getByText('97 of 100')).toBeInTheDocument();
    expect(screen.getByText(/uber expects at least 99%/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '4' })).toHaveAttribute('href', '/settings/delivery/mappings');
  });

  it('pauses new Uber Eats orders on a live connection through the store-status endpoint', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'CONNECTED', external_store_id: 'store-123', store_status: 'ONLINE' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
    });
    vi.mocked(apiClient.post).mockResolvedValue({ provider: 'UBER_EATS', store_status: 'PAUSED', last_status_synced_at: null });
    renderWithProviders(<DeliveryPlatformsPage />);
    const button = await screen.findByRole('button', { name: /pause new orders/i });
    fireEvent.click(button);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/delivery/connections/UBER_EATS/store-status', { status: 'PAUSED' },
    ));
  });

  it('offers no store controls before Uber has connected the store', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/delivery/connections': [
        connection({ provider: 'UBER_EATS', status: 'AWAITING_APPROVAL', external_store_id: 'store-123' }),
        connection({ provider: 'MR_D', status: 'NOT_CONNECTED' }),
      ],
    });
    renderWithProviders(<DeliveryPlatformsPage />);
    await waitFor(() => expect(screen.getByText(/awaiting uber approval/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /pause new orders/i })).not.toBeInTheDocument();
  });

  it('shows a distinct error state with Retry, not the empty state, on a failed fetch', async () => {
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/v1/business/settings') return Promise.resolve(ENABLED_SETTINGS);
      return Promise.reject(new Error('network down'));
    });
    renderWithProviders(<DeliveryPlatformsPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load your delivery connections/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
