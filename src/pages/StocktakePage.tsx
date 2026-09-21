import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import { cn } from '@/lib/utils';
import type { Stocktake, StocktakeSummary } from '@/types/inventory';
import type { BusinessSettings } from '@/types/api';
import {
  unitOptionsFor,
  buildCountsPayload,
  seedCountEntries,
  type CountEntry,
  type StocktakePayloadLine,
} from '@/lib/stocktake-units';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, ClipboardCheck, Lock, AlertTriangle, CalendarClock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const COUNT_HINT: Record<string, string> = {
  UNIT_COUNT: 'count items',
  WEIGHT: 'weigh',
  VOLUME: 'measure',
};

const FREQUENCY_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'DAILY_1', label: 'Once a day', hint: 'A single close-of-day count' },
  { value: 'DAILY_2', label: 'Twice a day', hint: 'Typically open and close' },
  { value: 'DAILY_3', label: 'Three times a day', hint: 'Open, mid-shift, close' },
  { value: 'DAILY_4', label: 'Four times a day', hint: 'Each shift change' },
  { value: 'CUSTOM', label: 'Custom times', hint: 'Choose your own times of day' },
];

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
  const [counts, setCounts] = useState<Record<string, CountEntry>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [customTimes, setCustomTimes] = useState<string>('');

  // The count schedule lives with the counts rather than buried in Settings —
  // this is the screen an owner is on when they think about how often to count.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<BusinessSettings>('/v1/business/settings'),
  });

  const scheduleMutation = useMutation({
    mutationFn: (body: { stocktake_frequency: string; stocktake_times_json: string[] | null }) =>
      apiClient.put<BusinessSettings>('/v1/business/settings', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Count schedule saved' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save the schedule', description: err.message, variant: 'destructive' }),
  });

  function saveFrequency(frequency: string) {
    if (frequency === 'CUSTOM') {
      // Times are typed as a comma-separated list; the API validates each one
      // and rejects a CUSTOM schedule with none, so a half-set schedule can
      // never reach the overdue calculation.
      const times = customTimes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      scheduleMutation.mutate({ stocktake_frequency: 'CUSTOM', stocktake_times_json: times });
      return;
    }
    scheduleMutation.mutate({ stocktake_frequency: frequency, stocktake_times_json: null });
  }

  const { data: current, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['stocktake-current'],
    queryFn: () => apiClient.get<Stocktake | null>('/v1/business/stocktake/current'),
  });

  const { data: history } = useQuery({
    queryKey: ['stocktake-history'],
    queryFn: () => apiClient.get<StocktakeSummary[]>('/v1/business/stocktake'),
  });

  // Seed the count inputs once per session — from whatever was last saved on
  // this draft, in that ingredient's default entry unit (see seedCountEntries
  // for why that unit specifically). Never overwritten by a later refetch of
  // the same session, so an in-progress edit can't be clobbered mid-count.
  useEffect(() => {
    if (!current) {
      setCounts({});
      setLineErrors({});
      return;
    }
    setCounts((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return seedCountEntries(current.lines);
    });
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    mutationFn: (lines: StocktakePayloadLine[]) =>
      apiClient.post<Stocktake>(`/v1/business/stocktake/${current?.id}/counts`, { lines }),
    onSuccess: () => { setLineErrors({}); refresh(); toast({ title: 'Counts saved' }); },
    onError: (e: Error) => toast({ title: 'Could not save', description: e.message, variant: 'destructive' }),
  });

  function handleSave() {
    const { lines, errors } = buildCountsPayload(counts);
    setLineErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Fix the highlighted counts before saving',
        description: 'One or more counts have an invalid quantity or no unit chosen.',
        variant: 'destructive',
      });
      return;
    }
    if (lines.length === 0) {
      toast({ title: 'Enter at least one count first', variant: 'destructive' });
      return;
    }
    saveMutation.mutate(lines);
  }

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
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Stocktake</h1>
        <p className="text-sm text-destructive">Could not load: {message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    );
  }

  const uncounted = current?.lines.filter((l) => l.counted_quantity_milli === null).length ?? 0;
  const isDraft = current?.status === 'DRAFT';
  const isCompleted = current?.status === 'COMPLETED';
  const hasEnteredCounts = Object.values(counts).some((c) => c.quantity.trim() !== '');

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
                      onClick={handleSave}
                      disabled={saveMutation.isPending || !hasEnteredCounts}
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
                    {current.lines.map((line) => {
                      const entry = counts[line.ingredient_id] ?? {
                        quantity: '',
                        unit: unitOptionsFor(line.canonical_unit, line.unit_label)[0].value,
                      };
                      const options = unitOptionsFor(line.canonical_unit, line.unit_label);
                      const lineError = lineErrors[line.ingredient_id];
                      return (
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
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  value={entry.quantity}
                                  onChange={(e) => {
                                    setCounts({
                                      ...counts,
                                      [line.ingredient_id]: { ...entry, quantity: e.target.value },
                                    });
                                    if (lineError) {
                                      setLineErrors((prev) => {
                                        const next = { ...prev };
                                        delete next[line.ingredient_id];
                                        return next;
                                      });
                                    }
                                  }}
                                  placeholder={line.counted_display ?? '—'}
                                  className={cn(
                                    'h-9 w-20',
                                    lineError && 'border-destructive focus-visible:ring-destructive'
                                  )}
                                />
                                {options.length > 1 ? (
                                  <Select
                                    value={entry.unit}
                                    onValueChange={(unit) =>
                                      setCounts({ ...counts, [line.ingredient_id]: { ...entry, unit } })
                                    }
                                  >
                                    <SelectTrigger className="h-9 w-16 px-2 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {options.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{options[0].label}</span>
                                )}
                              </div>
                              {lineError && <span className="text-xs text-destructive">{lineError}</span>}
                            </div>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> How often you count
          </CardTitle>
          <CardDescription>
            Sets what your staff are expected to do. It never blocks a count — if a
            delivery looks short at 3pm, anyone can start one straight away.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FREQUENCY_OPTIONS.map((opt) => {
              const active = (settings?.stocktake_frequency ?? 'DAILY_1') === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => saveFrequency(opt.value)}
                  disabled={scheduleMutation.isPending}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </button>
              );
            })}
          </div>

          {settings?.stocktake_frequency === 'CUSTOM' && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <Label htmlFor="custom-times">Times of day</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="custom-times"
                  value={customTimes}
                  onChange={(e) => setCustomTimes(e.target.value)}
                  placeholder={(settings?.stocktake_times_json ?? []).join(', ') || '06:00, 14:00, 22:00'}
                  className="max-w-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => saveFrequency('CUSTOM')}
                  disabled={scheduleMutation.isPending}
                >
                  Save times
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                24-hour times, separated by commas. Currently:{' '}
                {(settings?.stocktake_times_json ?? []).join(', ') || 'none set'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {(history ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past counts</CardTitle>
            <CardDescription>
              Every count is its own record with its own cut-off — a new count never
              overwrites an earlier one, and an approved count can no longer be edited.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Cut-off</th>
                    <th className="px-4 py-3">Counted by</th>
                    <th className="px-4 py-3 text-right">Lines counted</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(history ?? []).map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{row.reference ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {/* Date AND time: two counts on the same day are only
                            distinguishable by their cut-off. */}
                        {row.cutoff_at ? new Date(row.cutoff_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.opened_by_name ?? '—'}
                        {row.completed_by_name && row.completed_by_name !== row.opened_by_name
                          ? ` → ${row.completed_by_name}`
                          : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.counted_line_count}/{row.line_count}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          row.total_variance_value_cents < 0 ? 'text-destructive' : ''
                        }`}
                      >
                        {row.status === 'DRAFT' ? '—' : formatCurrency(row.total_variance_value_cents / 100)}
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-muted-foreground" title={row.notes ?? ''}>
                        {row.notes ?? '—'}
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
