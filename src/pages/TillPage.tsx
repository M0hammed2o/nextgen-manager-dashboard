import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { TillSession, TillSessionHistoryEntry } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton, ErrorState } from '@/components/shared/PageComponents';
import { Loader2, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Till close (cash-up) for Owners/Managers -- KNOWN_BUGS.md BUG-0028: the
 * Staff PWA's own cash-up dialog can only be reached via PIN login (STAFF
 * role only), and its own close button is correctly disabled for STAFF
 * (require_owner_or_manager on the backend) -- so without this screen, no
 * authorised role could ever reach the till-close action through any real
 * browser screen. This page is the smallest fix: it exposes the SAME
 * existing backend routes (`/business/pos/till/current`, `/till/{id}/close`)
 * the Staff PWA already calls, gated to whoever is logged into this
 * dashboard (which is only ever OWNER/MANAGER -- this app has no STAFF
 * login path at all, so no extra role check is needed beyond the backend's
 * own `require_owner_or_manager`, which already rejects anyone else).
 */
export default function TillPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [countedCash, setCountedCash] = useState('');
  const [result, setResult] = useState<TillSession | null>(null);

  const { data: current, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['till-current'],
    queryFn: () => apiClient.get<TillSession | null>('/v1/business/pos/till/current'),
  });

  // Cash-up history. Owner/manager only on the backend too — a variance is a
  // statement about a named cashier's drawer, not general reading.
  const { data: history = [] } = useQuery({
    queryKey: ['till-sessions'],
    queryFn: () => apiClient.get<TillSessionHistoryEntry[]>('/v1/business/pos/till/sessions'),
  });

  const closeMutation = useMutation({
    mutationFn: (countedCashCents: number) =>
      apiClient.post<TillSession>(`/v1/business/pos/till/${current?.id}/close`, {
        counted_cash_cents: countedCashCents,
      }),
    onSuccess: (closed) => {
      setResult(closed);
      setCountedCash('');
      queryClient.invalidateQueries({ queryKey: ['till-current'] });
      queryClient.invalidateQueries({ queryKey: ['till-sessions'] });
      toast({ title: 'Till closed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not close the till', description: err.message, variant: 'destructive' });
    },
  });

  function handleClose() {
    const cents = Math.round(parseFloat(countedCash || '0') * 100);
    if (isNaN(cents) || cents < 0) {
      toast({ title: 'Enter a valid counted cash amount', variant: 'destructive' });
      return;
    }
    closeMutation.mutate(cents);
  }

  if (isLoading) return <PageSkeleton />;

  // current === undefined here means the fetch never returned a value at
  // all (as opposed to a successful `null`, meaning "no till open") — don't
  // let that read as "No till open", which a manager could misread as
  // nothing needing attention.
  if (isError && current === undefined) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Till / Cash-up</h1>
        <p className="text-sm text-muted-foreground">Close the current till session and reconcile cash</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-4 h-4" /> {result ? 'Till closed' : current ? 'Open till' : 'No till open'}
          </CardTitle>
          {current && !result && (
            <CardDescription>
              Opened {new Date(current.opened_at).toLocaleString()} with {formatCurrency(current.opening_float_cents / 100)} float.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {result ? (
            <div className="space-y-2 max-w-sm">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opening float</span>
                <span className="font-medium">{formatCurrency(result.opening_float_cents / 100)}</span>
              </div>
              {result.cash_sales_cents != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash sales</span>
                  <span className="font-medium">+{formatCurrency(result.cash_sales_cents / 100)}</span>
                </div>
              )}
              {!!result.cash_refunds_cents && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash refunds</span>
                  <span className="font-medium">-{formatCurrency(result.cash_refunds_cents / 100)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expected cash</span>
                <span className="font-medium">{formatCurrency((result.expected_cash_cents ?? 0) / 100)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Counted cash</span>
                <span className="font-medium">{formatCurrency((result.counted_cash_cents ?? 0) / 100)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Variance</span>
                <span className={(result.variance_cents ?? 0) < 0 ? 'text-destructive' : 'text-primary'}>
                  {(result.variance_cents ?? 0) >= 0 ? '+' : ''}
                  {formatCurrency((result.variance_cents ?? 0) / 100)}
                </span>
              </div>
            </div>
          ) : current ? (
            <div className="space-y-4 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="counted-cash">Counted cash in drawer (R)</Label>
                <Input
                  id="counted-cash"
                  type="number"
                  inputMode="decimal"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button onClick={handleClose} disabled={closeMutation.isPending} className="gap-1.5">
                {closeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Close till
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No till is currently open — a cashier opens one from the Staff PWA's Till screen before taking sales.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash-up history</CardTitle>
          <CardDescription>
            Every till session ever opened. A closed session is never edited — this is
            the permanent record of who opened the drawer and how the count came out.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No till sessions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Opened</th>
                    <th className="px-4 py-3">Closed</th>
                    <th className="px-4 py-3">Opened by</th>
                    <th className="px-4 py-3">Closed by</th>
                    <th className="px-4 py-3 text-right">Float</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3 text-right">Counted</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(row.opened_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {row.closed_at ? new Date(row.closed_at).toLocaleString() : 'Still open'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.opened_by_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.closed_by_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(row.opening_float_cents / 100)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.expected_cash_cents != null
                          ? formatCurrency(row.expected_cash_cents / 100)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.counted_cash_cents != null
                          ? formatCurrency(row.counted_cash_cents / 100)
                          : '—'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-medium ${
                          (row.variance_cents ?? 0) < 0 ? 'text-destructive' : ''
                        }`}
                      >
                        {row.variance_cents != null
                          ? `${row.variance_cents >= 0 ? '+' : ''}${formatCurrency(row.variance_cents / 100)}`
                          : '—'}
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
