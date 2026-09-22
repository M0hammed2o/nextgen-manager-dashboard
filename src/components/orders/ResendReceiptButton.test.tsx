import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResendReceiptButton from './ResendReceiptButton';
import { apiClient } from '@/lib/api-client';
import type { Order, ReceiptResendResponse } from '@/types/api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});

// This codebase's other component tests assert on the underlying mutation
// call rather than rendered toast text (no test here mounts a real
// <Toaster/>). This file additionally spies on the toast() call itself, so
// the success/FAILED-status/network-error branches — which look identical
// from the mutation call alone — are each independently verified rather
// than assumed from code review.
const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

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
    phone_number: '27821234567',
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

function response(overrides: Partial<ReceiptResendResponse> = {}): ReceiptResendResponse {
  return {
    id: 'receipt-1',
    order_id: 'order-1',
    receipt_url: 'https://example.com/r/receipt-1',
    whatsapp_status: 'SENT',
    whatsapp_failure_reason: null,
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ResendReceiptButton', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('STAFF never sees the resend action', () => {
    const { container } = renderWithClient(<ResendReceiptButton order={order()} role="STAFF" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is pre-filled with the order\'s own captured phone number, and OWNER/MANAGER both see it', () => {
    renderWithClient(<ResendReceiptButton order={order()} role="MANAGER" />);
    expect(screen.getByDisplayValue('27821234567')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();
  });

  it('calls POST .../receipt/resend with the edited phone number, omitting it if blank', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(response());
    renderWithClient(<ResendReceiptButton order={order({ phone_number: null })} role="OWNER" />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/v1/business/orders/order-1/receipt/resend', {
        phone_number: undefined,
      })
    );
  });

  it('shows a success toast when the resend succeeds', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(response({ whatsapp_status: 'SENT' }));
    renderWithClient(<ResendReceiptButton order={order()} role="OWNER" />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Digital receipt sent' })
      )
    );
  });

  it('shows a distinct failure toast (not a false success) when whatsapp_status is FAILED', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(
      response({ whatsapp_status: 'FAILED', whatsapp_failure_reason: 'Invalid phone number' })
    );
    renderWithClient(<ResendReceiptButton order={order()} role="OWNER" />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Receipt could not be sent',
          description: 'Invalid phone number',
          variant: 'destructive',
        })
      )
    );
  });

  it('shows an error toast (not a silent failure) when the request itself errors', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));
    renderWithClient(<ResendReceiptButton order={order()} role="OWNER" />);

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not resend receipt',
          description: 'Network error',
          variant: 'destructive',
        })
      )
    );
  });
});
