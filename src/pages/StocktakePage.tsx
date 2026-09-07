import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Stocktake, StocktakeSummary } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, ClipboardCheck, Lock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const COUNT_HINT: Record<string, string> = {
  UNIT_COUNT: 'count items',
  WEIGHT: 'weigh',
  VOLUME: 'measure',
};

/**
 * Stocktake and variance — the screen that answers the three questions the
 * client actually bought this system for:
 *
 *   "According to our sales, how much stock should we have?"  -> expected
 *   "How much do we actually have?"                           -> counted
 *   "Where is the difference coming from?"                    -> the terms
 *
 * Lines come back from the API already ranked by absolute rand exposure, so
 * the thing that is costing money is at the top rather than something a
 * manager has to hunt for.
 */
export default function StocktakePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<string, string>>({});

  const { data: current, isLoading, error } = useQuery({
    queryKey: ['stocktake-current'],
    queryFn: () => apiClient.get<Stocktake | null>('/v1/business/stocktake/current'),
  });

  const { data: history } = useQuery({
    queryKey: ['stocktake-history'],
    queryFn: () => apiClient.get<StocktakeSummary[]>('/v1/business/stocktake'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stocktake-current'] });
    queryClient.invalidateQueries({ queryKey: ['stocktake-history'] });
    queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
  };

  const openMutation = useMutation({
    mutationFn: () => apiClient.post<Stocktake>('/v1/business/stocktake/open', {}),
    onSuccess: () => { refresh(); toast({ title: 'Stocktake started' }); },
    onError: (e: Error) => toast({ title: 'Could not start', description: e.message, variant: 'destructive' }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.post<Stocktake>(`/v1/business/stocktake/${current?.id}/counts`, {
        lines: Object.entries(counts)
          .filter(([, v]) => v !== '')
          .map(([ingredient_id, quantity]) => ({ ingredient_id, quantity })),
      }),
    onSuccess: () => { refresh(); toast({ title: 'Counts saved' }); },
    onError: (e: Error) => toast({ title: 'Could not save', description: e.message, variant: 'destructive' }),
  });

  const completeMutation = useMutation({
    mutationFn: () => apiClient.post<Stocktake>(`/v1/business/stocktake/${current?.id}/complete`, {}),
    onSuccess: () => { refresh(); toast({ title: 'Count complete', description: 'Review the variance, then approve.' }); },
    onError: (e: Error) => toast({ title: 'Could not complete', description: e.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: () => apiClient.post<Stocktake>(`/v1/business/stocktake/${current?.id}/approve`, {}),
    onSuccess: () => { refresh(); toast({ title: 'Stocktake approved', description: 'Locked, and stock corrected to the counted figures.' }); },
    onError: (e: Error) => toast({ title: 'Could not approve', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.includes('INVENTORY_NOT_ENABLED') || message.includes('not enabled')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Stocktake</h1>
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return <p className="text-sm text-destructive">Could not load: {message}</p>;
  }

  const uncounted = current?.lines.filter((l) => l.counted_quantity_milli === null).length ?? 0;
  const isDraft = current?.status === 'DRAFT';
  const isCompleted = current?.status === 'COMPLETED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stocktake &amp; variance</h1>
          <p className="text-sm text-muted-foreground">
            Count what is physically there, and compare it with what sales say should be.
          </p>
        </div>
        {!current && (
          <Button onClick={() => openMutation.mutate()} disabled={openMutation.isPending}>
            {openMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start a count
          </Button>
        )}
      </div>

      {!current && (
        <Card>
          <CardContent className="py-10 text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No count in progress</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Starting a count fixes a cut-off time. Sales rung up after it belong to the next period.
            </p>
          </CardContent>
        </Card>
      )}

      {current && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {current.reference ?? 'Count'}
                    {current.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </CardTitle>
                  <CardDescription>
                    Cut-off {new Date(current.cutoff_at).toLocaleString()} · {current.status}
                  </CardDescription>
                </div>
                {current.accuracy_basis_points !== null && (
                  <div className="text-right">
                    <p className="text-xs uppercase text-muted-foreground">Accuracy (by value)</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {(current.accuracy_basis_points / 100).toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Variance value</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${
                      current.total_variance_value_cents < 0 ? 'text-destructive' : ''
                    }`}
                  >
                    {formatCurrency(current.total_variance_value_cents / 100)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Usage at cost</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCurrency(current.total_theoretical_value_cents / 100)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Still to count</p>
                  <p className="text-lg font-semibold tabular-nums">{uncounted}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {isDraft && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || Object.keys(counts).length === 0}
                    >
                      {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save counts
                    </Button>
                    <Button
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending || uncounted > 0}
                      title={uncounted > 0 ? `${uncounted} ingredient(s) still uncounted` : undefined}
                    >
                      {completeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Complete count
                    </Button>
                  </>
                )}
                {isCompleted && (
                  <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                    {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Approve &amp; lock
                  </Button>
                )}
              </div>

              {isCompleted && (
                <p className="text-xs text-muted-foreground">
                  Approving locks this count permanently and corrects book stock to the counted
                  figures, so the next period starts reconciled instead of inheriting this variance.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-3">Ingredient</th>
                      <th className="px-3 py-3">Count by</th>
                      <th className="px-3 py-3">Counted</th>
                      <th className="px-3 py-3">Expected</th>
                      <th className="px-3 py-3">Variance</th>
                      <th className="px-3 py-3 text-right">%</th>
                      <th className="px-3 py-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.lines.map((line) => (
                      <tr
                        key={line.ingredient_id}
                        className={`border-b last:border-0 ${line.is_flagged ? 'bg-destructive/5' : ''}`}
                      >
                        <td className="px-3 py-2 font-medium">
                          <span className="flex items-center gap-2">
                            {line.is_flagged && (
                              <AlertTriangle className="h-3.5 w-3.5 flex-none text-destructive" />
                            )}
                            {line.ingredient_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {COUNT_HINT[line.count_method] ?? line.count_method}
                        </td>
                        <td className="px-3 py-2">
                          {isDraft ? (
                            <Input
                              value={counts[line.ingredient_id] ?? ''}
                              onChange={(e) =>
                                setCounts({ ...counts, [line.ingredient_id]: e.target.value })
                              }
                              placeholder={line.counted_display ?? '—'}
                              className="h-9 w-28"
                            />
                          ) : (
                            <span className="tabular-nums">{line.counted_display ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {line.expected_display}
                        </td>
                        <td
                          className={`px-3 py-2 tabular-nums ${
                            line.variance_quantity_milli < 0
                              ? 'text-destructive'
                              : line.variance_quantity_milli > 0
                              ? 'text-emerald-600'
                              : ''
                          }`}
                        >
                          {line.variance_quantity_milli > 0 ? '+' : ''}
                          {line.variance_display}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.variance_percent}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            line.variance_value_cents < 0 ? 'text-destructive' : ''
                          }`}
                        >
                          {formatCurrency(line.variance_value_cents / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {(history ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past counts</CardTitle>
            <CardDescription>Approved counts are kept permanently and cannot be edited.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Cut-off</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {(history ?? []).map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{row.reference ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.cutoff_at ? new Date(row.cutoff_at).toLocaleDateString() : '—'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          row.total_variance_value_cents < 0 ? 'text-destructive' : ''
                        }`}
                      >
                        {formatCurrency(row.total_variance_value_cents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
