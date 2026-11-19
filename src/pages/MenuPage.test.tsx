import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MenuPage from './MenuPage';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Radix primitives measure themselves with ResizeObserver, which jsdom lacks.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const TEE = {
  id: 'item-tee', name: 'Logo Tee', description: null, price_cents: 19900, category_id: null, is_active: true,
  requires_preparation: false, image_url: null, options_json: null, add_ons: [],
};

function mockApi(category: 'CLOTHING' | 'FOOD' | null, items: unknown[] = []) {
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/v1/business/menu/categories') return [] as never;
    if (url === '/v1/business/menu/items') return items as never;
    if (url === '/v1/business/menu/add-ons') return [] as never;
    if (url === '/v1/business/event-access') {
      return (category
        ? { is_event_vendor: true, access_level: 'CONFIGURE', reason: 'PREP_WINDOW', events: [{ event_id: 'e1', category }] }
        : { is_event_vendor: false }) as never;
    }
    if (url.startsWith(`/v1/business/menu/items/${TEE.id}/variants`)) return [] as never;
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><MenuPage /></MemoryRouter></QueryClientProvider>,
  );
}

async function createTee(clothing: boolean) {
  fireEvent.click((await screen.findAllByRole('button', { name: /Add Item/ }))[0]);
  const dialog = await screen.findByRole('dialog');
  // Wait until event access has loaded (the hint appears) so the clothing path is live.
  if (clothing) await screen.findByTestId('variants-after-create-hint');
  const [name] = dialog.querySelectorAll('input:not([type="file"]):not([type="number"])');
  fireEvent.change(name, { target: { value: 'Logo Tee' } });
  fireEvent.change(dialog.querySelector('input[type="number"]')!, { target: { value: '199' } });
  vi.mocked(apiClient.post).mockResolvedValue(TEE as never);
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
}

describe('MenuPage item dialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('gives the edit and delete icons accessible names (e2e: unlabelled pencil)', async () => {
    mockApi('CLOTHING', [TEE]);
    renderPage();
    const edit = await screen.findByRole('button', { name: 'Edit Logo Tee' });
    await waitFor(() => expect(edit).toHaveAttribute('title', 'Edit item, sizes and colours'));
    expect(screen.getByRole('button', { name: 'Delete Logo Tee' })).toBeInTheDocument();
  });

  it('offers "Add sizes & colours" right after a clothing vendor creates an item, then opens its variants', async () => {
    mockApi('CLOTHING');
    renderPage();
    await createTee(true);
    expect(await screen.findByTestId('item-created-offer')).toHaveTextContent('Logo Tee');
    fireEvent.click(screen.getByRole('button', { name: 'Add sizes & colours' }));
    expect(await screen.findByRole('region', { name: 'Variants' })).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(`/v1/business/menu/items/${TEE.id}/variants?include_inactive=false`));
    expect(screen.getByRole('button', { name: /Generate sizes/ })).toBeInTheDocument();
  });

  it('shows the add-sizes-after-saving hint on a new clothing item', async () => {
    mockApi('CLOTHING');
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Item/ }))[0]);
    expect(await screen.findByTestId('variants-after-create-hint')).toBeInTheDocument();
  });

  it('a restaurant (not an event clothing vendor) still closes the dialog after create, no offer', async () => {
    mockApi(null);
    renderPage();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/v1/business/event-access'));
    await createTee(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByTestId('item-created-offer')).not.toBeInTheDocument();
  });
});
