import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { unitOptionsFor, defaultUnitFor } from '@/lib/stocktake-units';
import { buildOpeningStockPayload, isOpeningStockDuplicateError } from '@/lib/opening-stock';
import type { Ingredient } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton, EmptyState, ErrorState } from '@/components/shared/PageComponents';
import { cn } from '@/lib/utils';
import { Boxes, Loader2, CheckCircle2, AlertTriangle, FileUp, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RowEntry {
  quantity: string;
  unit: string;
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'duplicate' | 'error';

/**
 * Opening stock — the one-time starting position for each ingredient at
 * go-live, posted through the audited stock ledger
 * (POST /v1/business/inventory/opening-stock, routes_inventory.py).
 *
 * A row-per-ingredient grid rather than a dialog-per-ingredient: an owner
 * setting up a restaurant has dozens of ingredients to enter in one sitting,
 * and each one is its own independent request (there is no batch endpoint on
 * the backend), so this page fires them one at a time and tracks per-row
 * status individually.
 *
 * TWO THINGS THIS PAGE HANDLES DELIBERATELY
 * --------------------------------------------
 * 1. A second opening-stock submission for the same ingredient is REJECTED
 *    by the backend with 409 OPENING_STOCK_ALREADY_SET — an opening balance
 *    is by definition the pre-any-movement position, so a repeat is
 *    ambiguous. Recognised via `isOpeningStockDuplicateError` and shown
 *    inline with what to do instead (a manual stock adjustment, or a goods
 *    receipt), never retried automatically.
 * 2. Double-submission is prevented client-side: the whole grid locks while
 *    a batch is in flight, and a row already marked "saved" or "already
 *    set" cannot be resubmitted from this screen. The backend's
 *    idempotency key is a real backstop, but a double-fire should not reach
 *    it in normal use.
 *
 * The CSV ingredient importer (`/import`, "Ingredients" sheet) remains a
 * fully separate, still-available path for large onboarding — it accepts
 * its own `opening_quantity` column per row. This page is for the normal
 * case: entering counts directly, no spreadsheet required.
 */
export default function OpeningStockPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [entries, setEntries] = useState<Record<string, RowEntry>>({});
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous guard against a double-fire that beats React's state update
  // to the next render (e.g. a very fast double-click) — `statuses` alone
  // can't prevent that, since both clicks could read the same pre-update
  // state before either re-render lands. A ref is mutated immediately,
  // outside the render cycle, closing that gap.
  const inFlightRef = useRef<Set<string>>(new Set());
  const savingAllRef = useRef(false);

  const { data: ingredients, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiClient.get<Ingredient[]>('/v1/business/inventory/ingredients'),
  });

  const rows = useMemo(() => {
    const active = (ingredients ?? []).filter((i) => i.is_active);
    const term = search.trim().toLowerCase();
    if (!term) return active;
    return active.filter(
      (i) => i.name.toLowerCase().includes(term) || (i.category ?? '').toLowerCase().includes(term)
    );
  }, [ingredients, search]);

  function entryFor(ing: Ingredient): RowEntry {
    return entries[ing.id] ?? { quantity: '', unit: defaultUnitFor(ing.canonical_unit, ing.unit_label) };
  }

  function setQuantity(ing: Ingredient, quantity: string) {
    setEntries((prev) => ({ ...prev, [ing.id]: { ...entryFor(ing), quantity } }));
    // Editing a row that previously errored clears its stale error state so
    // the message doesn't linger next to a value the user has since changed.
    setStatuses((prev) => {
      if (!prev[ing.id] || prev[ing.id] === 'saved' || prev[ing.id] === 'duplicate') return prev;
      const next = { ...prev };
      delete next[ing.id];
      return next;
    });
  }

  function setUnit(ing: Ingredient, unit: string) {
    setEntries((prev) => ({ ...prev, [ing.id]: { ...entryFor(ing), unit } }));
  }

  async function submitRow(ing: Ingredient): Promise<'saved' | 'duplicate' | 'error' | 'skipped'> {
    if (inFlightRef.current.has(ing.id)) return 'skipped'; // already submitting this exact row

    const entry = entryFor(ing);
    const { payload, error: validationError } = buildOpeningStockPayload(
      { ingredientId: ing.id, quantity: entry.quantity, unit: entry.unit },
      { source, occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined }
    );
    if (!payload) {
      if (!entry.quantity.trim()) return 'skipped'; // nothing entered for this row — not an error
      setStatuses((prev) => ({ ...prev, [ing.id]: 'error' }));
      setMessages((prev) => ({ ...prev, [ing.id]: validationError ?? 'Invalid entry' }));
      return 'error';
    }

    inFlightRef.current.add(ing.id);
    setStatuses((prev) => ({ ...prev, [ing.id]: 'saving' }));
    try {
      const result = await apiClient.post<{ quantity_display: string }>(
        '/v1/business/inventory/opening-stock',
        payload
      );
      setStatuses((prev) => ({ ...prev, [ing.id]: 'saved' }));
      setMessages((prev) => ({ ...prev, [ing.id]: `Saved: ${result.quantity_display}` }));
      return 'saved';
    } catch (err) {
      if (isOpeningStockDuplicateError(err)) {
        setStatuses((prev) => ({ ...prev, [ing.id]: 'duplicate' }));
        setMessages((prev) => ({
          ...prev,
          [ing.id]: 'Already set for this ingredient — use a stock adjustment or a goods receipt instead.',
        }));
        return 'duplicate';
      }
      const message = (err as Error).message ?? 'Could not save';
      setStatuses((prev) => ({ ...prev, [ing.id]: 'error' }));
      setMessages((prev) => ({ ...prev, [ing.id]: message }));
      return 'error';
    } finally {
      inFlightRef.current.delete(ing.id);
    }
  }

  async function saveAll() {
    if (savingAllRef.current) return; // synchronous guard, see inFlightRef's comment above
    const pending = rows.filter((ing) => {
      const status = statuses[ing.id];
      const entry = entryFor(ing);
      return status !== 'saved' && status !== 'duplicate' && entry.quantity.trim() !== '';
    });
    if (pending.length === 0) {
      toast({ title: 'Enter at least one quantity first', variant: 'destructive' });
      return;
    }
    savingAllRef.current = true;
    setIsSubmitting(true);
    let saved = 0;
    let failed = 0;
    try {
      // Sequential, not parallel: keeps per-row status updates predictable
      // and avoids hammering the ledger with a burst of concurrent writes
      // for what is fundamentally a one-time, unhurried onboarding task.
      for (const ing of pending) {
        const outcome = await submitRow(ing);
        if (outcome === 'saved') saved += 1;
        else if (outcome === 'error' || outcome === 'duplicate') failed += 1;
      }
    } finally {
      savingAllRef.current = false;
      setIsSubmitting(false);
    }
    queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    queryClient.invalidateQueries({ queryKey: ['live-stock'] });
    if (saved > 0) {
      toast({
        title: `${saved} opening stock ${saved === 1 ? 'entry' : 'entries'} saved`,
        description: failed > 0 ? `${failed} need a look — see the highlighted rows.` : undefined,
      });
    } else if (failed > 0) {
      toast({ title: 'Nothing was saved', description: 'See the highlighted rows below.', variant: 'destructive' });
    }
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.toLowerCase().includes('not enabled') || message.includes('INVENTORY_NOT_ENABLED')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Opening Stock</h1>
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Opening Stock</h1>
        <ErrorState message={message} onRetry={() => refetch()} isRetrying={isFetching} />
      </div>
    );
  }

  const allIngredients = ingredients ?? [];
  const enteredCount = Object.values(entries).filter((e) => e.quantity.trim() !== '').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Opening Stock</h1>
        <p className="text-sm text-muted-foreground">
          Set each ingredient's starting position — a physical count on go-live day, or whatever you
          carried over from a previous system. Posts once per ingredient, through the same audited
          ledger as every other stock movement.
        </p>
      </div>

      {allIngredients.length === 0 ? (
        <EmptyState
          icon={<Boxes className="w-12 h-12" />}
          title="No ingredients yet"
          description="Add ingredients first, then come back here to set their starting stock."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Onboarding lots of ingredients at once?</CardTitle>
              <CardDescription>
                The Ingredients spreadsheet import also accepts an <code>opening_quantity</code> column,
                so you can set names, costs and opening stock in one upload. This page is for the normal
                case of typing counts in directly — it isn't a replacement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/import"><FileUp className="mr-2 h-4 w-4" /> Go to spreadsheet import</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applies to every row you save below</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="source">Source (optional)</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Physical count on go-live day"
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occurred-at">When this count was actually taken (optional)</Label>
                <Input
                  id="occurred-at"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Defaults to right now if left blank.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Ingredients</CardTitle>
                  <CardDescription>{enteredCount} of {rows.length} shown have a quantity entered.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search ingredients…"
                    className="h-9 w-48"
                  />
                  <Button onClick={saveAll} disabled={isSubmitting || enteredCount === 0}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save all entered
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-3">Ingredient</th>
                      <th className="px-3 py-3">Quantity</th>
                      <th className="px-3 py-3">Unit</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No ingredients match "{search}".
                        </td>
                      </tr>
                    ) : rows.map((ing) => {
                      const entry = entryFor(ing);
                      const status = statuses[ing.id] ?? 'idle';
                      const message = messages[ing.id];
                      const options = unitOptionsFor(ing.canonical_unit, ing.unit_label);
                      const locked = status === 'saved' || status === 'duplicate' || status === 'saving';
                      return (
                        <tr key={ing.id} className={cn('border-b last:border-0', status === 'error' && 'bg-destructive/5')}>
                          <td className="px-3 py-2 font-medium">
                            {ing.name}
                            {ing.category && <span className="block text-xs text-muted-foreground">{ing.category}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number" inputMode="decimal" min="0" step="any"
                              value={entry.quantity}
                              onChange={(e) => setQuantity(ing, e.target.value)}
                              disabled={locked || isSubmitting}
                              className="h-9 w-24"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {options.length > 1 ? (
                              <Select
                                value={entry.unit}
                                onValueChange={(unit) => setUnit(ing, unit)}
                                disabled={locked || isSubmitting}
                              >
                                <SelectTrigger className="h-9 w-20 px-2 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">{options[0].label}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {status === 'saved' && (
                              <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {message}
                              </span>
                            )}
                            {status === 'duplicate' && (
                              <span className="flex items-start gap-1.5 text-xs font-medium text-warning">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {message}
                              </span>
                            )}
                            {status === 'error' && (
                              <span className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {message}
                              </span>
                            )}
                            {status === 'saving' && (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {status !== 'saved' && status !== 'duplicate' && (
                              <Button
                                size="sm" variant="outline"
                                onClick={() => submitRow(ing)}
                                disabled={isSubmitting || status === 'saving' || !entry.quantity.trim()}
                              >
                                {status === 'saving' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Save
                              </Button>
                            )}
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
    </div>
  );
}
