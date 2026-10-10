import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeliverySubNav } from './DeliverySubNav';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function mockSettings(overrides: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockResolvedValue(overrides as never);
}

function renderSubNav() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DeliverySubNav />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DeliverySubNav — two independent delivery entitlements (follow-up Part C4)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reconciliation=false, platforms=false: renders no tabs at all', async () => {
    mockSettings({ delivery_reconciliation_enabled: false, delivery_platforms_enabled: false });
    renderSubNav();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
    expect(screen.queryByText('Connections')).not.toBeInTheDocument();
  });

  it('reconciliation=true, platforms=false: shows only Import, hides all marketplace tabs', async () => {
    mockSettings({ delivery_reconciliation_enabled: true, delivery_platforms_enabled: false });
    renderSubNav();

    await waitFor(() => expect(screen.getByText('Import')).toBeInTheDocument());
    expect(screen.queryByText('Connections')).not.toBeInTheDocument();
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    expect(screen.queryByText('Menu Mapping')).not.toBeInTheDocument();
  });

  it('reconciliation=false, platforms=true: shows marketplace tabs, hides Import', async () => {
    mockSettings({ delivery_reconciliation_enabled: false, delivery_platforms_enabled: true });
    renderSubNav();

    await waitFor(() => expect(screen.getByText('Connections')).toBeInTheDocument());
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Menu Mapping')).toBeInTheDocument();
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
  });

  it('both=true: shows the complete set of tabs', async () => {
    mockSettings({ delivery_reconciliation_enabled: true, delivery_platforms_enabled: true });
    renderSubNav();

    await waitFor(() => expect(screen.getByText('Import')).toBeInTheDocument());
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Menu Mapping')).toBeInTheDocument();
  });
});
