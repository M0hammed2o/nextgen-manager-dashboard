import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockPage from './StockPage';
import { apiClient } from '@/lib/api-client';
import type { Ingredient } from '@/types/inventory';
import type { Supplier } from '@/types/inventory';

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

const LIVE_STOCK = {
  period_started_at: null,
  period_label: 'this period',
  total_expected_value_cents: 0,
  ingredient_count: 1,
  needs_attention_count: 0,
  rows: [],
};

const INGREDIENT: Ingredient = {
  id: 'ing-1',
  name: 'Flour',
  sku: null,
  canonical_unit: 'GRAM',
  count_method: 'WEIGHT',
  unit_label: null,
  category: null,
  purchase_unit_name: 'bag',
  purchase_pack_milli: 1000000,
  cost_per_pack_cents: 5000,
  cost_per_canonical_micro_cents: 5,
  par_level_milli: null,
  is_active: true,
  notes: null,
  on_hand_milli: 0,
  on_hand_display: '0 g',
  below_par: false,
};

const SUPPLIER: Supplier = {
  id: 'sup-1',
  name: 'Acme Foods',
  contact_name: null,
  phone: null,
  email: null,
  is_active: true,
  goods_receipt_count: 0,
  last_received_at: null,
};

function mockGet(map: Record<string, unknown>) {
  vi.mocked(apiClient.get).mockImplementation((path: string) => {
    for (const key of Object.keys(map)) {
      if (path === key || path.startsWith(key + '?')) return Promise.resolve(map[key]);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

const BASE_GETS = {
  '/v1/business/external-orders/status': { platforms: [], any_stale: false, stock_warning: null },
  '/v1/business/setup/live-stock': LIVE_STOCK,
  '/v1/business/inventory/ingredients': [INGREDIENT],
  '/v1/business/setup/recipe-coverage': { missing: 0, incomplete: 0 },
};

describe('StockPage — record a delivery: supplier attribution', () => {
  afterEach(() => vi.clearAllMocks());

  // ── BUG-0112: the idempotency key must actually be SENT ─────────────────
  // The backend's partial unique index on (business_id, idempotency_key) is
  // inert unless the client sends a key, and the bug it closes is a request
  // that reached the server, appeared to time out, and was resubmitted.
  async function fillOneDeliveryLine() {
    fireEvent.click(await screen.findByRole('button', { name: /record a delivery/i }));
    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    const sel = screen.getByText(/choose ingredient…/i).closest('select')!;
    fireEvent.change(sel, { target: { value: 'ing-1' } });
    fireEvent.change(screen.getByPlaceholderText(/how many/i), { target: { value: '10' } });
  }
  const keyOfCall = (i: number) =>
    (vi.mocked(apiClient.post).mock.calls[i] as [string, { idempotency_key?: string }])[1]
      .idempotency_key;

  it('sends an idempotency_key with the goods receipt (BUG-0112)', async () => {
    mockGet({ ...BASE_GETS, '/v1/business/inventory/suppliers': [SUPPLIER] });
    vi.mocked(apiClient.post).mockResolvedValue({});
    renderWithProviders(<StockPage />);
    await fillOneDeliveryLine();
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(keyOfCall(0), 'a goods receipt must carry an idempotency key').toBeTruthy();
  });

  it('reuses the SAME key when a failed submit is retried (BUG-0112)', async () => {
    // A retry after a failure must replay the original request rather than
    // create a second receipt, so the key must NOT be regenerated.
    mockGet({ ...BASE_GETS, '/v1/business/inventory/suppliers': [SUPPLIER] });
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({});
    renderWithProviders(<StockPage />);
    await fillOneDeliveryLine();
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(keyOfCall(0)).toBeTruthy();
    expect(keyOfCall(1), 'a retry must replay the ORIGINAL key').toBe(keyOfCall(0));
  });

  it('mints a FRESH key for the next delivery after a successful one (BUG-0112)', async () => {
    // The mirror risk of the retry case: if the key were NOT cleared on
    // success, a second genuine delivery would reuse the first key and the
    // backend would replay the original receipt — silently losing a real
    // delivery. Clearing on success (and only on success) is what prevents
    // that, so pin it.
    mockGet({ ...BASE_GETS, '/v1/business/inventory/suppliers': [SUPPLIER] });
    vi.mocked(apiClient.post).mockResolvedValue({});
    renderWithProviders(<StockPage />);
    await fillOneDeliveryLine();
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    await fillOneDeliveryLine();
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    expect(keyOfCall(0)).toBeTruthy();
    expect(keyOfCall(1)).toBeTruthy();
    expect(keyOfCall(1), 'a NEW delivery must get a NEW key').not.toBe(keyOfCall(0));
  });

  it('submits the chosen supplier_id alongside the delivery lines', async () => {
    mockGet({
      ...BASE_GETS,
      '/v1/business/inventory/suppliers': [SUPPLIER],
    });
    vi.mocked(apiClient.post).mockResolvedValue({});

    renderWithProviders(<StockPage />);

    fireEvent.click(await screen.findByRole('button', { name: /record a delivery/i }));

    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    const ingredientSelect = screen.getByText(/choose ingredient…/i).closest('select')!;
    fireEvent.change(ingredientSelect, { target: { value: 'ing-1' } });

    const quantityInput = screen.getByPlaceholderText(/how many/i);
    fireEvent.change(quantityInput, { target: { value: '10' } });

    const supplierSelect = await screen.findByLabelText(/supplier \(optional\)/i);
    fireEvent.change(supplierSelect, { target: { value: 'sup-1' } });

    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0] as [string, { supplier_id: string | null }];
    expect(path).toBe('/v1/business/inventory/goods-receipts');
    expect(body.supplier_id).toBe('sup-1');
  });

  it('is not blocked from recording a delivery when no suppliers exist yet, and points at the Suppliers page instead', async () => {
    mockGet({
      ...BASE_GETS,
      '/v1/business/inventory/suppliers': [],
    });
    vi.mocked(apiClient.post).mockResolvedValue({});

    renderWithProviders(<StockPage />);

    fireEvent.click(await screen.findByRole('button', { name: /record a delivery/i }));

    expect(await screen.findByText(/no suppliers set up yet/i)).toBeInTheDocument();
    const addSupplierLink = screen.getByRole('link', { name: /add one/i });
    expect(addSupplierLink).toHaveAttribute('href', '/suppliers');
    // No supplier <select> is rendered when there's nothing to pick from.
    expect(screen.queryByLabelText(/supplier \(optional\)/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    const ingredientSelect = screen.getByText(/choose ingredient…/i).closest('select')!;
    fireEvent.change(ingredientSelect, { target: { value: 'ing-1' } });
    fireEvent.change(screen.getByPlaceholderText(/how many/i), { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.post).mock.calls[0] as [string, { supplier_id: string | null }];
    expect(body.supplier_id).toBeNull();
  });
});
