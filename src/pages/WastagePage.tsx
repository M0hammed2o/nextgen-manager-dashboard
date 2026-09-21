import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/mappers';
import type { WastageEntry, WastageReasonOption } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, Trash } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Wastage review — sign off the losses staff have already logged.
 *
 * IMPORTANT CONTRACT NOTE (verified against routes_wastage.py, 2026-09-21):
 * the backend's create endpoint (`POST /business/wastage`) hard-rejects
 * (403 WASTAGE_APPROVAL_REQUIRED) any STAFF-created entry that crosses the
 * business's wastage_approval_threshold_cents, and auto-approves (sets
 * approved_by_user_id to the creator) any OWNER/MANAGER-created entry that
 * crosses it — there is no code path today that leaves an entry sitting in
 * an actual "logged, awaiting manager approval" state. This screen is still
 * a correct, useful consumer of the real list/approve endpoints (and the
 * Approve action here does work, immediately, against the real backend, if
 * a row without approved_by_user_id ever does appear), but don't expect a
 * queue to build up under the current backend logic — that's a backend
 * behaviour gap, not a frontend bug, and out of scope to fix from here
 * (read-only backend reference for this task). See KNOWN_BUGS.md.
 *
 * Also: WastageResponse has no "logged by" field (only an opaque
 * approved_by_user_id, once approved) — so unlike Stock/Stocktake's
 * history, this table cannot show who recorded each entry.
 */
export default function WastagePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entries, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['wastage'],
    queryFn: () => apiClient.get<WastageEntry[]>('/v1/business/wastage?limit=200'),
  });

  const { data: reasons } = useQuery({
    queryKey: ['wastage-reasons'],
    queryFn: () => apiClient.get<WastageReasonOption[]>('/v1/business/wastage/reasons'),
  });

  const reasonLabel = (value: string) => reasons?.find((r) => r.value === value)?.label ?? value;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post<WastageEntry>(`/v1/business/wastage/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wastage'] });
      toast({ title: 'Wastage approved' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not approve', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.toLowerCase().includes('not enabled') || message.includes('INVENTORY_NOT_ENABLED')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Wastage</h1>
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Wastage</h1>
        <p className="text-sm text-destructive">Could not load wastage: {message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    );
  }

  const rows = entries ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wastage</h1>
        <p className="text-sm text-muted-foreground">
          Losses staff have logged — dropped, burnt, spoiled, or given away. Approve the ones that need sign-off.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center">
              <Trash className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">No wastage logged yet</p>
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
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
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
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(entry.value_cents / 100)}
                      </td>
                      <td className="px-4 py-3">
                        {entry.approved_by_user_id ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-[hsl(var(--success))]">
                            Approved
                          </span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            Not yet approved
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!entry.approved_by_user_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate(entry.id)}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Approve
                          </Button>
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
    </div>
  );
}
