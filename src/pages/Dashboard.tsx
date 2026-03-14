import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { mapAnalyticsSummary, formatCurrency } from '@/lib/mappers';
import type { AnalyticsSummaryRaw, Order, PaginatedResponse } from '@/types/api';
import { StatCard, PageSkeleton, EmptyState } from '@/components/shared/PageComponents';
import {
  ShoppingCart, CheckCircle, XCircle, DollarSign,
  MessageSquare, Cpu, Users, ArrowRight, Plus, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/mappers';
import { useState } from 'react';

type Period = 'today' | '7d' | '30d';

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('today');

  const { data: rawSummary, isLoading } = useQuery({
    queryKey: ['analytics-summary', period],
    queryFn: () => apiClient.get<AnalyticsSummaryRaw>(`/v1/business/analytics/summary?period=${period}`),
    refetchInterval: 30000,
  });

  const { data: liveOrdersRes } = useQuery({
    queryKey: ['live-orders'],
    queryFn: () => apiClient.get<PaginatedResponse<Order>>('/v1/business/orders?live=true'),
    refetchInterval: 15000,
  });

  if (isLoading) return <PageSkeleton />;

  const summary = mapAnalyticsSummary(rawSummary);
  const orders = liveOrdersRes?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Business overview at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', '7d', '30d'] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : '30 Days'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orders" value={summary.totalOrders} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard label="Revenue" value={formatCurrency(summary.revenue)} icon={<DollarSign className="w-5 h-5" />} />
        <StatCard label="Completed" value={summary.completedOrders} icon={<CheckCircle className="w-5 h-5" />} />
        <StatCard label="Cancelled" value={summary.cancelledOrders} icon={<XCircle className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Messages" value={summary.totalMessages} icon={<MessageSquare className="w-5 h-5" />} />
        <StatCard label="LLM Calls" value={summary.llmCalls} icon={<Cpu className="w-5 h-5" />} />
        <StatCard label="LLM Cost" value={formatCurrency(summary.llmCost)} icon={<DollarSign className="w-5 h-5" />} />
        <StatCard label="Unique Customers" value={summary.uniqueCustomers} icon={<Users className="w-5 h-5" />} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/orders">
                <ShoppingCart className="w-5 h-5" />
                <span className="text-xs">View Orders</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/orders?create=true">
                <Plus className="w-5 h-5" />
                <span className="text-xs">New Order</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/menu">
                <ArrowRight className="w-5 h-5" />
                <span className="text-xs">Manage Menu</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" asChild>
              <Link to="/analytics">
                <ArrowRight className="w-5 h-5" />
                <span className="text-xs">Analytics</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Live Orders */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Active Orders</h3>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders" className="text-primary gap-1">View All <ArrowRight className="w-3.5 h-3.5" /></Link>
            </Button>
          </div>
          {orders.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-10 h-10" />}
              title="No active orders"
              description="New orders will appear here in real-time"
            />
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      #{order.order_number ?? order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.customer_name ?? 'Walk-in'} · {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
