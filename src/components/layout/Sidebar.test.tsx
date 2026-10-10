import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function mockApi({
  readyToTrade = true,
  inventoryEnabled = false,
  whatsappEnabled = false,
  loyaltyEnabled = false,
}: {
  readyToTrade?: boolean;
  inventoryEnabled?: boolean;
  whatsappEnabled?: boolean;
  loyaltyEnabled?: boolean;
} = {}) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/v1/business/settings') {
      return {
        inventory_enabled: inventoryEnabled,
        is_whatsapp_enabled: whatsappEnabled,
        loyalty_enabled: loyaltyEnabled,
      } as never;
    }
    if (url === '/v1/business/setup/progress') {
      return {
        business_name: 'Kestrel Kitchen',
        inventory_enabled: inventoryEnabled,
        ready_to_trade: readyToTrade,
        percent_complete: readyToTrade ? 100 : 40,
        steps: [],
      } as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderSidebar(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Sidebar — UI V2.1 expandable Settings group (A6)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Settings group collapsed by default, with no child links visible', async () => {
    mockApi();
    renderSidebar('/');

    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    expect(screen.queryByText('Branding')).not.toBeInTheDocument();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
  });

  it('expands the Settings group on click, revealing its children, and collapses again on a second click', async () => {
    mockApi();
    renderSidebar('/');

    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Settings'));

    expect(screen.getByText('Branding')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Receipts')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Settings'));
    expect(screen.queryByText('Branding')).not.toBeInTheDocument();
  });

  it('auto-expands Settings when the active route is already one of its children', async () => {
    mockApi();
    renderSidebar('/settings/branding');

    await waitFor(() => expect(screen.getByText('Branding')).toBeInTheDocument());
  });

  it('hides the WhatsApp child while is_whatsapp_enabled is false, but keeps the rest of the group', async () => {
    mockApi({ whatsappEnabled: false });
    renderSidebar('/');

    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Settings'));

    expect(screen.getByText('Branding')).toBeInTheDocument();
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });

  it('shows the top-level Setup shortcut while setup is incomplete', async () => {
    mockApi({ readyToTrade: false });
    renderSidebar('/');
    await waitFor(() => expect(screen.getAllByText('Setup').length).toBeGreaterThan(0));
  });

  it('hides the top-level Setup shortcut once ready_to_trade is true (still reachable under Settings)', async () => {
    mockApi({ readyToTrade: true });
    renderSidebar('/');
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());
    expect(screen.queryByText('Setup')).not.toBeInTheDocument();
  });

  it('shows Inventory and Stocktake once the inventory module is on, consolidated rather than as 8 separate links', async () => {
    mockApi({ inventoryEnabled: true });
    renderSidebar('/');

    await waitFor(() => expect(screen.getByText('Inventory')).toBeInTheDocument());
    expect(screen.getByText('Stocktake')).toBeInTheDocument();
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument();
    expect(screen.queryByText('Wastage')).not.toBeInTheDocument();
  });

  it('shows a single "Delivery Orders" entry, never a separate "Delivery Platforms" entry', async () => {
    mockApi();
    renderSidebar('/');

    await waitFor(() => expect(screen.getByText('Delivery Orders')).toBeInTheDocument());
    expect(screen.queryByText('Delivery Platforms')).not.toBeInTheDocument();
  });
});
