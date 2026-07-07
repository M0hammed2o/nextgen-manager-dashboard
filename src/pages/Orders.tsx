import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Order, PaymentStatus, CreateOrderRequest, PaginatedResponse } from '@/types/api';
import { formatCents, formatDateTime } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageSkeleton, EmptyState } from '@/components/shared/PageComponents';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { ShoppingCart, Plus, Eye, Loader2, Trash2, Bell } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

// ── Status colour maps ───────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  NEW: 'bg-warning/10 text-warning',
  ACCEPTED: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-accent text-accent-foreground',
  READY: 'bg-success/10 text-[hsl(var(--success))]',
  COLLECTED: 'bg-muted text-muted-foreground',
  DELIVERED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const paymentColors: Record<PaymentStatus, string> = {
  UNPAID: 'bg-destructive/10 text-destructive border border-destructive/30',
  PENDING: 'bg-warning/10 text-warning border border-warning/30',
  PAID: 'bg-success/10 text-[hsl(var(--success))] border border-success/30',
  FAILED: 'bg-destructive/10 text-destructive border border-destructive/30',
  REFUNDED: 'bg-muted text-muted-foreground border border-border',
  CASH_ON_COLLECTION: 'bg-muted text-muted-foreground border border-border',
};

const paymentLabels: Record<PaymentStatus, string> = {
  UNPAID: 'Payment Required',
  PENDING: 'Awaiting Payment',
  PAID: 'Paid',
  FAILED: 'Payment Failed',
  REFUNDED: 'Refunded',
  CASH_ON_COLLECTION: 'Cash',
};

// ── Audio alert (plays a short beep for new orders) ──────────────────────────

function playNewOrderSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // AudioContext not available (e.g. in tests)
  }
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('live');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const sseRef = useRef<EventSource | null>(null);

  // ── Data fetching (5 s poll as fallback) ──────────────────────────────────
  const { data: ordersRes, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter === 'live') params.set('live', 'true');
      else if (statusFilter !== 'all') params.set('status', statusFilter);
      const qs = params.toString();
      return apiClient.get<PaginatedResponse<Order>>(`/v1/business/orders${qs ? `?${qs}` : ''}`);
    },
    refetchInterval: 5000,
  });

  const orders = ordersRes?.data ?? [];

  // ── SSE subscription for real-time push ───────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    // EventSource doesn't natively support auth headers; use URL param as fallback
    // Most deployments proxy the auth via cookie or a token query param.
    // If your setup doesn't support query param auth, the 5 s poll above is the fallback.
    const url = `/v1/business/orders/live/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.addEventListener('order_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'order_created' || data.type === 'new_order') {
          playNewOrderSound();
          setNewOrderCount(n => n + 1);
          toast({
            title: `🛎 New Order #${data.order_number}`,
            description: data.items_summary ?? '',
          });
        }
        // Invalidate to pick up the new/updated order
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      // SSE failed — polling at 5 s is the fallback, no need to log
      es.close();
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status, reason }: { orderId: string; status: string; reason?: string }) =>
      apiClient.post(`/v1/business/orders/${orderId}/status`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Order status updated' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ orderId, payment_status }: { orderId: string; payment_status: PaymentStatus }) =>
      apiClient.patch(`/v1/business/orders/${orderId}/payment`, { payment_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Payment status updated' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              Orders
              {newOrderCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground animate-pulse">
                  <Bell className="w-3 h-3" /> {newOrderCount} new
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{orders.length} orders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {newOrderCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setNewOrderCount(0)}>
              Clear alerts
            </Button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">Live Orders</SelectItem>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="ACCEPTED">Accepted</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="COLLECTED">Collected</SelectItem>
              <SelectItem value="DELIVERED">Delivered</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gap-1.5"><Plus className="w-4 h-4" /> New Order</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Manual Order</DialogTitle></DialogHeader>
              <CreateOrderForm onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="w-12 h-12" />}
          title="No orders found"
          description="Orders will appear here when customers place them"
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-4 font-medium text-muted-foreground">Order</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Payment</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Total</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Date</th>
                  <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${order.status === 'NEW' ? 'bg-warning/5' : ''}`}
                  >
                    <td className="p-4 font-medium text-foreground">#{order.order_number}</td>
                    <td className="p-4 text-foreground">{order.customer_name ?? 'Walk-in'}</td>
                    <td className="p-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[order.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${paymentColors[order.payment_status ?? 'PENDING']}`}>
                          {paymentLabels[order.payment_status ?? 'PENDING']}
                        </span>
                        {(order.payment_status === 'PENDING') && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-success hover:text-success"
                              onClick={() => updatePaymentMutation.mutate({ orderId: order.id, payment_status: 'PAID' })}
                            >
                              Mark Paid
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => updatePaymentMutation.mutate({ orderId: order.id, payment_status: 'CASH_ON_COLLECTION' })}
                            >
                              Cash
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-foreground font-medium">{formatCents(order.total_cents)}</td>
                    <td className="p-4 text-muted-foreground">{formatDateTime(order.created_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {!['COLLECTED', 'DELIVERED', 'CANCELLED'].includes(order.status) && (
                          <Select
                            onValueChange={(val) => updateStatusMutation.mutate({ orderId: order.id, status: val })}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue placeholder="Update" />
                            </SelectTrigger>
                            <SelectContent>
                              {order.status === 'NEW' && <SelectItem value="ACCEPTED">Accept</SelectItem>}
                              {order.status === 'ACCEPTED' && <SelectItem value="IN_PROGRESS">Preparing</SelectItem>}
                              {order.status === 'IN_PROGRESS' && <SelectItem value="READY">Ready</SelectItem>}
                              {order.status === 'READY' && <SelectItem value="COLLECTED">Collected</SelectItem>}
                              {order.status === 'READY' && <SelectItem value="DELIVERED">Delivered</SelectItem>}
                              <SelectItem value="CANCELLED">Cancel</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> <span className="text-foreground font-medium">{selectedOrder.customer_name ?? 'Walk-in'}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span className="text-foreground">{selectedOrder.phone_number ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Mode:</span> <span className="text-foreground">{selectedOrder.order_mode}</span></div>
                <div><span className="text-muted-foreground">Source:</span> <span className="text-foreground">{selectedOrder.source}</span></div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[selectedOrder.status] ?? ''}`}>{selectedOrder.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment:</span>{' '}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${paymentColors[selectedOrder.payment_status ?? 'PENDING']}`}>
                    {paymentLabels[selectedOrder.payment_status ?? 'PENDING']}
                  </span>
                </div>
              </div>
              {selectedOrder.delivery_address && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <span className="text-xs text-muted-foreground">Delivery Address:</span>{' '}
                  <span className="text-foreground">{selectedOrder.delivery_address}</span>
                </div>
              )}
              <div>
                <h4 className="font-medium text-foreground mb-2">Items</h4>
                <div className="space-y-2">
                  {(selectedOrder.items ?? []).map((item, i) => (
                    <div key={item.id || i} className="flex justify-between items-start text-sm p-2 rounded bg-muted/30">
                      <div>
                        <span className="text-foreground">{item.quantity}× {item.name_snapshot}</span>
                        {item.add_ons_snapshot?.map((ao) => (
                          <p key={ao.name} className="text-xs text-muted-foreground mt-0.5">
                            ✦ {ao.name} +{formatCents(ao.price_cents * (ao.quantity ?? 1))}
                          </p>
                        ))}
                        {item.selected_options_snapshot?.filter(o => o.price_delta_cents !== 0).map((o) => (
                          <p key={o.option} className="text-xs text-muted-foreground mt-0.5">
                            ✦ {o.option} {o.price_delta_cents > 0 ? "+" : ""}{formatCents(o.price_delta_cents)}
                          </p>
                        ))}
                        {item.special_instructions && (
                          <p className="text-xs text-muted-foreground italic mt-0.5">{item.special_instructions}</p>
                        )}
                      </div>
                      <span className="text-foreground font-medium">{formatCents(item.line_total_cents)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCents(selectedOrder.subtotal_cents)}</span></div>
                {(selectedOrder.delivery_fee_cents ?? 0) > 0 && (
                  <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span>{formatCents(selectedOrder.delivery_fee_cents)}</span></div>
                )}
                <div className="flex justify-between font-semibold text-foreground text-base"><span>Total</span><span>{formatCents(selectedOrder.total_cents)}</span></div>
              </div>
              {selectedOrder.payment_status === 'PENDING' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      updatePaymentMutation.mutate({ orderId: selectedOrder.id, payment_status: 'PAID' });
                      setSelectedOrder(null);
                    }}
                  >
                    Mark as Paid
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      updatePaymentMutation.mutate({ orderId: selectedOrder.id, payment_status: 'CASH_ON_COLLECTION' });
                      setSelectedOrder(null);
                    }}
                  >
                    Cash on Collection
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Create Order Form ────────────────────────────────────────────────────────

interface LineItem { name: string; qty: number; priceRand: string; }

function CreateOrderForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderMode, setOrderMode] = useState('PICKUP');
  const [items, setItems] = useState<LineItem[]>([{ name: '', qty: 1, priceRand: '' }]);

  const addItem = useCallback(() => setItems(prev => [...prev, { name: '', qty: 1, priceRand: '' }]), []);
  const removeItem = useCallback((idx: number) => setItems(prev => prev.filter((_, i) => i !== idx)), []);
  const updateItem = useCallback((idx: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: CreateOrderRequest) => apiClient.post('/v1/business/orders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Order created' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(i => i.name.trim());
    if (validItems.length === 0) {
      toast({ title: 'At least one item is required', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      order_mode: orderMode,
      source: 'MANUAL',
      items: validItems.map(i => ({ name: i.name, qty: i.qty, price_cents: Math.round(parseFloat(i.priceRand || '0') * 100) })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Customer Name</Label>
          <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Order Mode</Label>
        <Select value={orderMode} onValueChange={setOrderMode}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PICKUP">Pickup</SelectItem>
            <SelectItem value="DELIVERY">Delivery</SelectItem>
            <SelectItem value="DINE_IN">Dine In</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Items</Label>
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Input placeholder="Item name" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} />
            </div>
            <div className="w-16 space-y-1">
              <Input type="number" min={1} value={item.qty} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 1)} />
            </div>
            <div className="w-28 space-y-1">
              <Input type="number" step="0.01" min={0} placeholder="Price (R)" value={item.priceRand} onChange={e => updateItem(idx, 'priceRand', e.target.value)} />
            </div>
            {items.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(idx)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Item
        </Button>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Order'}
        </Button>
      </div>
    </form>
  );
}
