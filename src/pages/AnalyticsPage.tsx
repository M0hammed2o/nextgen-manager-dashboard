import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { mapAnalyticsSummary, formatCurrency, formatCents } from '@/lib/mappers';
import type { AnalyticsSummaryRaw, TopItem, DailyAnalytics } from '@/types/api';
import { StatCard, PageSkeleton } from '@/components/shared/PageComponents';
import { ShoppingCart, DollarSign, Users, Cpu } from 'lucide-react';
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

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const days = periodToDays(period);

  // Summary uses ?period= (today|7d|30d)
  const { data: rawSummary, isLoading } = useQuery({
    queryKey: ['analytics-summary', period],
    queryFn: () => apiClient.get<AnalyticsSummaryRaw>(`/v1/business/analytics/summary?period=${period}`),
  });

  // Top items uses ?days= (integer)
  const { data: topItems = [] } = useQuery({
    queryKey: ['analytics-top-items', days],
    queryFn: () => apiClient.get<TopItem[]>(`/v1/business/analytics/top-items?days=${days}`),
  });

  // Daily uses ?days= (integer)
  const { data: dailyData = [] } = useQuery({
    queryKey: ['analytics-daily', days],
    queryFn: () => apiClient.get<DailyAnalytics[]>(`/v1/business/analytics/daily?days=${days}`),
  });

  if (isLoading) return <PageSkeleton />;

  const summary = mapAnalyticsSummary(rawSummary);

  const chartData = dailyData.map(d => ({
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
          {chartData.length > 0 ? (
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
            <p className="text-muted-foreground text-sm text-center py-16">No data available</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Revenue Trend</h3>
          {chartData.length > 0 ? (
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
            <p className="text-muted-foreground text-sm text-center py-16">No data available</p>
          )}
        </div>
      </div>

      {/* Top Items */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold text-foreground mb-4">Top Selling Items</h3>
        {topItems.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No data available</p>
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
                  <tr key={i} className="border-b border-border/50">
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
    </div>
  );
}
