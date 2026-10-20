import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { WhatsAppOrderUsage } from '@/types/api';
import { getUsageTierDisplay, hasConfiguredAllowance, clampPct } from '@/lib/whatsapp-usage';
import { MessageCircle } from 'lucide-react';

/**
 * WhatsApp-only subscription support (2026-10): shows the tenant's WhatsApp
 * order allowance usage (orders_used / orders_allowance, colour-coded by
 * `tier`) when GET /v1/business/usage/whatsapp-orders returns a configured
 * allowance. Renders nothing while loading, on error, or when the tenant
 * has no allowance configured (the majority of tenants today) — same
 * "renders nothing on failure" rule as `AccountStatusBanner.tsx`: this is a
 * supplementary card, not the Dashboard's primary content, so a usage-fetch
 * glitch must never block or clutter the rest of the page, and "no
 * allowance configured" must never render a broken "X of null" display.
 *
 * CONTRACT ASSUMPTION: backend branch feat/whatsapp-only-subscription had
 * not landed when this was written — see types/api.ts's WhatsAppOrderUsage
 * comment for the exact shape assumed.
 */
export function WhatsAppUsageCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['whatsapp-order-usage'],
    queryFn: () => apiClient.get<WhatsAppOrderUsage>('/v1/business/usage/whatsapp-orders'),
  });

  if (isLoading || isError || !hasConfiguredAllowance(data)) return null;

  const usage = data as WhatsAppOrderUsage;
  const tierDisplay = getUsageTierDisplay(usage.tier);

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="w-4 h-4" /> WhatsApp Order Usage
        </h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${tierDisplay.pillClassName}`}>
          {tierDisplay.label}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        {usage.orders_used} of {usage.orders_allowance} orders used this period
        {usage.orders_remaining != null && usage.orders_remaining >= 0 && (
          <> &middot; {usage.orders_remaining} remaining</>
        )}
      </p>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={clampPct(usage.pct_used)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full transition-all ${tierDisplay.barClassName}`}
          style={{ width: `${clampPct(usage.pct_used)}%` }}
        />
      </div>
    </div>
  );
}
