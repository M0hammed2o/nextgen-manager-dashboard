import type { Order, PaymentAllocation } from '@/types/api';

/**
 * Split-payment refund helpers shared by OrderReversalPanel and the Orders
 * page's payment-breakdown block.
 *
 * NextGen records a till-native refund but never calls Yoco/PayFast to return
 * a Pay-by-Link payment (backend routes_pos.py
 * _flag_pay_by_link_provider_refund_pending). These helpers exist so the UI
 * can say that plainly instead of implying the money went back automatically.
 */

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'the payment provider';
  const p = provider.trim().toUpperCase();
  if (p === 'YOCO') return 'Yoco';
  if (p === 'PAYFAST') return 'PayFast';
  return provider;
}

export function payByLinkAllocations(order: Order): PaymentAllocation[] {
  return (order.payment_allocations ?? []).filter((a) => a.payment_method === 'PAY_BY_LINK');
}

export function pendingProviderRefunds(order: Order): PaymentAllocation[] {
  return payByLinkAllocations(order).filter((a) => a.provider_refund_status === 'PENDING_MANUAL');
}

export function confirmedProviderRefunds(order: Order): PaymentAllocation[] {
  return payByLinkAllocations(order).filter((a) => a.provider_refund_status === 'CONFIRMED');
}

export function cashAllocatedCents(order: Order): number {
  return (order.payment_allocations ?? [])
    .filter((a) => a.payment_method === 'CASH')
    .reduce((sum, a) => sum + a.amount_cents, 0);
}

/**
 * True only when a partial refund of this order is genuinely ambiguous about
 * how much is cash: a SPLIT order whose allocations include at least one CASH
 * and at least one non-CASH entry. Mirrors the backend's own condition in
 * refund_pos_order (cash_allocated > 0 and non_cash_allocated > 0).
 */
export function isMixedCashSplit(order: Order): boolean {
  if (order.payment_method !== 'SPLIT') return false;
  const allocs = order.payment_allocations ?? [];
  const cash = allocs.filter((a) => a.payment_method === 'CASH').reduce((s, a) => s + a.amount_cents, 0);
  const nonCash = allocs.filter((a) => a.payment_method !== 'CASH').reduce((s, a) => s + a.amount_cents, 0);
  return cash > 0 && nonCash > 0;
}

/**
 * How much of a Pay-by-Link allocation must be refunded at the provider, when
 * that is actually knowable from the order. A full refund/void returns every
 * allocation in full, so the answer is the allocation amount. For a partial
 * refund the backend does not return the cash/non-cash split, and with card +
 * Pay-by-Link both present it is not derivable — so return null rather than
 * guess a number the manager might act on.
 */
export function knownProviderRefundCents(order: Order, alloc: PaymentAllocation): number | null {
  const fullyReversed = order.payment_status === 'VOIDED' || order.payment_status === 'REFUNDED';
  return fullyReversed ? alloc.amount_cents : null;
}
