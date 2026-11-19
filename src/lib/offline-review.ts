/**
 * Offline sales review (souk Phase 3b): helpers for the owner/manager screen that lists
 * offline-synced POS sales the backend flagged. Contract:
 * nextgen-backend docs/OFFLINE_POS_SYNC_CONTRACT.md section 5.
 */
import { formatCents } from '@/lib/mappers';

export interface FlaggedOfflineOrder {
  id: string;
  order_number: string;
  total_cents: number;
  payment_method: string | null;
  offline_captured_at: string | null;
  offline_synced_at: string | null;
  created_by_user_id: string | null;
  offline_synced_by_user_id: string | null;
  till_session_id: string | null;
  offline_unattributed: boolean;
  offline_late_to_closed_till: boolean;
  offline_stock_shortfall: boolean;
  offline_client_total_cents: number | null;
  offline_price_variance_cents: number | null;
  review_reasons: string[];
  offline_acknowledged_at: string | null;
  offline_acknowledged_by_user_id: string | null;
}

/** The exact `reason` filter values the backend accepts (omit = any flag). */
export const OFFLINE_REASON_FILTERS = [
  'shortfall',
  'variance',
  'unattributed',
  'late_till',
  'capture_day_unpaid_at_sync',
  'late_sync',
  'cashier_differs_from_syncer',
] as const;
export type OfflineReason = (typeof OFFLINE_REASON_FILTERS)[number];

/** Short chip label per reason. */
const CHIP_LABELS: Record<OfflineReason, string> = {
  shortfall: 'Stock below zero',
  variance: 'Price differed',
  unattributed: 'No till open',
  late_till: 'Till already closed',
  capture_day_unpaid_at_sync: 'Unpaid day at sync',
  late_sync: 'Synced late',
  cashier_differs_from_syncer: 'Cashier differs',
};

function humanise(reason: string): string {
  const s = reason.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Needs review';
}

export function reasonChipLabel(reason: string): string {
  return (CHIP_LABELS as Record<string, string>)[reason] ?? humanise(reason);
}

/** Plain-language explanation of a reason, for the row detail / tooltip. */
export function reasonExplanation(
  reason: string,
  order?: Pick<FlaggedOfflineOrder, 'offline_price_variance_cents'>,
): string {
  switch (reason) {
    case 'capture_day_unpaid_at_sync':
      return 'Synced on a day this stall had not paid for.';
    case 'cashier_differs_from_syncer':
      return 'Cashier differs from the person who synced.';
    case 'variance': {
      const v = order?.offline_price_variance_cents;
      if (v == null) return 'Price at the till differed from the system price.';
      return `Price at the till differed from the system price by ${formatCents(Math.abs(v))}.`;
    }
    case 'unattributed':
      return 'No till session was open at the time of sale.';
    case 'shortfall':
      return 'Stock went below zero.';
    case 'late_till':
      return "This sale belongs to a till session that had already been closed, so that session's cash-up does not include it.";
    case 'late_sync':
      return 'Synced more than 12 hours after the sale was made.';
    default:
      return `Flagged for review (${humanise(reason)}).`;
  }
}

export interface FlaggedQueryOptions {
  reason?: OfflineReason | '' | null;
  includeAcknowledged?: boolean;
  since?: string | null;
  limit?: number;
}

/** Builds the list URL; defaults (any reason, hide reviewed) are left off the query string. */
export function buildFlaggedPath(opts: FlaggedQueryOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.reason) params.set('reason', opts.reason);
  if (opts.since) params.set('since', opts.since);
  if (opts.includeAcknowledged) params.set('include_acknowledged', 'true');
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return `/v1/business/pos/offline-orders/flagged${qs ? `?${qs}` : ''}`;
}

export function acknowledgePath(orderId: string): string {
  return `/v1/business/pos/offline-orders/${encodeURIComponent(orderId)}/acknowledge`;
}

/** Query-key prefix; acknowledging invalidates everything under it (list + badge). */
export const OFFLINE_FLAGGED_KEY = 'offline-flagged';
