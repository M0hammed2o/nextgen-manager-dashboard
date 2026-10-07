import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { formatDateTime } from '@/lib/mappers';
import { getConnectionStatusMeta, PROVIDER_LABELS, MR_D_CARD_TITLE } from '@/lib/delivery';
import type { DeliveryConnectionResponse, DeliveryProvider } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PageHeader, PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { DeliverySubNav } from '@/components/delivery/DeliverySubNav';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Truck, Unplug } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PROVIDERS: DeliveryProvider[] = ['UBER_EATS', 'MR_D'];

function ConnectionCard({ connection }: { connection: DeliveryConnectionResponse }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const meta = getConnectionStatusMeta(connection);
  const isMrD = connection.provider === 'MR_D';

  const disableMutation = useMutation({
    mutationFn: () => apiClient.post<DeliveryConnectionResponse>(`/v1/business/delivery/connections/${connection.provider}/disable`),
    onSuccess: (res) => {
      queryClient.setQueryData<DeliveryConnectionResponse[]>(['delivery-connections'], (prev) =>
        prev ? prev.map((c) => (c.provider === res.provider ? res : c)) : prev
      );
      toast({ title: `${PROVIDER_LABELS[connection.provider]} connection disabled` });
    },
    onError: (err: Error) => toast({ title: 'Could not disable connection', description: err.message, variant: 'destructive' }),
  });

  const enableMutation = useMutation({
    mutationFn: () => apiClient.post<DeliveryConnectionResponse>(`/v1/business/delivery/connections/${connection.provider}/enable`),
    onSuccess: (res) => {
      queryClient.setQueryData<DeliveryConnectionResponse[]>(['delivery-connections'], (prev) =>
        prev ? prev.map((c) => (c.provider === res.provider ? res : c)) : prev
      );
      toast({
        title: 'Re-enable requested',
        description: 'This moves to "Attention required" until a human confirms it is genuinely still live — it does not go straight back to Connected.',
      });
    },
    onError: (err: Error) => toast({ title: 'Could not re-enable connection', description: err.message, variant: 'destructive' }),
  });

  return (
    <Card className={meta.badgeVariant === 'destructive' ? 'border-destructive/50' : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{isMrD ? MR_D_CARD_TITLE : PROVIDER_LABELS[connection.provider]}</CardTitle>
            <CardDescription className="mt-1">{meta.description}</CardDescription>
          </div>
          <StatusBadge label={meta.badgeLabel} variant={meta.badgeVariant} className="shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isMrD ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="text-muted-foreground mb-2">
              Mr D orders are reconciled by importing Mr D's own CSV export — the same flow already in use today.
            </p>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/delivery-orders">
                <ExternalLink className="w-3.5 h-3.5" /> Go to CSV import
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Mapped store</p>
                <p className="font-medium text-foreground">{connection.external_store_id ?? 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Environment</p>
                <p className="font-medium text-foreground capitalize">{connection.environment}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last order received</p>
                <p className="font-medium text-foreground">{connection.last_order_at ? formatDateTime(connection.last_order_at) : 'None yet'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last event received</p>
                <p className="font-medium text-foreground">{connection.last_webhook_at ? formatDateTime(connection.last_webhook_at) : 'None yet'}</p>
              </div>
            </div>

            {connection.needs_attention && connection.error_reason && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{connection.error_reason}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              {connection.status === 'DISABLED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => enableMutation.mutate()}
                  disabled={enableMutation.isPending}
                >
                  {enableMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Request re-enable
                </Button>
              ) : connection.status !== 'NOT_CONNECTED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => disableMutation.mutate()}
                  disabled={disableMutation.isPending}
                >
                  {disableMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                  Disable connection
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not connected yet — contact NextGen to start the Uber Eats provisioning process for this restaurant.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function DeliveryPlatformsPage() {
  const { data: settings, isLoading: settingsLoading } = useBusinessSettings();
  const deliveryEnabledConfirmed = settings?.delivery_platforms_enabled === true;

  const {
    data: connections, isLoading, isError, isFetching, refetch,
  } = useQuery({
    queryKey: ['delivery-connections'],
    queryFn: () => apiClient.get<DeliveryConnectionResponse[]>('/v1/business/delivery/connections'),
    enabled: deliveryEnabledConfirmed,
  });

  if (settingsLoading) return <PageSkeleton />;

  if (!deliveryEnabledConfirmed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Delivery Platforms" description="Uber Eats and Mr D integrations" />
        <EmptyState
          icon={<Truck className="w-10 h-10" />}
          title="Delivery marketplace isn't enabled for this business"
          description="Contact NextGen support to switch on the Delivery Marketplace module before connecting Uber Eats or using Mr D reconciliation."
        />
      </div>
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (isError || !connections) {
    return (
      <div className="space-y-6">
        <PageHeader title="Delivery Platforms" />
        <ErrorState message="Couldn't load your delivery connections." onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  // Backend always returns a row (real or synthesised) per known provider —
  // but build the display list off the fixed PROVIDERS order so a missing
  // response entry never silently disappears a provider's card.
  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  return (
    <div className="space-y-6">
      <PageHeader title="Delivery Platforms" description={<>Uber Eats and Mr D integrations. A connection being "on" here is never the same as it being live — check the status on each card.</>} />
      <DeliverySubNav />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => {
          const connection = byProvider.get(provider) ?? {
            id: null, provider, provider_label: PROVIDER_LABELS[provider], status: 'NOT_CONNECTED' as const,
            environment: 'production', external_store_id: null, store_status: null, last_status_synced_at: null,
            activated_at: null, disconnected_at: null, error_reason: null, needs_attention: false,
            last_webhook_at: null, last_order_at: null, created_at: null, updated_at: null,
          };
          return <ConnectionCard key={provider} connection={connection} />;
        })}
      </div>
    </div>
  );
}
