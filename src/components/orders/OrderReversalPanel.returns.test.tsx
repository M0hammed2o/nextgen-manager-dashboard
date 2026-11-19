import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrderReversalPanel from './OrderReversalPanel';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Order, OrderItem } from '@/types/api';

// Souk e2e finding (2026-11-19): the manager refund was amount-only, so a
// clothing return could not say which size/colour came back. These tests pin
// the line-return option, which reuses POST /pos/orders/{id}/refund with
// return_items (the same API the staff till uses).

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function line(over: Partial<OrderItem>): OrderItem {
  return {
    id: 'oi-1', name_snapshot: 'Logo Tee', unit_price_cents: 20000, quantity: 2, line_total_cents: 40000,
    options_snapshot: null, add_ons_snapshot: null, selected_options_snapshot: null, special_instructions: null,
    variant_id: 'var-m-black', variant_label_snapshot: 'M / Black', returned_quantity: 0, ...over,
  };
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'order-1', order_number: 'A-0042', status: 'COMPLETED', payment_status: 'PAID', payment_method: 'CASH',
    payment_reference: null, payment_link_url: null, payment_required: false, paid_at: '2026-11-19T10:00:00Z',
    order_mode: 'PICKUP', source: 'POS', subtotal_cents: 55000, delivery_fee_cents: 0, total_cents: 55000,
    currency: 'ZAR', refund_amount_cents: null, refund_reference: null, refunded_at: null, customer_name: 'Walk-in',
    phone_number: null, delivery_address: null, estimated_ready_at: null, confirmed_at: null, accepted_at: null,
    ready_at: null, completed_at: null, cancelled_reason: null,
    items: [
      line({}),
      line({ id: 'oi-2', variant_id: 'var-l-red', variant_label_snapshot: 'L / Red', quantity: 1, line_total_cents: 15000, unit_price_cents: 15000, returned_quantity: 1 }),
      line({ id: 'oi-3', name_snapshot: 'Cap', variant_id: null, variant_label_snapshot: null, quantity: 1, unit_price_cents: 15000, line_total_cents: 15000 }),
    ],
    created_at: '2026-11-19T09:00:00Z', updated_at: '2026-11-19T09:00:00Z',
    ...over,
  } as Order;
}

function renderPanel(o: Order, onDone = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><OrderReversalPanel order={o} role="MANAGER" onDone={onDone} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
}

describe('OrderReversalPanel — line returns', () => {
  afterEach(() => vi.clearAllMocks());

  it('offers "Return items" only for POS orders with variant lines', () => {
    renderPanel(order({ items: [line({ variant_id: null, variant_label_snapshot: null })] }));
    expect(screen.queryByRole('radio', { name: 'Return items' })).not.toBeInTheDocument();
  });

  it('lists only lines with units left, and sends return_items without an amount (backend prices them)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(order({ payment_status: 'PARTIALLY_REFUNDED', refund_amount_cents: 20000 }) as never);
    const onDone = vi.fn();
    renderPanel(order(), onDone);
    fireEvent.click(screen.getByRole('radio', { name: 'Return items' }));
    const lines = screen.getByTestId('return-lines');
    // L / Red is fully returned already; M / Black (2 left) and the cap (1 left) remain.
    expect(lines).not.toHaveTextContent('L / Red');
    expect(lines).toHaveTextContent('M / Black');
    fireEvent.change(screen.getByLabelText('Units of Logo Tee M / Black returned'), { target: { value: '5' } });
    expect(screen.getByLabelText('Units of Logo Tee M / Black returned')).toHaveValue(2); // clamped to what is left
    fireEvent.change(screen.getByLabelText('Units of Logo Tee M / Black returned'), { target: { value: '1' } });
    expect(screen.getByTestId('return-value')).toHaveTextContent(/200[.,]00/);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Wrong size' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/pos/orders/order-1/refund', {
      return_items: [{ order_item_id: 'oi-1', quantity: 1 }],
      reason: 'Wrong size',
      restore_stock: true,
    }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Return recorded', description: expect.stringMatching(/1 item returned, R.?200[.,]00 refunded, back in stock/),
    }));
  });

  it('sends a lower amount override when one is typed', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(order({ payment_status: 'PARTIALLY_REFUNDED', refund_amount_cents: 15000 }) as never);
    renderPanel(order());
    fireEvent.click(screen.getByRole('radio', { name: 'Return items' }));
    fireEvent.change(screen.getByLabelText('Units of Logo Tee M / Black returned'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Refund less than the value of the items/), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Restocking fee' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/pos/orders/order-1/refund',
      expect.objectContaining({ amount_cents: 15000, return_items: [{ order_item_id: 'oi-1', quantity: 1 }] })));
  });

  it('requires at least one returned unit and a reason before calling the API', () => {
    renderPanel(order());
    fireEvent.click(screen.getByRole('radio', { name: 'Return items' }));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    expect(screen.getByText('Choose at least one item that came back.')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('explains the backend refusing more units than are left', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('only 0 left', 422, 'RETURN_EXCEEDS_SOLD'));
    renderPanel(order());
    fireEvent.click(screen.getByRole('radio', { name: 'Return items' }));
    fireEvent.change(screen.getByLabelText('Units of Logo Tee M / Black returned'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Wrong size' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    expect(await screen.findByText(/more units than are left to return/)).toBeInTheDocument();
  });

  it('switching back to "An amount" keeps the original amount refund', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(order({ payment_status: 'REFUNDED', refund_amount_cents: 55000 }) as never);
    renderPanel(order());
    fireEvent.click(screen.getByRole('radio', { name: 'Return items' }));
    fireEvent.click(screen.getByRole('radio', { name: 'An amount' }));
    expect(screen.getByLabelText('Amount (R)')).toHaveValue('550.00');
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Unhappy' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/v1/business/pos/orders/order-1/refund', {
      amount_cents: 55000, reason: 'Unhappy', restore_stock: false,
    }));
  });
});
