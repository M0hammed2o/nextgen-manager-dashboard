import type { WhatsAppOrderUsage, WhatsAppUsageTier } from '@/types/api';

/**
 * Pure tier -> display mapping for the Dashboard's WhatsApp order usage card
 * (`WhatsAppUsageCard.tsx`). Kept dependency-free (no React, no fetch), same
 * reasoning as `account-alerts.ts`'s `buildAccountBanner` — the colour/label
 * decision should be unit-testable without mounting anything.
 *
 * Colour classes reuse this app's existing status-pill palette exactly as
 * Orders.tsx's `paymentColors`/`statusColors` do (bg-X/10 text-X
 * border-X/30 for the pill, solid bg-X for the progress bar fill) — no new
 * colours are introduced.
 */
export interface UsageTierDisplay {
  label: string;
  pillClassName: string;
  barClassName: string;
}

const TIER_DISPLAY: Record<WhatsAppUsageTier, UsageTierDisplay> = {
  ok: {
    label: 'On track',
    pillClassName: 'bg-success/10 text-[hsl(var(--success))] border border-success/30',
    barClassName: 'bg-[hsl(var(--success))]',
  },
  warning_80: {
    label: '80% used',
    pillClassName: 'bg-warning/10 text-warning border border-warning/30',
    barClassName: 'bg-warning',
  },
  warning_90: {
    label: '90% used',
    pillClassName: 'bg-warning/10 text-warning border border-warning/30',
    barClassName: 'bg-warning',
  },
  exceeded: {
    label: 'Allowance exceeded',
    pillClassName: 'bg-destructive/10 text-destructive border border-destructive/30',
    barClassName: 'bg-destructive',
  },
};

export function getUsageTierDisplay(tier: WhatsAppUsageTier): UsageTierDisplay {
  return TIER_DISPLAY[tier] ?? TIER_DISPLAY.ok;
}

/**
 * True only when the tenant actually has a configured WhatsApp order
 * allowance (`orders_allowance` non-null) — most tenants today don't, and
 * the usage card must render nothing extra for them rather than a broken
 * "X of null" display. Also false for a missing/undefined response (still
 * loading, or the fetch failed) so callers can use this as their single
 * "should I render the card at all" check.
 */
export function hasConfiguredAllowance(
  usage: Pick<WhatsAppOrderUsage, 'orders_allowance'> | null | undefined
): boolean {
  return usage != null && usage.orders_allowance !== null && usage.orders_allowance !== undefined;
}

/** Clamped 0-100 for the progress bar width — defensive against a backend
 * rounding error or a stale `pct_used` slightly over 100 after the last
 * order of the period. */
export function clampPct(pct: number | null | undefined): number {
  if (pct == null || Number.isNaN(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}
