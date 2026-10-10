import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/mappers';
import type { WastageEntry, WastageReasonOption, WastageStatus } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader, PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { InventorySubNav } from '@/components/inventory/InventorySubNav';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash, CheckCircle2, XCircle, ImageOff, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Wastage review queue — sign off (or reject) the losses staff have logged.
 *
 * VERIFIED AGAINST routes_wastage.py, 2026-09-23 (see WORKLOG.md "NextGen
 * Operations gap-closure"): the previous version of this file carried a
 * comment claiming the approval queue never populates and that create
 * hard-rejects any over-threshold STAFF entry. Neither is true of the
 * current backend — an over-threshold STAFF entry is saved PENDING (never
 * rejected at creation), and both approve and reject are real, working
 * endpoints. That stale claim has been removed rather than left to mislead
 * the next reader.
 *
 * The stock deduction posts at SUBMISSION time, not at approval time — a
 * wasted item is already physically gone the moment it's logged. Approving
 * therefore never re-posts a movement (idempotent sign-off only); rejecting
 * posts exactly one reversal, enforced by a database constraint rather than
 * application bookkeeping (see routes_wastage.py `reject_wastage`
 * docstring). This page never does its own optimistic stock math and never
 * lets a double-click look like two separate actions — every action button
 * disables itself while its own mutation is in flight.
 */

type TabKey = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

function matchesTab(status: WastageStatus, tab: TabKey): boolean {
  if (tab === 'ALL') return true;
  if (tab === 'PENDING') return status === 'PENDING_APPROVAL';
  if (tab === 'APPROVED') return status === 'APPROVED';
  return status === 'REJECTED';
}

export default function WastagePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('PENDING');
  const [rejectTarget, setRejectTarget] = useState<WastageEntry | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveTarget, setApproveTarget] = useState<WastageEntry | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const { data: entries, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['wastage'],
    queryFn: () => apiClient.get<WastageEntry[]>('/v1/business/wastage?limit=200'),
  });

  const { data: reasons } = useQuery({
    queryKey: ['wastage-reasons'],
    queryFn: () => apiClient.get<WastageReasonOption[]>('/v1/business/wastage/reasons'),
  });

  const reasonLabel = (value: string) => reasons?.find((r) => r.value === value)?.label ?? value;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wastage'] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post<WastageEntry>(`/v1/business/wastage/${id}/approve`),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Wastage approved' });
      setApproveTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Could not approve', description: err.message, variant: 'destructive' });
      setApproveTarget(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post<WastageEntry>(`/v1/business/wastage/${id}/reject`, { reason }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Wastage rejected', description: 'The stock deduction has been reversed.' });
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (err: Error) =>
      toast({ title: 'Could not reject', description: err.message, variant: 'destructive' }),
  });

  const rows = useMemo(
    () => (entries ?? []).filter((e) => matchesTab(e.status, tab)),
    [entries, tab]
  );

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: (entries ?? []).length };
    for (const e of entries ?? []) {
      if (e.status === 'PENDING_APPROVAL') c.PENDING += 1;
      else if (e.status === 'APPROVED') c.APPROVED += 1;
      else if (e.status === 'REJECTED') c.REJECTED += 1;
    }
    return c;
  }, [entries]);

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const apiError = error as ApiError;
    if (apiError.code === 'INVENTORY_NOT_ENABLED' || apiError.message?.toLowerCase().includes('not enabled')) {
      return (
        <div className="space-y-4">
          <PageHeader title="Wastage" />
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <PageHeader title="Wastage" />
        <ErrorState message={apiError.message} onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventorySubNav />
      <PageHeader title="Wastage" description="Losses staff have logged — dropped, burnt, spoiled, or given away. Review and sign off the ones that need it." />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(t.key)}
          >
            {t.label} ({counts[t.key]})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{TABS.find((t) => t.key === tab)?.label} entries</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center">
              <Trash className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">
                {tab === 'PENDING' ? 'Nothing awaiting approval' : 'No entries here'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Staff log wastage from the till as it happens — it will show up here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Ingredient</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Logged by</th>
                    <th className="px-4 py-3">Evidence</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.occurred_at)}
                      </td>
                      <td className="px-4 py-3 font-medium">{entry.ingredient_name}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{entry.quantity_display}</td>
                      <td className="px-4 py-3">
                        {reasonLabel(entry.reason)}
                        {entry.note && (
                          <span className="block text-xs text-muted-foreground">{entry.note}</span>
                        )}
                        {entry.related_order_id && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Receipt className="h-3 w-3" /> Order #{entry.related_order_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.logged_by_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {entry.photo_url ? (
                          <button onClick={() => setPhotoPreview(entry.photo_url)} className="block">
                            <img
                              src={entry.photo_url}
                              alt="Wastage evidence"
                              className="h-10 w-10 rounded object-cover ring-1 ring-border hover:ring-primary"
                            />
                          </button>
                        ) : (
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(entry.value_cents / 100)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={entry.status} />
                        {entry.status === 'REJECTED' && entry.rejection_reason && (
                          <span className="mt-1 block max-w-[14rem] text-xs text-muted-foreground">
                            {entry.rejected_by_name ? `${entry.rejected_by_name}: ` : ''}{entry.rejection_reason}
                          </span>
                        )}
                        {entry.status === 'APPROVED' && entry.approved_by_name && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            by {entry.approved_by_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {entry.status === 'PENDING_APPROVAL' && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setApproveTarget(entry)}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { setRejectTarget(entry); setRejectReason(''); }}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this wastage entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget?.ingredient_name} — {approveTarget?.quantity_display} ({formatCurrency((approveTarget?.value_cents ?? 0) / 100)}).
              The stock deduction already happened when it was logged; this only signs off that it's
              genuine. It doesn't touch stock again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => approveTarget && approveMutation.mutate(approveTarget.id)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject this wastage entry?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rejectTarget?.ingredient_name} — {rejectTarget?.quantity_display}. This puts the stock
              back (a single reversal movement) and marks the entry rejected — it cannot be approved
              afterwards.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason (required)</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why this entry is being rejected"
                rows={3}
                maxLength={500}
              />
              {rejectReason.trim().length > 0 && rejectReason.trim().length < 3 && (
                <p className="text-xs text-destructive">At least 3 characters.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
                disabled={rejectMutation.isPending || rejectReason.trim().length < 3}
              >
                {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!photoPreview} onOpenChange={(open) => { if (!open) setPhotoPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Evidence photo</DialogTitle></DialogHeader>
          {photoPreview && <img src={photoPreview} alt="Wastage evidence, full size" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: WastageStatus }) {
  const styles: Record<WastageStatus, string> = {
    PENDING_APPROVAL: 'bg-warning/10 text-warning',
    APPROVED: 'bg-success/10 text-[hsl(var(--success))]',
    REJECTED: 'bg-destructive/10 text-destructive',
    NOT_REQUIRED: 'bg-muted text-muted-foreground',
  };
  const labels: Record<WastageStatus, string> = {
    PENDING_APPROVAL: 'Pending approval',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    NOT_REQUIRED: 'No approval needed',
  };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
