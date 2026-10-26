import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeliveryMappingsPage from './DeliveryMappingsPage';
import { apiClient } from '@/lib/api-client';
import { formatCents } from '@/lib/mappers';
import type { BusinessSettings, DeliveryMappingResponse } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() },
  };
});

const ENABLED_SETTINGS = { delivery_platforms_enabled: true } as unknown as BusinessSettings;

function mapping(overrides: Partial<DeliveryMappingResponse>): DeliveryMappingResponse {
  return {
    id: 'm1', platform: 'UBER_EATS', kind: 'ITEM', external_id: 'u-marg', external_text: 'Margherita',
    status: 'MAPPED', status_reason: null, menu_item_id: 'mi-1', menu_item_name: 'Margherita',
    option_id: null, menu_add_on_id: null, menu_add_on_name: null, removable_ref_id: null,
    is_ignored: false, last_seen_at: null, times_used: 0,
    provider_price_cents: 11000, provider_group_title: null, menu_price_cents: 9000,
    ...overrides,
  };
}

function renderWith(mappings: DeliveryMappingResponse[], initialPath = '/settings/delivery/mappings') {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    if (path === '/v1/business/settings') return Promise.resolve(ENABLED_SETTINGS);
    if (path === '/v1/business/delivery/menu-mappings') return Promise.resolve(mappings);
    if (path === '/v1/business/menu/items' || path === '/v1/business/menu/add-ons') return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}><DeliveryMappingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeliveryMappingsPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('imports the Uber Eats menu through the read-only import endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      provider: 'UBER_EATS', fetched: 40, created: 38, auto_mapped: 30, adopted_from_csv: 2,
      renamed: 0, unchanged: 0, name_collisions: 1,
    });
    renderWith([]);
    fireEvent.click(await screen.findByRole('button', { name: /import uber eats menu/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/delivery/menu-mappings/import', { provider: 'UBER_EATS' },
    ));
  });

  it('shows the channel price beside the in-store price where they differ', async () => {
    renderWith([mapping({})]);
    // Built from the app's own formatter (locale-specific separators).
    const expected = `Uber Eats price ${formatCents(11000)} · your menu ${formatCents(9000)}`;
    expect(
      await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === expected),
    ).toBeInTheDocument();
  });

  it('explains why a mapping needs re-checking', async () => {
    renderWith([mapping({ status: 'CHANGED', status_reason: "Renamed on the provider from 'Pepperoni' to 'Spicy Pepperoni'" })]);
    expect(await screen.findByText(/renamed on the provider/i)).toBeInTheDocument();
  });

  it('opens the mapping dialog as a MODIFIER when deep-linked from an unmapped modifier', async () => {
    renderWith([], '/settings/delivery/mappings?platform=UBER_EATS&external_id=u-anch&external_text=Anchovies&kind=MODIFIER');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('u-anch')).toBeInTheDocument();
    expect(screen.getByText(/modifier \/ option \/ add-on/i)).toBeInTheDocument();
  });
});
