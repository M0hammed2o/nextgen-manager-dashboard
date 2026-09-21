import type { AnalyticsSummaryRaw, AnalyticsSummary } from '@/types/api';

export function mapAnalyticsSummary(raw: AnalyticsSummaryRaw | null | undefined): AnalyticsSummary {
  return {
    totalOrders: raw?.total_orders ?? 0,
    completedOrders: raw?.completed_orders ?? 0,
    cancelledOrders: raw?.cancelled_orders ?? 0,
    revenue: centsToAmount(raw?.revenue_cents),
    totalMessages: raw?.total_messages ?? 0,
    llmCalls: raw?.llm_calls ?? 0,
    llmCost: centsToAmount(raw?.llm_cost_cents),
    uniqueCustomers: raw?.unique_customers ?? 0,
  };
}

export function centsToAmount(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
}

export function formatCents(cents: number | null | undefined): string {
  return formatCurrency(centsToAmount(cents));
}

/**
 * Parse a rand amount typed by a human (e.g. a refund box) into an exact
 * integer number of cents, WITHOUT ever multiplying a float by 100 — that
 * route is how e.g. 19.99 * 100 can land on 1998.9999999999998 in JS. Splits
 * the string on its decimal point instead and does the arithmetic on
 * integers only.
 *
 * Returns null for anything that isn't a plain non-negative rand amount with
 * at most 2 decimal places (empty string, negative, more than 2 decimals,
 * letters, multiple dots, etc.) so the caller can reject it outright rather
 * than silently coercing it to 0.
 */
export function parseRandsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [randsPart, centsPart = ''] = trimmed.split('.');
  const centsDigits = (centsPart + '00').slice(0, 2);
  const rands = parseInt(randsPart, 10);
  const cents = parseInt(centsDigits, 10);
  if (!Number.isFinite(rands) || !Number.isFinite(cents)) return null;
  return rands * 100 + cents;
}

/** The inverse of parseRandsToCents — cents (an exact integer) to a rand
 * string suitable for pre-filling an amount input, e.g. 12345 -> "123.45".
 * Integer division/remainder only, so it round-trips exactly. */
export function centsToRandsInput(cents: number): string {
  const safe = Math.max(0, Math.trunc(cents));
  const rands = Math.floor(safe / 100);
  const remainder = safe % 100;
  return `${rands}.${String(remainder).padStart(2, '0')}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
