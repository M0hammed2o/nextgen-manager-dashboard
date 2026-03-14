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
