import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useAccountStatus } from '@/hooks/use-account-status';
import { formatCents, formatDate } from '@/lib/mappers';
import type {
  BillingStatus, CheckoutSessionResponse, PortalSessionResponse, SelfServicePlan,
  AccountStatusValue, CommercialInvoice,
} from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { CreditCard, Download, ExternalLink, FileText, Loader2, ShieldAlert } from 'lucide-react';
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

// backend/app/billing/account_status.py's compute_account_status() derived
// status — distinct from the self-service BillingStatus.billing_status
// above (different value set: PAYMENT_DUE/OVERDUE/EXPIRED don't exist in
// the Stripe/PayFast set, and vice versa for PAST_DUE).
const ACCOUNT_STATUS_VARIANT: Record<AccountStatusValue, 'default' | 'destructive' | 'secondary'> = {
  ACTIVE: 'default',
  TRIAL: 'secondary',
  PAYMENT_DUE: 'secondary',
  OVERDUE: 'destructive',
  EXPIRED: 'destructive',
  SUSPENDED: 'destructive',
  CANCELLED: 'destructive',
};

/**
 * "Plan & invoices" section of the Billing page — visible to both OWNER and
 * MANAGER (the derived-status endpoint allows both), while the invoices
 * table itself stays OWNER-only (backend enforces this too; hiding it here
 * is a UX courtesy, not the security boundary).
 */
export function PlanAndInvoicesSection({ isOwner }: { isOwner: boolean }) {
  const { toast } = useToast();
  const { data: account, isLoading, isError, refetch, isFetching } = useAccountStatus();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const {
    data: invoices,
    isLoading: invoicesLoading,
    isError: invoicesError,
    refetch: refetchInvoices,
    isFetching: invoicesFetching,
  } = useQuery({
    queryKey: ['commercial-invoices'],
    queryFn: () => apiClient.get<CommercialInvoice[]>('/v1/business/billing/commercial-invoices'),
    enabled: isOwner,
  });

  const handleDownload = async (invoice: CommercialInvoice) => {
    setDownloadingId(invoice.id);
    try {
      const blob = await apiClient.getBlob(`/v1/business/billing/commercial-invoices/${invoice.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoice_number || 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Could not download invoice',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (isError || !account) {
    return <ErrorState message="Couldn't load your account status." onRetry={() => refetch()} isRetrying={isFetching} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="w-4 h-4" /> Plan &amp; invoices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-semibold">{account.plan}</span>
          <Badge variant={ACCOUNT_STATUS_VARIANT[account.status] ?? 'secondary'}>{account.status}</Badge>
        </div>

        {account.status === 'TRIAL' && (
          <p className="text-sm text-muted-foreground">
            Trial started {formatDate(account.trial_started_at)}, ends {formatDate(account.trial_ends_at)}
            {account.trial_days_remaining !== null && ` — ${account.trial_days_remaining} day(s) remaining`}.
          </p>
        )}

        {!isOwner && (
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Only the account owner can view invoices.
          </p>
        )}

        {isOwner && (
          <div className="pt-2 border-t border-border space-y-3">
            <h4 className="text-sm font-medium text-foreground">Invoices</h4>
            {invoicesLoading ? (
              <PageSkeleton />
            ) : invoicesError ? (
              <ErrorState
                message="Couldn't load your invoices."
                onRetry={() => refetchInvoices()}
                isRetrying={invoicesFetching}
              />
            ) : !invoices || invoices.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-10 h-10" />}
                title="No invoices yet"
                description="Invoices issued to your account will appear here."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.invoice_number || '—'}</TableCell>
                      <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                      <TableCell>{formatDate(inv.due_date)}</TableCell>
                      <TableCell>{formatCents(inv.total_cents)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{inv.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv.id}
                          className="gap-1.5"
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

  if (isOwner && isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">
          {isOwner ? 'Manage your NextGen Intelligence subscription' : 'Your NextGen Intelligence account status'}
        </p>
      </div>

      <PlanAndInvoicesSection isOwner={isOwner} />

      {isOwner && (
        <>
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
        </>
      )}
    </div>
  );
}
