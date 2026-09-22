import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { formatDateTime, formatCents } from '@/lib/mappers';
import { getDeadlineUrgency, PROVIDER_LABELS } from '@/lib/delivery';
import type { DeliveryOrderResponse, DeliveryOrderStatus, DeliveryDenyReasonCode, DeliveryUnresolvedItem } from '@/types/api';
import { DELIVERY_DENY_REASON_CODES } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { DeliverySubNav } from '@/components/delivery/DeliverySubNav';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShoppingBag, Truck, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABEL: Record<DeliveryOrderStatus, string> = {
  RECEIVED: 'Received',
  FETCHING: 'Fetching details',
  NEEDS_MAPPING: 'Needs mapping',
  READY_TO_ACCEPT: 'Ready to accept',
  ACCEPTED: 'Accepted',
  DENIED: 'Denied',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

const STATUS_VARIANT: Record<DeliveryOrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  RECEIVED: 'secondary',
  FETCHING: 'secondary',
  NEEDS_MAPPING: 'destructive',
  READY_TO_ACCEPT: 'secondary',
  ACCEPTED: 'default',
  DENIED: 'outline',
  FULFILLED: 'default',
  CANCELLED: 'outline',
  FAILED: 'destructive',
};

// 'OPEN'/'ALL' are UI-only sentinels resolved to the real backend `status`
// query value (or omitted entirely for 'ALL') below — Radix Select doesn't
// accept an empty-string item value, and the backend's `status` filter is a
// literal comma-separated status list, not a keyword.
const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'OPEN', label: 'Open (needs attention)' },
  { value: 'NEEDS_MAPPING', label: 'Needs mapping only' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DENIED,CANCELLED,FAILED', label: 'Denied / cancelled / failed' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'ALL', label: 'All orders' },
];
const OPEN_STATUS_FILTER = 'RECEIVED,FETCHING,NEEDS_MAPPING,READY_TO_ACCEPT';

