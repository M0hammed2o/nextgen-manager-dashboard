import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { CheckCircle2, CloudOff, Info, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { formatCents, formatDateTime } from '@/lib/mappers';
import {
  OFFLINE_FLAGGED_KEY, OFFLINE_REASON_FILTERS, acknowledgePath, buildFlaggedPath,
  reasonChipLabel, reasonExplanation,
  type FlaggedOfflineOrder, type OfflineReason,
} from '@/lib/offline-review';
import type { StaffMember } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader, PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { useToast } from '@/hooks/use-toast';
import { LateUploadsSection } from '@/components/offline-review/LateUploadsSection';

const LIST_LIMIT = 100;

/**
 * Offline sales review. Sales rung up on a device with no signal and synced later are
 * flagged by the server when something about them can't be proven (no till open, stock
 * below zero, price changed, synced late...). Owners and managers read the list; ONLY the
 * owner can mark one reviewed (the API enforces it, the button here just mirrors it).
 * Marking reviewed changes no money and no stock.
 */
export default function OfflineSalesReviewPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState<OfflineReason | ''>('');
  const [showReviewed, setShowReviewed] = useState(false);
  const [target, setTarget] = useState<FlaggedOfflineOrder | null>(null);

  const path = buildFlaggedPath({ reason, includeAcknowledged: showReviewed, limit: LIST_LIMIT });
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [OFFLINE_FLAGGED_KEY, 'list', reason, showReviewed],
    queryFn: () => apiClient.get<FlaggedOfflineOrder[]>(path),
    // Keep the filter bar and rows on screen while a changed filter loads.
    placeholderData: keepPreviousData,
  });

  // Cashier names are a nicety: if the staff list fails the rows still render.
  const { data: staff } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiClient.get<StaffMember[]>('/v1/business/staff'),
    retry: false,
  });
  const nameOf = (id: string | null) => {
    if (!id) return 'Unknown';
    const m = staff?.find((s) => s.id === id);
    return m?.staff_name || m?.email || 'Staff member';
  };

  const ack = useMutation({
    mutationFn: (id: string) => apiClient.post<FlaggedOfflineOrder>(acknowledgePath(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [OFFLINE_FLAGGED_KEY] });
      toast({ title: 'Marked as reviewed' });
      setTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Could not mark as reviewed', description: err.message, variant: 'destructive' });
      setTarget(null);
    },
  });

  if (isLoading) return <PageSkeleton />;
  if (isError && !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offline sales review"
        description="Sales rung up without a connection that the system could not fully check"
      />

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Cash refunds or voids of offline sales with no till open, or that landed in an already-closed till,
          need the owner. Marking a sale reviewed only removes it from this list; it changes no money or stock.
        </p>
      </div>

      <LateUploadsSection />

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="offline-reason">Reason</Label>
          <Select value={reason || 'all'} onValueChange={(v) => setReason(v === 'all' ? '' : (v as OfflineReason))}>
            <SelectTrigger id="offline-reason" className="w-[240px]" aria-label="Filter by reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              {OFFLINE_REASON_FILTERS.map((r) => (
                <SelectItem key={r} value={r}>{reasonChipLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="offline-show-reviewed" checked={showReviewed} onCheckedChange={setShowReviewed} />
          <Label htmlFor="offline-show-reviewed">Show reviewed</Label>
        </div>
      </div>

      {!isOwner && (
        <p className="text-sm text-muted-foreground">
          Only the owner can mark a sale as reviewed. You can see the list so you can reconcile cash and stock.
        </p>
      )}

      {isError && (
        <p className="text-sm text-destructive" role="alert">
          Could not refresh the list; showing the last loaded data.{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-12 h-12" />}
          title={showReviewed || reason ? 'No matching offline sales' : 'Nothing to review'}
          description={
            showReviewed || reason
              ? 'No flagged offline sales match these filters.'
              : 'No offline sales are waiting for review.'
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-4 font-medium">Order</th>
                <th className="p-4 font-medium">Captured / synced</th>
                <th className="p-4 font-medium">Cashier</th>
                <th className="p-4 font-medium text-right">Total</th>
                <th className="p-4 font-medium">Why it was flagged</th>
                <th className="p-4 font-medium text-right">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0 align-top" data-testid="offline-row">
                  <td className="p-4 font-medium text-foreground">#{o.order_number}</td>
                  <td className="p-4 text-foreground">
                    <div>{formatDateTime(o.offline_captured_at)}</div>
                    <div className="text-xs text-muted-foreground">Synced {formatDateTime(o.offline_synced_at)}</div>
                  </td>
                  <td className="p-4 text-foreground">
                    <div>{nameOf(o.created_by_user_id)}</div>
                    {o.offline_synced_by_user_id && o.offline_synced_by_user_id !== o.created_by_user_id && (
                      <div className="text-xs text-muted-foreground">Synced by {nameOf(o.offline_synced_by_user_id)}</div>
                    )}
                  </td>
                  <td className="p-4 text-right text-foreground">{formatCents(o.total_cents)}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {o.review_reasons.map((r) => (
                        <Badge key={r} variant="outline" title={reasonExplanation(r, o)}>{reasonChipLabel(r)}</Badge>
                      ))}
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {o.review_reasons.map((r) => (
                        <li key={r}>{reasonExplanation(r, o)}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="p-4 text-right">
                    {o.offline_acknowledged_at ? (
                      <div className="text-xs text-muted-foreground">
                        Reviewed {formatDateTime(o.offline_acknowledged_at)}
                        <br />by {nameOf(o.offline_acknowledged_by_user_id)}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!isOwner || ack.isPending}
                        title={isOwner ? undefined : 'Only the owner can mark a sale as reviewed'}
                        onClick={() => setTarget(o)}
                      >
                        Mark reviewed
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= LIST_LIMIT && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CloudOff className="w-3.5 h-3.5" /> Showing the newest {LIST_LIMIT}. Mark some as reviewed to see older ones.
        </p>
      )}

      <AlertDialog open={!!target} onOpenChange={(open) => { if (!open && !ack.isPending) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this sale as reviewed?</AlertDialogTitle>
            <AlertDialogDescription>
              {target ? `Order #${target.order_number} (${formatCents(target.total_cents)}). ` : ''}
              This records that you checked it and removes it from the unreviewed list and the till-close
              count. It does not change any money or stock, and it cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ack.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={ack.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (target) ack.mutate(target.id);
              }}
            >
              {ack.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mark reviewed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
