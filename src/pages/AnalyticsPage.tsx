import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { isAdvancedAnalyticsEntitled, isAdvancedAnalyticsNotEnabledError } from '@/lib/entitlements';
import { mapAnalyticsSummary, formatCurrency, formatCents } from '@/lib/mappers';
import type {
  AnalyticsSummaryRaw, TopItem, DailyAnalytics, AverageOrderValue, PaymentMethodsReport, ChannelsReport,
} from '@/types/api';
import { StatCard, PageSkeleton, EmptyState, ErrorState, InlineErrorBanner } from '@/components/shared/PageComponents';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShoppingCart, DollarSign, Users, Cpu, BarChart3, TrendingUp, Wallet, CreditCard, PieChart, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

type Period = 'today' | '7d' | '30d';

/** Convert UI period to integer days for top-items and daily endpoints */
function periodToDays(period: Period): number {
  switch (period) {
    case 'today': return 1;
    case '7d': return 7;
    case '30d': return 30;
  }
}

function formatPaymentMethod(method: string): string {
  if (!method) return 'Unknown';
  return method
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const days = periodToDays(period);

  // Core Analytics — available on every plan, including POS-only tenants
  // (see nav-items.ts). Summary uses ?period= (today|7d|30d).
  const {
    data: rawSummary, isLoading, isError, error, refetch, isFetching,
  } = useQuery({
    queryKey: ['analytics-summary', period],
    queryFn: () => apiClient.get<AnalyticsSummaryRaw>(`/v1/business/analytics/summary?period=${period}`),
  });

  // Top items uses ?days= (integer)
  const {
    data: topItems, isError: topItemsError, refetch: refetchTopItems, isFetching: topItemsFetching,
  } = useQuery({
    queryKey: ['analytics-top-items', days],
    queryFn: () => apiClient.get<TopItem[]>(`/v1/business/analytics/top-items?days=${days}`),
  });

  // Daily uses ?days= (integer)
  const {
    data: dailyData, isError: dailyError, refetch: refetchDaily, isFetching: dailyFetching,
  } = useQuery({
    queryKey: ['analytics-daily', days],
    queryFn: () => apiClient.get<DailyAnalytics[]>(`/v1/business/analytics/daily?days=${days}`),
  });

  if (isLoading) return <PageSkeleton />;

  // Was previously `isLoading`-only: a failed summary request silently fell
  // through to rendering mapAnalyticsSummary(undefined) as an all-zero
  // dashboard, indistinguishable from a real quiet day. Show a real error
  // state instead, matching every other data-driven page in this app.
  if (isError || !rawSummary) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <ErrorState
          message={(error as Error | undefined)?.message ?? "Couldn't load your analytics summary."}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </div>
    );
  }

  const summary = mapAnalyticsSummary(rawSummary);

  const chartData = (dailyData ?? []).map(d => ({
    day: d.day,
    orders: d.orders ?? 0,
    revenue: (d.revenue_cents ?? 0) / 100,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground">Business performance insights</p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', '7d', '30d'] as Period[]).map((p) => (
            <Button key={p} variant={period === p ? 'default' : 'outline'} size="sm" onClick={() => setPeriod(p)}>
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : '30 Days'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orders" value={summary.totalOrders} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard label="Revenue" value={formatCurrency(summary.revenue)} icon={<DollarSign className="w-5 h-5" />} />
        <StatCard label="Unique Customers" value={summary.uniqueCustomers} icon={<Users className="w-5 h-5" />} />
        <StatCard label="LLM Calls" value={summary.llmCalls} icon={<Cpu className="w-5 h-5" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Daily Orders</h3>
          {dailyError ? (
            <InlineErrorBanner message="Couldn't load the daily orders chart." onRetry={() => refetchDaily()} />
          ) : dailyFetching && !dailyData ? (
            <Skeleton className="h-[260px] w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <BarChart3 className="w-8 h-8" />
              <p className="text-sm">No orders in this period yet</p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Revenue Trend</h3>
          {dailyError ? (
            <InlineErrorBanner message="Couldn't load the revenue trend chart." onRetry={() => refetchDaily()} />
          ) : dailyFetching && !dailyData ? (
            <Skeleton className="h-[260px] w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <TrendingUp className="w-8 h-8" />
              <p className="text-sm">No revenue in this period yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Items */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold text-foreground mb-4">Top Selling Items</h3>
        {topItemsError ? (
          <InlineErrorBanner message="Couldn't load top-selling items." onRetry={() => refetchTopItems()} />
        ) : topItemsFetching && !topItems ? (
          <Skeleton className="h-40 w-full" />
        ) : !topItems || topItems.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="w-10 h-10" />}
            title="No items sold yet"
            description="Once orders come in for this period, your best-selling items will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, i) => (
                  <tr key={item.name} className="border-b border-border/50">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium text-foreground">{item.name}</td>
                    <td className="p-3 text-right text-foreground">{item.quantity}</td>
                    <td className="p-3 text-right text-foreground">{formatCents(item.revenue_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdvancedAnalyticsSection period={period} days={days} />
    </div>
  );
}

// ── Advanced Analytics (NextGen Complete and above — migration 0047) ────────
// Gated by Business.advanced_analytics_enabled. Hidden navigation/sections
// are convenience only; backend/app/analytics/revenue.py::
// require_advanced_analytics_enabled is the real enforcement (409
// ADVANCED_ANALYTICS_NOT_ENABLED) — see src/lib/entitlements.ts.

function AdvancedAnalyticsSection({ period, days }: { period: Period; days: number }) {
  const { data: settings, isLoading: settingsLoading } = useBusinessSettings();
  const entitled = isAdvancedAnalyticsEntitled(settings);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Advanced Analytics</h2>
        <p className="text-sm text-muted-foreground">Deeper reporting available on the NextGen Complete plan.</p>
      </div>

      {settingsLoading ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !entitled ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <EmptyState
            icon={<Lock className="w-10 h-10" />}
            title="Advanced Analytics isn't enabled for your account"
            description="Average order value, payment method split, and delivery channel breakdown are part of the NextGen Complete plan. Contact NextGen to add this module."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AverageOrderValueCard period={period} />
          <PaymentMethodsCard days={days} />
          <div className="lg:col-span-2">
            <ChannelBreakdownCard days={days} />
          </div>
        </div>
      )}
    </div>
  );
}

function AverageOrderValueCard({ period }: { period: Period }) {
  const { data, isLoading, isFetching, error, isError, refetch } = useQuery({
    queryKey: ['analytics-aov', period],
    queryFn: () => apiClient.get<AverageOrderValue>(`/v1/business/analytics/average-order-value?period=${period}`),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Wallet className="w-4 h-4" /> Average Order Value
      </h3>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : isAdvancedAnalyticsNotEnabledError(error) ? (
        <EmptyState
          icon={<Lock className="w-8 h-8" />}
          title="Not enabled"
          description="Advanced Analytics isn't enabled for your account."
        />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load average order value." onRetry={() => refetch()} isRetrying={isFetching} />
      ) : (
        <>
          <p className="text-3xl font-bold text-foreground">{formatCents(data.average_order_value_cents)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Across {data.completed_orders} completed order{data.completed_orders === 1 ? '' : 's'}
          </p>
        </>
      )}
    </div>
  );
}

function PaymentMethodsCard({ days }: { days: number }) {
  const { data, isLoading, isFetching, error, isError, refetch } = useQuery({
    queryKey: ['analytics-payment-methods', days],
    queryFn: () => apiClient.get<PaymentMethodsReport>(`/v1/business/analytics/payment-methods?days=${days}`),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <CreditCard className="w-4 h-4" /> Payment Methods
      </h3>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : isAdvancedAnalyticsNotEnabledError(error) ? (
        <EmptyState
          icon={<Lock className="w-8 h-8" />}
          title="Not enabled"
          description="Advanced Analytics isn't enabled for your account."
        />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load the payment method breakdown." onRetry={() => refetch()} isRetrying={isFetching} />
      ) : data.methods.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-8 h-8" />}
          title="No payments yet"
          description="Once sales come in for this period, the cash/card split will show up here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 font-medium text-muted-foreground">Method</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Orders</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.methods.map((m) => (
                <tr key={m.payment_method} className="border-b border-border/50">
                  <td className="p-2 font-medium text-foreground">{formatPaymentMethod(m.payment_method)}</td>
                  <td className="p-2 text-right text-foreground">{m.order_count}</td>
                  <td className="p-2 text-right text-foreground">{formatCents(m.net_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChannelBreakdownCard({ days }: { days: number }) {
  const { data, isLoading, isFetching, error, isError, refetch } = useQuery({
    queryKey: ['analytics-channels', days],
    queryFn: () => apiClient.get<ChannelsReport>(`/v1/business/external-orders/channels?days=${days}`),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <PieChart className="w-4 h-4" /> Delivery Channel Breakdown
      </h3>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : isAdvancedAnalyticsNotEnabledError(error) ? (
        <EmptyState
          icon={<Lock className="w-8 h-8" />}
          title="Not enabled"
          description="Advanced Analytics isn't enabled for your account."
        />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load the channel breakdown." onRetry={() => refetch()} isRetrying={isFetching} />
      ) : data.channels.length === 0 ? (
        <EmptyState
          icon={<PieChart className="w-8 h-8" />}
          title="No sales yet"
          description="Once orders come in for this period, sales by channel (till, WhatsApp, Uber Eats, Mr D, etc.) will show up here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 font-medium text-muted-foreground">Channel</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Orders</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Gross</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Refunds</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((c) => (
                <tr key={c.source} className="border-b border-border/50">
                  <td className="p-2 font-medium text-foreground">
                    {c.label}
                    {c.is_external && (
                      <span className="ml-2 text-xs text-muted-foreground">(marketplace)</span>
                    )}
                  </td>
                  <td className="p-2 text-right text-foreground">{c.order_count}</td>
                  <td className="p-2 text-right text-foreground">{formatCents(c.gross_cents)}</td>
                  <td className="p-2 text-right text-foreground">{formatCents(c.refunds_cents)}</td>
                  <td className="p-2 text-right text-foreground">{formatCents(c.net_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
