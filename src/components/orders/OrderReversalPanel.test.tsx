import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrderReversalPanel from './OrderReversalPanel';
import { apiClient, ApiError } from '@/lib/api-client';
import type { Order } from '@/types/api';
import { formatCents } from '@/lib/mappers';

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

// ---------------------------------------------------------------------------
// Split-payment refunds: the cash-portion question (CASH_REFUND_PORTION_*)
// and Pay-by-Link provider-refund honesty (provider_refund_status).
// ---------------------------------------------------------------------------

const RAW_CODES = /CASH_REFUND_PORTION_REQUIRED|CASH_REFUND_PORTION_INVALID|NO_PENDING_PROVIDER_REFUND|cash_refund_cents/;

// R80.00 order: R50.00 cash + R30.00 card — a genuinely mixed split.
function mixedSplit(overrides: Partial<Order> = {}): Order {
  return order({
    payment_method: 'SPLIT',
    subtotal_cents: 8000,
    total_cents: 8000,
    payment_allocations: [
      { payment_method: 'CASH', amount_cents: 5000, cash_tendered_cents: 5000, change_due_cents: 0 },
      { payment_method: 'CARD', amount_cents: 3000 },
    ],
    ...overrides,
  });
}

// R350.00 order: R50.00 cash + R300.00 Pay-by-Link via Yoco.
function payByLinkSplit(overrides: Partial<Order> = {}): Order {
  return order({
    payment_method: 'SPLIT',
    subtotal_cents: 35000,
    total_cents: 35000,
    payment_allocations: [
      { payment_method: 'CASH', amount_cents: 5000 },
      { payment_method: 'PAY_BY_LINK', amount_cents: 30000, provider: 'YOCO', provider_refund_status: null },
    ],
    ...overrides,
  });
}

function withPblStatus(
  base: Order,
  status: 'PENDING_MANUAL' | 'CONFIRMED',
  confirmedAt: string | null = null,
): Order {
  return {
    ...base,
    payment_allocations: base.payment_allocations!.map((a) =>
      a.payment_method === 'PAY_BY_LINK'
        ? { ...a, provider_refund_status: status, provider_refund_confirmed_at: confirmedAt }
        : a
    ),
  };
}

const CASH_LABEL = /how much of this refund is being returned in cash/i;

function openRefundAndSetAmount(amount?: string) {
  fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
  if (amount !== undefined) {
    fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: amount } });
  }
  fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Customer unhappy' } });
}

