import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExternalOrdersPage from './ExternalOrdersPage';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings } from '@/types/api';

/**
 * UI V2.1 follow-up (Part C4): delivery_reconciliation_enabled is this
 * page's own separate commercial entitlement (not delivery_platforms_enabled
 * -- see DeliverySubNav.tsx). Only the entitlement gate itself is tested
 * here, not the full CSV preview/commit workflow, which is unchanged by
 * this follow-up.
 */

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const ENABLED_SETTINGS = { delivery_reconciliation_enabled: true } as unknown as BusinessSettings;
const DISABLED_SETTINGS = { delivery_reconciliation_enabled: false } as unknown as BusinessSettings;

function mockGet(map: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path in map) return Promise.resolve(map[path]);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('ExternalOrdersPage — delivery reconciliation entitlement gate', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows a graceful not-enabled state and never calls the import-status endpoint when delivery_reconciliation_enabled is false', async () => {
    mockGet({ '/v1/business/settings': DISABLED_SETTINGS });
    renderWithProviders(<ExternalOrdersPage />);

    await waitFor(() => expect(screen.getByText(/delivery reconciliation isn't enabled/i)).toBeInTheDocument());
    expect(apiClient.get).not.toHaveBeenCalledWith('/v1/business/external-orders/status');
  });

  it('loads the real importer once delivery_reconciliation_enabled is true', async () => {
    mockGet({
      '/v1/business/settings': ENABLED_SETTINGS,
      '/v1/business/external-orders/status': { platforms: [], stock_warning: null },
      '/v1/business/external-orders/batches': [],
      '/v1/business/menu/items': [],
      '/v1/business/external-orders/mappings?platform=UBER_EATS': [],
    });
    renderWithProviders(<ExternalOrdersPage />);

    await waitFor(() => expect(screen.getByText('Delivery orders')).toBeInTheDocument());
    expect(screen.queryByText(/delivery reconciliation isn't enabled/i)).not.toBeInTheDocument();
  });
});