/** Re-renders urgency labels periodically without a per-second re-render storm across a whole list. */
function useTick(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function UnresolvedItemsList({ items, provider, onMapItem }: {
  items: DeliveryUnresolvedItem[];
  provider: string;
  onMapItem: (item: DeliveryUnresolvedItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1.5">
      <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> Unmapped items — order cannot be processed until these are mapped
      </p>
      {items.map((item, i) => (
        <div key={item.external_id ?? `${provider}-${i}`} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-foreground">{item.external_text ?? item.external_id ?? 'Unknown item'}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onMapItem(item)}>
            Map this item
          </Button>
        </div>
      ))}
    </div>
  );
}

function DenyDialog({ order, open, onClose }: { order: DeliveryOrderResponse | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState<DeliveryDenyReasonCode | ''>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) { setReasonCode(''); setNotes(''); }
  }, [open, order?.id]);

  const denyMutation = useMutation({
    mutationFn: () => {
      if (!order || !reasonCode) throw new Error('Choose a reason first');
      return apiClient.post<DeliveryOrderResponse>(`/v1/business/delivery/orders/${order.id}/deny`, {
        reason_code: reasonCode,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      toast({ title: 'Order denied' });
      onClose();
    },
    onError: (err: Error) => toast({ title: 'Could not deny order', description: err.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deny order {order?.external_order_id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason (sent to Uber)</Label>
            <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as DeliveryDenyReasonCode)}>
              <SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger>
              <SelectContent>
                {DELIVERY_DENY_REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>{code.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (internal, optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this order is being denied" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reasonCode || denyMutation.isPending}
            onClick={() => denyMutation.mutate()}
          >
            {denyMutation.isPending ? 'Denying…' : 'Deny order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderCard({ order, onDeny }: { order: DeliveryOrderResponse; onDeny: (o: DeliveryOrderResponse) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const urgency = getDeadlineUrgency(order.accept_deadline_at);

  const acceptMutation = useMutation({
    mutationFn: () => apiClient.post<DeliveryOrderResponse>(`/v1/business/delivery/orders/${order.id}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      toast({ title: 'Order re-queued for processing' });
    },
    onError: (err: Error) => toast({ title: 'Could not accept order', description: err.message, variant: 'destructive' }),
  });

  const canAccept = order.status === 'NEEDS_MAPPING';
  const canDeny = ['RECEIVED', 'FETCHING', 'NEEDS_MAPPING', 'READY_TO_ACCEPT'].includes(order.status);

  const handleMapItem = (item: DeliveryUnresolvedItem) => {
    const params = new URLSearchParams({
      platform: order.provider,
      external_id: item.external_id ?? '',
      external_text: item.external_text ?? '',
    });
    navigate(`/settings/delivery/mappings?${params.toString()}`);
  };

  return (
    <Card className={order.status === 'NEEDS_MAPPING' ? 'border-destructive/50' : undefined}>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground flex items-center gap-2">
              {PROVIDER_LABELS[order.provider]} · {order.external_order_id}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.placed_at ? `Placed ${formatDateTime(order.placed_at)}` : `Received ${formatDateTime(order.created_at)}`}
              {order.gross_cents != null && ` · ${formatCents(order.gross_cents)}`}
            </p>
          </div>
          <StatusBadge label={STATUS_LABEL[order.status]} variant={STATUS_VARIANT[order.status]} />
        </div>

        {order.status === 'NEEDS_MAPPING' && urgency && (
          <div className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1.5 ${
            urgency.isPastDeadline || urgency.isUrgent
              ? 'bg-destructive/10 text-destructive'
              : 'bg-warning/10 text-warning'
          }`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {urgency.label}
          </div>
        )}

        {order.unresolved_items && order.unresolved_items.length > 0 && (
          <UnresolvedItemsList items={order.unresolved_items} provider={order.provider} onMapItem={handleMapItem} />
        )}

        {order.status === 'DENIED' && (
          <p className="text-xs text-muted-foreground">
            Denied {formatDateTime(order.denied_at)}{order.deny_reason_code ? ` — ${order.deny_reason_code.replace(/_/g, ' ')}` : ''}
            {order.deny_reason_text ? `: ${order.deny_reason_text}` : ''}
          </p>
        )}
        {order.status === 'FAILED' && order.failure_reason && (
          <p className="text-xs text-destructive">{order.failure_reason}</p>
        )}

        {(canAccept || canDeny) && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {canAccept && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Retry now
              </Button>
            )}
            {canDeny && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onDeny(order)}>
                <XCircle className="w-3.5 h-3.5" /> Deny
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DeliveryOrdersPage() {
  useTick(15000);
  const { data: settings, isLoading: settingsLoading } = useBusinessSettings();
  const deliveryEnabledConfirmed = settings?.delivery_platforms_enabled === true;

  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [denyTarget, setDenyTarget] = useState<DeliveryOrderResponse | null>(null);

  const effectiveStatus =
    statusFilter === 'OPEN' ? OPEN_STATUS_FILTER : statusFilter === 'ALL' ? '' : statusFilter;

  const {
    data, isLoading, isError, isFetching, refetch,
  } = useQuery({
    queryKey: ['delivery-orders', effectiveStatus],
    queryFn: () =>
      apiClient.get<{ orders: DeliveryOrderResponse[]; total: number }>(
        `/v1/business/delivery/orders${effectiveStatus ? `?status=${encodeURIComponent(effectiveStatus)}` : ''}`
      ),
    enabled: deliveryEnabledConfirmed,
    refetchInterval: 20000,
  });

  if (settingsLoading) return <PageSkeleton />;

  if (!deliveryEnabledConfirmed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Delivery Marketplace Orders</h1>
        </div>
        <EmptyState
          icon={<Truck className="w-10 h-10" />}
          title="Delivery marketplace isn't enabled for this business"
          description="Contact NextGen support to switch on the Delivery Marketplace module."
        />
      </div>
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Delivery Marketplace Orders</h1></div>
        <ErrorState message="Couldn't load delivery orders." onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  const needsMappingCount = data.orders.filter((o) => o.status === 'NEEDS_MAPPING').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Delivery Marketplace Orders</h1>
          <p className="text-sm text-muted-foreground">Live Uber Eats / Mr D API orders — separate from the CSV importer.</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DeliverySubNav />

      {needsMappingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {needsMappingCount} order{needsMappingCount === 1 ? '' : 's'} need{needsMappingCount === 1 ? 's' : ''} menu
          mapping right now — each will be automatically declined to the provider if not resolved before its deadline.
        </div>
      )}

      {data.orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="w-10 h-10" />}
          title="No delivery orders here"
          description="Orders from a live Uber Eats or Mr D API connection will appear here as they arrive."
        />
      ) : (
        <div className="space-y-3">
          {data.orders.map((order) => (
            <OrderCard key={order.id} order={order} onDeny={setDenyTarget} />
          ))}
        </div>
      )}

      <DenyDialog order={denyTarget} open={!!denyTarget} onClose={() => setDenyTarget(null)} />
    </div>
  );
}