describe('OrderReversalPanel — cash portion of a partial split refund', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('asks for the cash portion only for a PARTIAL refund of a genuinely mixed cash/non-cash split', () => {
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    expect(screen.getByLabelText(CASH_LABEL)).toBeInTheDocument();
  });

  it('never shows the field for a FULL refund of a mixed split, and does not send cash_refund_cents', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(mixedSplit({ payment_status: 'REFUNDED', refund_amount_cents: 8000 }));
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount(); // pre-filled with the full R80.00
    expect(screen.queryByLabelText(CASH_LABEL)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const body = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
    expect(body.amount_cents).toBe(8000);
    expect('cash_refund_cents' in body).toBe(false);
  });

  it('does not ask for a partial refund of an all-cash split', () => {
    const allCash = order({
      payment_method: 'SPLIT',
      total_cents: 8000,
      payment_allocations: [
        { payment_method: 'CASH', amount_cents: 5000 },
        { payment_method: 'CASH', amount_cents: 3000 },
      ],
    });
    renderWithClient(<OrderReversalPanel order={allCash} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    expect(screen.queryByLabelText(CASH_LABEL)).not.toBeInTheDocument();
  });

  it('does not ask for a partial refund of an all-non-cash split (card + Pay-by-Link)', () => {
    const allNonCash = order({
      payment_method: 'SPLIT',
      total_cents: 8000,
      payment_allocations: [
        { payment_method: 'CARD', amount_cents: 5000 },
        { payment_method: 'PAY_BY_LINK', amount_cents: 3000, provider: 'YOCO' },
      ],
    });
    renderWithClient(<OrderReversalPanel order={allNonCash} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    expect(screen.queryByLabelText(CASH_LABEL)).not.toBeInTheDocument();
  });

  it('does not ask for a partial refund of a plain (non-split) cash order', () => {
    renderWithClient(<OrderReversalPanel order={order()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('10.00');
    expect(screen.queryByLabelText(CASH_LABEL)).not.toBeInTheDocument();
  });

  it('rejects a missing cash portion client-side without calling the backend', async () => {
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    expect(await screen.findByText(/enter how much of this refund is being returned in cash/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('rejects a cash portion larger than the refund amount without calling the backend', async () => {
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    // R45 is within the R50 cash allocation but above the R40 refund.
    fireEvent.change(screen.getByLabelText(CASH_LABEL), { target: { value: '45.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    expect(await screen.findByText(/cannot be more than the refund amount/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("rejects a cash portion larger than the order's cash allocation without calling the backend", async () => {
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('70.00');
    // R60 is within the R70 refund but above the R50 actually paid in cash.
    fireEvent.change(screen.getByLabelText(CASH_LABEL), { target: { value: '60.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    expect(await screen.findByText(/more than this order was paid in cash/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('sends cash_refund_cents (exact integer cents) when collected and in range', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      mixedSplit({ payment_status: 'PARTIALLY_REFUNDED', refund_amount_cents: 4000 })
    );
    const onDone = vi.fn();
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={onDone} />);
    openRefundAndSetAmount('40.00');
    fireEvent.change(screen.getByLabelText(CASH_LABEL), { target: { value: '20.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/orders/order-1/refund',
      expect.objectContaining({ amount_cents: 4000, cash_refund_cents: 2000 })
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('accepts 0 as an explicit "none of it is cash" answer', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      mixedSplit({ payment_status: 'PARTIALLY_REFUNDED', refund_amount_cents: 2000 })
    );
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('20.00');
    fireEvent.change(screen.getByLabelText(CASH_LABEL), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/business/pos/orders/order-1/refund',
      expect.objectContaining({ cash_refund_cents: 0 })
    );
  });

  it('translates a racing CASH_REFUND_PORTION_REQUIRED 422 into plain English and then shows the field', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(
        'This order was paid by a mix of cash and non-cash methods — specify cash_refund_cents for a partial refund so till cash-up stays accurate',
        422,
        'CASH_REFUND_PORTION_REQUIRED'
      )
    );
    // Stale local copy: looks like a plain card order, so no field up front.
    const stale = order({ payment_method: 'CARD', total_cents: 8000 });
    renderWithClient(<OrderReversalPanel order={stale} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    expect(screen.queryByLabelText(CASH_LABEL)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    expect(await screen.findByText('Please specify how much of this refund is being returned in cash.')).toBeInTheDocument();
    expect(screen.getByLabelText(CASH_LABEL)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(RAW_CODES);
  });

  it('translates a CASH_REFUND_PORTION_INVALID 422 without rendering the raw code or field name', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError(
        "cash_refund_cents cannot exceed the refund amount or the order's cash allocation",
        422,
        'CASH_REFUND_PORTION_INVALID'
      )
    );
    renderWithClient(<OrderReversalPanel order={mixedSplit()} role="OWNER" onDone={vi.fn()} />);
    openRefundAndSetAmount('40.00');
    fireEvent.change(screen.getByLabelText(CASH_LABEL), { target: { value: '10.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    expect(await screen.findByText(/cash part of this refund cannot be more than/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(RAW_CODES);
  });
});

describe('OrderReversalPanel — Pay-by-Link provider refund honesty', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('after a refund that leaves a Pay-by-Link refund PENDING_MANUAL, hands the fresh order back instead of closing', async () => {
    const refunded = withPblStatus(
      payByLinkSplit({ payment_status: 'REFUNDED', refund_amount_cents: 35000 }),
      'PENDING_MANUAL'
    );
    vi.mocked(apiClient.post).mockResolvedValue(refunded);
    const onDone = vi.fn();
    const onOrderUpdated = vi.fn();
    renderWithClient(
      <OrderReversalPanel order={payByLinkSplit()} role="OWNER" onDone={onDone} onOrderUpdated={onOrderUpdated} />
    );
    openRefundAndSetAmount();
    fireEvent.click(screen.getByRole('button', { name: /^refund$/i }));

    await waitFor(() => expect(onOrderUpdated).toHaveBeenCalledWith(refunded));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the explicit "still required" message and the confirm button while PENDING_MANUAL', () => {
    const refunded = withPblStatus(
      payByLinkSplit({ payment_status: 'REFUNDED', refund_amount_cents: 35000 }),
      'PENDING_MANUAL'
    );
    renderWithClient(<OrderReversalPanel order={refunded} role="OWNER" onDone={vi.fn()} />);
    // Compared on textContent: formatCents emits a non-breaking space
    // ("R 300,00" in en-ZA) that getByText's whitespace normaliser rewrites.
    expect(screen.getByTestId('provider-refund-pending').textContent).toContain(
      `Refund recorded in NextGen — ${formatCents(30000)} Pay-by-Link refund via Yoco still required.`
    );
    expect(screen.getByText(/nextgen has not returned this money/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark provider refund completed/i })).toBeInTheDocument();
  });

  it('does not claim an exact Pay-by-Link amount for a partial refund (the split is not knowable)', () => {
    const partial = withPblStatus(
      payByLinkSplit({ payment_status: 'PARTIALLY_REFUNDED', refund_amount_cents: 10000 }),
      'PENDING_MANUAL'
    );
    renderWithClient(<OrderReversalPanel order={partial} role="OWNER" onDone={vi.fn()} />);
    const pending = screen.getByTestId('provider-refund-pending');
    expect(pending.textContent).toMatch(/Pay-by-Link refund via Yoco still required \(the customer paid/);
    expect(pending.textContent).not.toContain(`${formatCents(30000)} Pay-by-Link refund`);
  });

  it('a voided order says "Void recorded in NextGen", not that the money went back', () => {
    const voided = withPblStatus(
      payByLinkSplit({ payment_status: 'VOIDED', refund_amount_cents: 35000 }),
      'PENDING_MANUAL'
    );
    renderWithClient(<OrderReversalPanel order={voided} role="OWNER" onDone={vi.fn()} />);
    expect(screen.getByText(/^Void recorded in NextGen/)).toBeInTheDocument();
  });

  it('asks for a confirming sentence before calling the confirm endpoint, then hands back the updated order', async () => {
    const pending = withPblStatus(
      payByLinkSplit({ payment_status: 'REFUNDED', refund_amount_cents: 35000 }),
      'PENDING_MANUAL'
    );
    const confirmed = withPblStatus(pending, 'CONFIRMED', '2026-10-11T09:00:00Z');
    vi.mocked(apiClient.post).mockResolvedValue(confirmed);
    const onOrderUpdated = vi.fn();
    renderWithClient(
      <OrderReversalPanel order={pending} role="OWNER" onDone={vi.fn()} onOrderUpdated={onOrderUpdated} />
    );

    fireEvent.click(screen.getByRole('button', { name: /mark provider refund completed/i }));
    expect(screen.getByText(/confirm you've actually refunded this via the yoco dashboard/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /yes, it's been refunded/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/business/pos/orders/order-1/confirm-provider-refund')
    );
    await waitFor(() => expect(onOrderUpdated).toHaveBeenCalledWith(confirmed));
  });

  it('cancelling the confirmation makes no call', () => {
    const pending = withPblStatus(
      payByLinkSplit({ payment_status: 'REFUNDED', refund_amount_cents: 35000 }),
      'PENDING_MANUAL'
    );
    renderWithClient(<OrderReversalPanel order={pending} role="OWNER" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /mark provider refund completed/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /mark provider refund completed/i })).toBeInTheDocument();
  });

  it('once CONFIRMED, shows it as resolved and hides the action button', () => {
    const confirmed = withPblStatus(
      payByLinkSplit({ payment_status: 'REFUNDED', refund_amount_cents: 35000 }),
      'CONFIRMED',
      '2026-10-11T09:00:00Z'
    );
    renderWithClient(<OrderReversalPanel order={confirmed} role="OWNER" onDone={vi.fn()} />);
    expect(screen.getByTestId('provider-refund-confirmed').textContent).toMatch(
      /^Pay-by-Link refund confirmed via Yoco on /
    );
    expect(screen.queryByRole('button', { name: /mark provider refund completed/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/still required/i)).not.toBeInTheDocument();
  });

  it('shows no provider-refund block for a refunded order with no Pay-by-Link allocation', () => {
    renderWithClient(
      <OrderReversalPanel
        order={mixedSplit({ payment_status: 'REFUNDED', refund_amount_cents: 8000 })}
        role="OWNER"
        onDone={vi.fn()}
      />
    );
    expect(screen.queryByTestId('provider-refund-pending')).not.toBeInTheDocument();
    expect(screen.queryByText(/pay-by-link/i)).not.toBeInTheDocument();
  });

  it('a NO_PENDING_PROVIDER_REFUND double-confirm is treated as already handled, not a scary error', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new ApiError('This order has no Pay-by-Link refund awaiting provider confirmation', 422, 'NO_PENDING_PROVIDER_REFUND')
    );
    const pending = withPblStatus(
      payByLinkSplit({ payment_status: 'REFUNDED', refund_amount_cents: 35000 }),
      'PENDING_MANUAL'
    );
    const onDone = vi.fn();
    renderWithClient(<OrderReversalPanel order={pending} role="OWNER" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /mark provider refund completed/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, it's been refunded/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(document.querySelector('.text-destructive')).toBeNull();
    expect(document.body.textContent).not.toMatch(RAW_CODES);
  });
});
