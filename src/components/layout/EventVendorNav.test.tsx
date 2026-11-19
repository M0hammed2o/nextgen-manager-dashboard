import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { isNavItemVisible, navItems } from './nav-items';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

function mockApi(vendor: boolean) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/v1/business/settings') {
      return {
        inventory_enabled: true, is_whatsapp_enabled: true, loyalty_enabled: true,
        delivery_platforms_enabled: true, delivery_reconciliation_enabled: false, pos_enabled: true,
      } as never;
    }
    if (url === '/v1/business/setup/progress') {
      return { business_name: 'X', inventory_enabled: true, ready_to_trade: false, percent_complete: 10, steps: [] } as never;
    }
    if (url === '/v1/business/event-access') {
      return { is_event_vendor: vendor, access_level: vendor ? 'CONFIGURE' : null, reason: null, events: [] } as never;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderSidebar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}><Sidebar /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('event vendor navigation', () => {
  afterEach(() => vi.clearAllMocks());

  it('a restaurant tenant keeps its full menu and sees no event entries', async () => {
    mockApi(false);
    renderSidebar();
    await screen.findByText('Dashboard');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/v1/business/event-access'));
    await new Promise((r) => setTimeout(r, 50)); // let the (non-vendor) answer land
    for (const label of ['Dashboard', 'Setup', 'Orders', 'Menu', 'Specials', 'Loyalty', 'Customers', 'Staff', 'Till', 'Delivery Orders', 'Inventory', 'Stocktake', 'Analytics', 'Settings']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('My event')).not.toBeInTheDocument();
    expect(screen.queryByText('Days & payment')).not.toBeInTheDocument();
  });

  it('an event vendor gets event entries and loses delivery, specials, customers, loyalty and the restaurant Setup', async () => {
    mockApi(true);
    renderSidebar();
    await screen.findByText('My event');
    expect(screen.getByText('Days & payment')).toBeInTheDocument();
    for (const label of ['Menu', 'Staff', 'Till', 'Inventory', 'Orders']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of ['Dashboard', 'Setup', 'Specials', 'Customers', 'Delivery Orders']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // Settings -> WhatsApp is hidden for event vendors too.
    fireEvent.click(screen.getByText('Settings'));
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
    expect(screen.getByText('Branding')).toBeInTheDocument();
  });

  it('predicate: eventVendorOnly needs a positive signal, hideForEventVendor defaults to visible', () => {
    const mine = navItems.find((i) => i.to === '/event')!;
    const dash = navItems.find((i) => i.to === '/')!;
    expect(isNavItemVisible(mine, undefined)).toBe(false);
    expect(isNavItemVisible(mine, { is_event_vendor: false })).toBe(false);
    expect(isNavItemVisible(mine, { is_event_vendor: true })).toBe(true);
    expect(isNavItemVisible(dash, undefined)).toBe(true);
    expect(isNavItemVisible(dash, { is_event_vendor: false })).toBe(true);
    expect(isNavItemVisible(dash, { is_event_vendor: true })).toBe(false);
  });
});
