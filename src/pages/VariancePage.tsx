import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Stocktake, StocktakeSummary } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { AlertTriangle, ArrowRight, ClipboardCheck, Info } from 'lucide-react';

/**
 * Variance — where the difference between expected and actual stock is
 * coming from.
 *
 * DELIBERATE LANGUAGE. This screen never says theft, and never implies it.
 * The software genuinely cannot know why stock is missing: over-portioning,
 * an unrecorded giveaway, a short delivery signed for without counting, a
 * miscount, a wrong recipe and actual theft all produce the identical
 * number. Calling it theft would be both unfounded and, pointed at a
 * specific shift, potentially defamatory. So it reports an unexplained
 * difference and gives the manager what they need to investigate.
 */
export default function VariancePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: history, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['stocktake-history'],
    queryFn: () => apiClient.get<StocktakeSummary[]>('/v1/business/stocktake'),
  });

  const approved = (history ?? []).filter((s) => s.status === 'APPROVED');
  const currentId = selectedId ?? approved[0]?.id ?? null;

  const { data: detail } = useQuery({
    queryKey: ['stocktake', currentId],
    queryFn: () => apiClient.get<Stocktake>(`/v1/business/stocktake/${currentId}`),
    enabled: !!currentId,
  });

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.toLowerCase().includes('not enabled') || message.includes('INVENTORY_NOT_ENABLED')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Variance</h1>
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Variance</h1>
        <p className="text-sm text-destructive">Could not load: {message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    );
  }

  if (approved.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Variance</h1>
          <p className="text-sm text-muted-foreground">
            Expected stock against what you actually counted.
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">No completed stocktake yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Count your stock and approve it, and the differences will appear here.
            </p>
            <Button className="mt-4" asChild>
              <Link to="/stocktake">Do a stocktake <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lines = detail?.lines ?? [];
  const shortfalls = lines.filter((l) => l.variance_value_cents < 0);
  const surpluses = lines.filter((l) => l.variance_value_cents > 0);
  const totalShort = shortfalls.reduce((sum, l) => sum + l.variance_value_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Variance</h1>
          <p className="text-sm text-muted-foreground">
            What your sales say you should have, against what you counted.
          </p>
        </div>
        {approved.length > 1 && (
          <select
            value={currentId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {approved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.reference ?? 'Count'} ·{' '}
                {s.cutoff_at ? new Date(s.cutoff_at).toLocaleDateString() : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {detail && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Stock accuracy</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {detail.accuracy_basis_points !== null
                    ? `${(detail.accuracy_basis_points / 100).toFixed(2)}%`
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Weighted by value</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Usage at cost</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(detail.total_theoretical_value_cents / 100)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">What your sales should have used</p>
              </CardContent>
            </Card>
            <Card className={totalShort < 0 ? 'border-destructive/40' : undefined}>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Unexplained shortfall</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">
                  {formatCurrency(Math.abs(totalShort) / 100)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {shortfalls.length} ingredient{shortfalls.length === 1 ? '' : 's'} short
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs uppercase text-muted-foreground">Counted over</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                  {formatCurrency(
                    surpluses.reduce((s, l) => s + l.variance_value_cents, 0) / 100
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {surpluses.length} counted higher than expected
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/30">
            <CardContent className="flex gap-3 py-4">
              <Info className="mt-0.5 h-5 w-5 flex-none text-primary" />
              <div className="text-sm">
                <p className="font-medium">A difference is not proof of anything on its own.</p>
                <p className="mt-1 text-muted-foreground">
                  Over-portioning, wastage nobody logged, a short delivery signed for without
                  counting, a miscount, a recipe that does not match what the kitchen actually
                  does, and staff meals all look identical here. Use this to decide what to
                  investigate — starting with the biggest rand amounts.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Worst differences first</CardTitle>
              <CardDescription>
                Ranked by rand value, because that is what actually costs you money —
                a big percentage on something cheap rarely matters.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-3">Ingredient</th>
                      <th className="px-3 py-3">Expected</th>
                      <th className="px-3 py-3">Counted</th>
                      <th className="px-3 py-3">Difference</th>
                      <th className="px-3 py-3 text-right">%</th>
                      <th className="px-3 py-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
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
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {line.expected_display}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{line.counted_display ?? '—'}</td>
                        <td className={`px-3 py-2 tabular-nums ${
                          line.variance_quantity_milli < 0 ? 'text-destructive'
                            : line.variance_quantity_milli > 0 ? 'text-emerald-600' : ''
                        }`}>
                          {line.variance_quantity_milli > 0 ? '+' : ''}{line.variance_display}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.variance_percent}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${
                          line.variance_value_cents < 0 ? 'font-semibold text-destructive' : ''
                        }`}>
                          {formatCurrency(line.variance_value_cents / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where to look first</CardTitle>
            </CardHeader>
            <CardContent>
              {shortfalls.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing came up short this period.
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {shortfalls.slice(0, 5).map((line) => (
                    <li key={line.ingredient_id} className="flex flex-wrap gap-2">
                      <span className="font-medium">{line.ingredient_name}</span>
                      <span className="text-muted-foreground">
                        short {line.variance_display} ({formatCurrency(Math.abs(line.variance_value_cents) / 100)})
                        — check portioning, unlogged wastage, and the last delivery
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
