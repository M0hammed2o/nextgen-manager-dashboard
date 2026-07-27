import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import type { BillingStatus, CheckoutSessionResponse, PortalSessionResponse, SelfServicePlan } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { CreditCard, ExternalLink, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PLANS: { id: SelfServicePlan; name: string; blurb: string }[] = [
  { id: 'STARTER', name: 'Starter', blurb: 'WhatsApp ordering, menu, orders, basic reporting.' },
  { id: 'GROWTH', name: 'Growth', blurb: 'Everything in Starter, plus POS and deeper analytics.' },
];

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary'> = {
  ACTIVE: 'default',
  TRIAL: 'secondary',
  PAST_DUE: 'destructive',
  SUSPENDED: 'destructive',
  CANCELLED: 'destructive',
};

export default function BillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = user?.role === 'OWNER';

  const { data: status, isLoading } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => apiClient.get<BillingStatus>('/v1/business/billing/status'),
    enabled: isOwner,
  });

  const checkoutMutation = useMutation({
    mutationFn: (plan: SelfServicePlan) =>
      apiClient.post<CheckoutSessionResponse>('/v1/business/billing/checkout-session', { plan }),
    onSuccess: (res) => {
      window.location.href = res.checkout_url;
    },
    onError: () => {
      toast({ title: 'Could not start checkout', variant: 'destructive' });
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => apiClient.post<PortalSessionResponse>('/v1/business/billing/portal-session'),
    onSuccess: (res) => {
      if (res.portal_url) {
        window.location.href = res.portal_url;
      } else {
        toast({ title: 'Self-service management is not available for your billing provider — contact support.' });
      }
    },
    onError: () => {
      toast({ title: 'Could not open billing portal', variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.post<{ success: boolean; status: string; error: string | null }>('/v1/business/billing/cancel'),
    onSuccess: (res) => {
      toast({ title: res.success ? 'Subscription cancelled' : `Could not cancel: ${res.error ?? res.status}` });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not cancel subscription', description: err.message, variant: 'destructive' });
    },
  });

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <Card>
          <CardContent className="pt-6 flex items-start gap-3 text-muted-foreground">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>Only the business owner can manage billing and subscription settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your NextGen Intelligence subscription</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" /> Current plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{status?.plan ?? 'STARTER'}</span>
            <Badge variant={STATUS_VARIANT[status?.billing_status ?? 'TRIAL'] ?? 'secondary'}>
              {status?.billing_status ?? 'TRIAL'}
            </Badge>
          </div>

          {status?.has_subscription ? (
            <div className="flex flex-wrap gap-2">
              {status.supports_self_service_portal ? (
                <Button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} className="gap-1.5">
                  {portalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Manage subscription
                </Button>
              ) : (
                <Button variant="outline" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Cancel subscription
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active subscription yet — choose a plan below to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {!status?.has_subscription && (
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle className="text-base">{plan.name}</CardTitle>
                <CardDescription>{plan.blurb}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full gap-1.5"
                  onClick={() => checkoutMutation.mutate(plan.id)}
                  disabled={checkoutMutation.isPending}
                >
                  {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Subscribe to {plan.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Need Enterprise pricing or a custom contract? Contact NextGen Intelligence directly.
      </p>
    </div>
  );
}
