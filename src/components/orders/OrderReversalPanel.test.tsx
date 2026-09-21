import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrderReversalPanel from './OrderReversalPanel';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Order } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    order_number: 'A-0042',
    status: 'READY',
    payment_status: 'PAID',
    payment_method: 'CASH',
    payment_reference: null,
    payment_link_url: null,
    payment_required: false,
    paid_at: '2026-09-20T10:00:00Z',
    order_mode: 'PICKUP',
    source: 'POS',
    subtotal_cents: 19999,
    delivery_fee_cents: 0,
    total_cents: 19999,
    currency: 'ZAR',
    refund_amount_cents: null,
    refund_reference: null,
    refunded_at: null,
    customer_name: 'Walk-in',
    phone_number: null,
    delivery_address: null,
    estimated_ready_at: null,
    confirmed_at: null,
    accepted_at: null,
    ready_at: null,
    completed_at: null,
    cancelled_reason: null,
    items: [],
    created_at: '2026-09-20T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('OrderReversalPanel — role gating', () => {
  afterEach(() => vi.clearAllMocks());

  it('STAFF never sees the void/refund actions, even for an eligible POS/PAID order', () => {
    const { container } = renderWithClient(
      <OrderReversalPanel order={order()} role="STAFF" onDone={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument();
  });

  it('OWNER sees both actions for an eligible POS/PAID order', () => {
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^void$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeInTheDocument();
  });

  it('MANAGER sees both actions for an eligible POS/PAID order', () => {
    renderWithClient(<OrderReversalPanel order={order()} role="MANAGER" onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^void$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeInTheDocument();
  });
});

describe('OrderReversalPanel — eligibility matrix', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders nothing for an UNPAID order', () => {
    const { container } = renderWithClient(
      <OrderReversalPanel order={order({ payment_status: 'UNPAID' })} role="OWNER" onDone={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a PENDING order', () => {
    const { container } = renderWithClient(
      <OrderReversalPanel order={order({ payment_status: 'PENDING' })} role="OWNER" onDone={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('a non-POS PAID order (e.g. WhatsApp) only offers Refund, never Void', () => {
    renderWithClient(
      <OrderReversalPanel order={order({ source: 'WHATSAPP' })} role="OWNER" onDone={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeInTheDocument();
  });

  it('shows a "Sale voided" summary, not action buttons, once VOIDED', () => {
    renderWithClient(
      <OrderReversalPanel
        order={order({ payment_status: 'VOIDED', refund_amount_cents: 19999, refund_reference: 'Wrong item' })}
        role="OWNER"
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/sale voided/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument();
  });

  it('shows a "Refunded" summary, not action buttons, once REFUNDED', () => {
    renderWithClient(
      <OrderReversalPanel
        order={order({ payment_status: 'REFUNDED', refund_amount_cents: 19999 })}
        role="OWNER"
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/^refunded$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument();
  });

  it('a PARTIALLY_REFUNDED order shows the reversed summary, not new action buttons (backend rejects a second reversal — ORDER_NOT_PAID)', () => {
    renderWithClient(
      <OrderReversalPanel
        order={order({ payment_status: 'PARTIALLY_REFUNDED', refund_amount_cents: 5000 })}
        role="OWNER"
        onDone={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
  });
});

describe('OrderReversalPanel — refund submission', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('defaults restore_stock to false when the box is left unticked', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(order({ payment_status: 'REFUNDED', refund_amount_cents: 19999 }));
    const onDone = vi.fn();
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={onDone} />);

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Customer unhappy' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/orders/order-1/refund',
      expect.objectContaining({ restore_stock: false, reason: 'Customer unhappy', amount_cents: 19999 })
    );
  });

  it('maps the "Put the items back into stock" checkbox to restore_stock: true when ticked', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(order({ payment_status: 'REFUNDED', refund_amount_cents: 19999 }));
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Food never made' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/orders/order-1/refund',
      expect.objectContaining({ restore_stock: true })
    );
  });

  it('parses a rand amount into exact integer cents (19.99 -> 1999, never a float-drifted value)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(order({ payment_status: 'REFUNDED', refund_amount_cents: 1999 }));
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    const amountInput = screen.getByLabelText(/amount/i);
    // Pre-filled from the order total (R199.99), converted with no float math.
    expect((amountInput as HTMLInputElement).value).toBe('199.99');

    fireEvent.change(amountInput, { target: { value: '19.99' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Partial goodwill refund' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/orders/order-1/refund',
      expect.objectContaining({ amount_cents: 1999 })
    );
  });

  it('rejects an invalid amount without calling the backend', async () => {
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: 'not a number' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Reason' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    expect(await screen.findByText(/enter a valid refund amount/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('requires a reason before submitting a void', async () => {
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^void$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^void sale$/i }));

    expect(await screen.findByText(/give a reason/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('maps a TILL_NOT_OPEN error into the plain-English message', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError('A cash refund or void requires an open till session', 409, 'TILL_NOT_OPEN')
    );
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^void$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Wrong item' } });
    fireEvent.click(screen.getByRole('button', { name: /^void sale$/i }));

    expect(await screen.findByText(/open the till on the staff app/i)).toBeInTheDocument();
  });

  it('does not claim success for a MANUAL_REQUIRED provider refund result (no fake success state)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      success: false,
      status: 'MANUAL_REQUIRED',
      provider_reference: null,
      error: null,
      order: order({ source: 'WHATSAPP', payment_status: 'PAID' }),
    });
    renderWithClient(
      <OrderReversalPanel order={order({ source: 'WHATSAPP' })} role="OWNER" onDone={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Customer unhappy' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    expect(await screen.findByText(/refund not completed/i)).toBeInTheDocument();
    // Still shows the refund action — not the "already reversed" summary —
    // because payment_status genuinely never changed.
    expect(screen.queryByText(/^refunded$/i)).not.toBeInTheDocument();
  });
});
