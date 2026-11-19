import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VariantsSection, parseStockChange } from './VariantsSection';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Variant } from '@/lib/variants';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

const ITEM = 'item-1';

function variant(over: Partial<Variant> = {}): Variant {
  return {
    id: 'v1', menu_item_id: ITEM, sku: 'TEE-M-BLACK', barcode: '600123', attributes: { size: 'M', colour: 'Black' },
    label: 'M / Black', price_cents: null, effective_price_cents: 19900, cost_cents: null, is_active: true,
    sort_order: 0, ingredient_id: 'ing', stock_on_hand: 7, ...over,
  };
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><VariantsSection itemId={ITEM} itemName="Tee" /></QueryClientProvider>);
}

function addChip(label: string, text: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
  fireEvent.keyDown(screen.getByLabelText(label), { key: 'Enter' });
}

describe('VariantsSection', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders each variant with label, SKU, barcode, effective price and stock', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      variant(),
      variant({ id: 'v2', sku: 'TEE-L-RED', label: 'L / Red', barcode: null, stock_on_hand: null, price_cents: 24900, effective_price_cents: 24900 }),
    ] as never);
    renderSection();
    expect(screen.getByTestId('variants-loading')).toBeInTheDocument();
    await screen.findByText('M / Black');
    expect(apiClient.get).toHaveBeenCalledWith(`/v1/business/menu/items/${ITEM}/variants?include_inactive=false`);
    expect(screen.getByText('SKU TEE-M-BLACK')).toBeInTheDocument();
    expect(screen.getByDisplayValue('600123')).toBeInTheDocument();
    expect(screen.getByText(/199[.,]00/)).toBeInTheDocument();
    expect(screen.getByText('7 in stock')).toBeInTheDocument();
    expect(screen.getByText('Stock not tracked')).toBeInTheDocument();
    expect(screen.getByDisplayValue('249.00')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
    renderSection();
    expect(await screen.findByTestId('variants-empty')).toBeInTheDocument();
  });

  it('shows an error state with Retry', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new ApiError('Request failed (500)', 500)).mockResolvedValue([] as never);
    renderSection();
    await screen.findByRole('alert');
    expect(screen.getByText('Request failed (500)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('variants-empty')).toBeInTheDocument();
  });

  it('saves an inline edit, sending null to clear the override and barcode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([variant({ price_cents: 24900, effective_price_cents: 24900 })] as never);
    vi.mocked(apiClient.patch).mockResolvedValue(variant() as never);
    renderSection();
    const price = await screen.findByLabelText('Price override (R)');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(price, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: '' } });
    fireEvent.click(save);
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/v1/business/menu/variants/v1', {
      price_cents: null, barcode: null, is_active: true,
    }));
  });

  it('surfaces a BARCODE_TAKEN error as a clear toast', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([variant()] as never);
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('dup', 409, 'BARCODE_TAKEN'));
    renderSection();
    fireEvent.change(await screen.findByLabelText('Barcode'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive', description: expect.stringMatching(/barcode is already used/),
    })));
  });

  it('matrix builder previews SKUs and count, blocks over 200, then posts the payload', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
    vi.mocked(apiClient.post).mockResolvedValue([variant()] as never);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /Generate sizes/ }));
    fireEvent.change(screen.getByLabelText('SKU prefix'), { target: { value: 'tee' } });
    addChip('Sizes', 'S, Extra Large');
    addChip('Colours', 'Black');
    expect(screen.getByTestId('matrix-count')).toHaveTextContent('2 variants will be created');
    expect(screen.getByText('TEE-S-BLACK')).toBeInTheDocument();
    expect(screen.getByText('TEE-EXTRALARGE-BLACK')).toBeInTheDocument();

    addChip('Sizes', Array.from({ length: 200 }, (_, i) => `s${i}`).join(','));
    expect(screen.getByRole('alert')).toHaveTextContent(/too many/);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    // Restart the panel with a small, valid matrix.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate sizes/ }));
    fireEvent.change(screen.getByLabelText('SKU prefix'), { target: { value: 'tee' } });
    addChip('Sizes', 'S');
    fireEvent.change(screen.getByLabelText('Price (R)'), { target: { value: '199.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create 1' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/v1/business/menu/items/${ITEM}/variants/matrix`,
      { sku_prefix: 'tee', sizes: ['S'], colours: [], track_stock: true, price_cents: 19999 },
    ));
  });

  it('shows SKU_PATTERN_COLLISION from the server as a clear message', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('x', 422, 'SKU_PATTERN_COLLISION'));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /Generate sizes/ }));
    fireEvent.change(screen.getByLabelText('SKU prefix'), { target: { value: 'T' } });
    addChip('Sizes', 'S');
    fireEvent.click(screen.getByRole('button', { name: 'Create 1' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringMatching(/same SKU/),
    })));
  });

  it('adjusts one tracked variant stock via the audited adjustments endpoint (e2e: stock not editable after creation)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      variant(),
      variant({ id: 'v2', sku: 'TEE-L-RED', label: 'L / Red', ingredient_id: null, stock_on_hand: null }),
    ] as never);
    vi.mocked(apiClient.post).mockResolvedValue({} as never);
    renderSection();
    await screen.findByText('M / Black');
    // Untracked variants have nothing to adjust.
    expect(screen.queryByRole('button', { name: 'Adjust stock for L / Red' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust stock for M / Black' }));
    const change = screen.getByLabelText(/Change in units/);
    fireEvent.change(change, { target: { value: '-9' } });
    expect(screen.getByText(/would leave -2 in stock/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update stock' })).toBeDisabled();
    fireEvent.change(change, { target: { value: '5' } });
    expect(screen.getByTestId('stock-preview-TEE-M-BLACK')).toHaveTextContent('7 → 12 in stock');
    fireEvent.click(screen.getByRole('button', { name: 'Update stock' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/inventory/adjustments', {
      ingredient_id: 'ing', quantity: '5', unit: 'unit', reason: 'Stock count correction',
    }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Stock updated' })));
  });

  it('explains when inventory is not switched on', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([variant()] as never);
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('off', 409, 'INVENTORY_NOT_ENABLED') as never);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Adjust stock for M / Black' }));
    fireEvent.change(screen.getByLabelText(/Change in units/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update stock' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Could not update stock', description: expect.stringMatching(/is not switched on for this business/),
    })));
  });

  it('parseStockChange accepts signed whole numbers only', () => {
    expect(parseStockChange('5')).toBe(5);
    expect(parseStockChange('+3')).toBe(3);
    expect(parseStockChange('-2')).toBe(-2);
    for (const bad of ['', '0', '1.5', 'abc', '--1']) expect(parseStockChange(bad)).toBeNull();
  });
});
