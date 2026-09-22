import type { DeliveryConnectionResponse, DeliveryConnectionStatus, DeliveryProvider } from '@/types/api';

/**
 * Honesty-critical rendering logic for the delivery marketplace module —
 * pulled out of any component so it can be unit tested directly. See
 * docs/UBER_EATS_INTEGRATION_2026-10.md §4 for exactly what may/may not be
 * claimed to a restaurant, and shared/models/delivery.py's
 * DeliveryConnection.status comment for the backend's own wording rule this
 * mirrors: "the UI must never say 'Live Integration - Connected' unless
 * status == CONNECTED".
 */

export interface ConnectionStatusMeta {
  /** Short badge text. Always spells out "not live" in words when it isn't — never relies on colour alone. */
  badgeLabel: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  /** Full sentence a restaurant owner cannot misread as "orders are flowing". Always present. */
  description: string;
  /** True ONLY when real customer orders can arrive through this specific connection right now. */
  isLive: boolean;
}

const UBER_EATS_STATUS_META: Record<DeliveryConnectionStatus, ConnectionStatusMeta> = {
  NOT_CONNECTED: {
    badgeLabel: 'Not connected',
    badgeVariant: 'outline',
    description: 'Uber Eats has not been set up for this restaurant yet.',
    isLive: false,
  },
  SANDBOX: {
    badgeLabel: 'Sandbox — not live',
    badgeVariant: 'secondary',
    description:
      'This connection is in Uber\'s test (sandbox) environment. No real customer orders can arrive here — this is NOT live. Keep using CSV import/reconciliation for real Uber Eats sales.',
    isLive: false,
  },
  AWAITING_APPROVAL: {
    badgeLabel: 'Awaiting Uber approval — not live',
    badgeVariant: 'secondary',
    description:
      'NextGen is wired up to Uber Eats for this restaurant, but Uber has not yet approved it to receive real orders. Until Uber approves, orders will NOT arrive here — keep using CSV import/reconciliation.',
    isLive: false,
  },
  CONNECTED: {
    badgeLabel: 'Connected — live',
    badgeVariant: 'default',
    description: 'Live — Uber has approved this connection. Real customer orders can arrive here.',
    isLive: true,
  },
  ATTENTION_REQUIRED: {
    badgeLabel: 'Attention required — not receiving orders',
    badgeVariant: 'destructive',
    description:
      'This connection has a problem and is NOT reliably receiving orders right now. Check the error below and re-check the connection.',
    isLive: false,
  },
  DISABLED: {
    badgeLabel: 'Disabled',
    badgeVariant: 'outline',
    description: 'This connection has been switched off. No orders will arrive here until it is re-enabled and reviewed.',
    isLive: false,
  },
};

const MR_D_META: ConnectionStatusMeta = {
  badgeLabel: 'File reconciliation only',
  badgeVariant: 'outline',
  description:
    'No live Mr D order-injection integration exists (Mr D publishes no partner API — see docs/MRD_API_ACCESS_2026-10.md). Mr D orders are handled by importing Mr D\'s CSV export.',
  isLive: false,
};

/**
 * Single source of truth for how a connection's status may be described.
 * Mr D NEVER renders as connected/live, for ANY status value the backend
 * might return for it — defense in depth on top of the backend never
 * creating a live MR_D webhook/order-injection path at all (MrDAdapter is a
 * structurally-disabled stub; see DELIVERY_PLATFORM_ARCHITECTURE.md §1).
 */
export function getConnectionStatusMeta(
  connection: Pick<DeliveryConnectionResponse, 'status' | 'provider'>
): ConnectionStatusMeta {
  if (connection.provider === 'MR_D') return MR_D_META;
  return UBER_EATS_STATUS_META[connection.status] ?? UBER_EATS_STATUS_META.NOT_CONNECTED;
}

export const PROVIDER_LABELS: Record<DeliveryProvider, string> = {
  UBER_EATS: 'Uber Eats',
  MR_D: 'Mr D',
};

/** Mr D's card title is fixed per the product brief — never "Mr D" alone, never implying a live integration. */
export const MR_D_CARD_TITLE = 'Mr D File Reconciliation';

// ── Accept-deadline urgency (NEEDS_MAPPING queue) ───────────────────────────

export interface DeadlineUrgency {
  /** Milliseconds remaining; negative once past deadline. */
  msRemaining: number;
  /** True once at/past the deadline — Uber's own 11.5-minute clock (this platform's internal 600s watchdog fires first). */
  isPastDeadline: boolean;
  /** True inside the last 2 minutes — visually urgent, not yet expired. */
  isUrgent: boolean;
  /** "4m 12s left" / "Past deadline — will be auto-declined shortly" etc. */
  label: string;
}

/**
 * `accept_deadline_at` is this platform's own 600s watchdog deadline
 * (deliberately under Uber's real 690s/11.5-minute cutoff — see
 * shared/models/delivery.py). An order left unmapped past this point is
 * auto-denied by the watchdog cron, not silently dropped — see
 * DELIVERY_PLATFORM_ARCHITECTURE.md §5.
 */
export function getDeadlineUrgency(acceptDeadlineAt: string | null, now: number = Date.now()): DeadlineUrgency | null {
  if (!acceptDeadlineAt) return null;
  const deadlineMs = new Date(acceptDeadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) return null;
  const msRemaining = deadlineMs - now;
  const isPastDeadline = msRemaining <= 0;
  const isUrgent = !isPastDeadline && msRemaining <= 2 * 60 * 1000;

  if (isPastDeadline) {
    return {
      msRemaining,
      isPastDeadline,
      isUrgent: false,
      label: 'Past deadline — will be automatically declined to Uber shortly',
    };
  }

  const totalSeconds = Math.floor(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    msRemaining,
    isPastDeadline,
    isUrgent,
    label: `${minutes}m ${seconds.toString().padStart(2, '0')}s left before this order is auto-declined to Uber`,
  };
}
