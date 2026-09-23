import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Ingredient, StockMovement, Supplier } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, Truck, Plus, Trash2, AlertTriangle, X, Scale } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { unitOptionsFor, defaultUnitFor } from '@/lib/stocktake-units';
import { buildAdjustmentPayload, type AdjustmentDirection, type AdjustmentPayload } from '@/lib/stock-adjustment';

interface LiveStockRow {
  ingredient_id: string;
  name: string;
  category: string | null;
  unit_label: string | null;
  opening_display: string;
  received_display: string;
  used_by_sales_display: string;
  wastage_display: string;
  adjustments_display: string;
  expected_display: string;
  last_counted_display: string | null;
  variance_display: string | null;
  variance_value_cents: number | null;
  variance_percent: string | null;
  needs_attention: boolean;
  expected_value_cents: number;
  below_par: boolean;
}

interface LiveStock {
  period_started_at: string | null;
  period_label: string;
  total_expected_value_cents: number;
  ingredient_count: number;
  needs_attention_count: number;
  rows: LiveStockRow[];
}

interface ReceiptLine {
  ingredient_id: string;
  quantity: string;
  unit: string;
  cost: string;
}

/**
 * Stock — what the restaurant should have right now, and why.
 *
 * Every figure comes from the movement ledger; there is no stored "current
 * quantity" that could drift away from the history. The breakdown columns
 * exist so a manager can see HOW expected stock was reached rather than
 * being handed a number to trust, and the drill-down shows the individual
 * movements behind it — which is what separates a genuine unexplained loss
 * from a data-entry mistake.
 */
export default function StockPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [reference, setReference] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [showReceiving, setShowReceiving] = useState(false);
  const [drillDown, setDrillDown] = useState<LiveStockRow | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);

  // Manual adjustment — the one movement type with no delivery note or sale
  // behind it, so OWNER/MANAGER-only and always audited server-side (see
  // src/lib/stock-adjustment.ts and routes_inventory.py::create_adjustment).
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjIngredientId, setAdjIngredientId] = useState('');
  const [adjDirection, setAdjDirection] = useState<AdjustmentDirection>('ADD');
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjUnit, setAdjUnit] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState<string | null>(null);

  // Delivery-sales freshness. Without this, a manager looking at expected
  // stock has no way to know whether today's Uber/Mr D sales are included —
  // and un-imported sales look exactly like a loss that never happened.
  const { data: externalStatus } = useQuery({
    queryKey: ['external-status'],
    queryFn: () =>
      apiClient.get<{
        platforms: { label: string; ever_imported: boolean; is_stale: boolean;
                     covered_through: string | null }[];
        any_stale: boolean;
        stock_warning: string | null;
      }>('/v1/business/external-orders/status'),
  });

  const { data: live, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['live-stock'],
    queryFn: () => apiClient.get<LiveStock>('/v1/business/setup/live-stock'),
  });

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiClient.get<Ingredient[]>('/v1/business/inventory/ingredients'),
  });

  // Active suppliers only — attributing a delivery to a deactivated supplier
  // would be a strange thing to offer, and the backend's own delete-safety
  // rule (see SuppliersPage.tsx) depends on this count actually accumulating
  // when a supplier IS chosen here.
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', false],
    queryFn: () => apiClient.get<Supplier[]>('/v1/business/inventory/suppliers?include_inactive=false'),
  });

  // Cheap reuse of the same coverage check RecipesPage.tsx already shows in
  // full (item-by-item, with names) — this is deliberately just the count,
  // as a heads-up that expected stock here may be overstated for reasons
  // that have nothing to do with a miscount.
  const { data: recipeCoverage } = useQuery({
    queryKey: ['recipe-coverage'],
    queryFn: () => apiClient.get<{ missing: number; incomplete: number }>('/v1/business/setup/recipe-coverage'),
  });

  const { data: movements, isLoading: loadingMovements } = useQuery({
    queryKey: ['movements', drillDown?.ingredient_id],
    queryFn: () =>
      apiClient.get<StockMovement[]>(
        `/v1/business/inventory/stock/${drillDown!.ingredient_id}/movements?limit=100`
      ),
    enabled: !!drillDown,
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/v1/business/inventory/goods-receipts', {
        reference: reference.trim() || null,
        supplier_id: supplierId || null,
        lines: lines
          .filter((l) => l.ingredient_id && l.quantity)
          .map((l) => ({
            ingredient_id: l.ingredient_id,
            quantity: l.quantity,
            unit: l.unit,
            unit_cost_cents: l.cost ? Math.round(parseFloat(l.cost) * 100) : null,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-stock'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      setLines([]);
      setReference('');
      setSupplierId('');
      setShowReceiving(false);
      toast({ title: 'Delivery recorded', description: 'Expected stock updated.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not record that', description: err.message, variant: 'destructive' }),
  });

  const selectedAdjIngredient = (ingredients ?? []).find((i) => i.id === adjIngredientId) ?? null;

  function selectAdjIngredient(id: string) {
    setAdjIngredientId(id);
    const ing = (ingredients ?? []).find((i) => i.id === id);
    setAdjUnit(ing ? defaultUnitFor(ing.canonical_unit, ing.unit_label) : '');
  }

  const adjustMutation = useMutation({
    mutationFn: (payload: AdjustmentPayload) =>
      apiClient.post<{ display: string }>('/v1/business/inventory/adjustments', payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['live-stock'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      setAdjIngredientId('');
      setAdjDirection('ADD');
      setAdjQuantity('');
      setAdjUnit('');
      setAdjReason('');
      setAdjError(null);
      setShowAdjust(false);
      toast({ title: 'Stock adjusted', description: `Now expected: ${result.display}` });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not adjust stock', description: err.message, variant: 'destructive' }),
  });

  function submitAdjustment() {
    const { payload, error: validationError } = buildAdjustmentPayload({
      ingredientId: adjIngredientId,
      direction: adjDirection,
      quantity: adjQuantity,
      unit: adjUnit,
      reason: adjReason,
    });
    if (!payload) {
      setAdjError(validationError);
      return;
    }
    setAdjError(null);
    adjustMutation.mutate(payload);
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.toLowerCase().includes('not enabled') || message.includes('INVENTORY_NOT_ENABLED')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Stock</h1>
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask NextGen to enable it for this restaurant.
            </p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Stock</h1>
        <p className="text-sm text-destructive">Could not load stock: {message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    );
  }

  const rows = (live?.rows ?? []).filter((r) => !attentionOnly || r.needs_attention);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock</h1>
          <p className="text-sm text-muted-foreground">
            What you should have, based on what you have sold. {live?.period_label}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={showReceiving ? 'outline' : 'default'} onClick={() => { setShowReceiving((v) => !v); setShowAdjust(false); }}>
            <Truck className="mr-2 h-4 w-4" />
            {showReceiving ? 'Close' : 'Record a delivery'}
          </Button>
          <Button variant={showAdjust ? 'outline' : 'default'} onClick={() => { setShowAdjust((v) => !v); setShowReceiving(false); }}>
            <Scale className="mr-2 h-4 w-4" />
            {showAdjust ? 'Close' : 'Adjust stock'}
          </Button>
        </div>
      </div>

      {externalStatus?.any_stale && (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Expected stock may be overstated — delivery sales are not fully imported
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {externalStatus.platforms
                  .filter((p) => p.is_stale && p.ever_imported)
                  .map((p) => `${p.label} counted through ${
                    p.covered_through ? new Date(p.covered_through).toLocaleString() : 'never'
                  }`)
                  .join(' · ')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Import today's delivery orders before treating any difference below as a loss.
              </p>
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <Link to="/delivery-orders">Import delivery orders</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!!recipeCoverage?.missing && (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {recipeCoverage.missing} menu item{recipeCoverage.missing === 1 ? '' : 's'} {recipeCoverage.missing === 1 ? 'has' : 'have'} no recipe
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Selling {recipeCoverage.missing === 1 ? 'it' : 'them'} deducts nothing, so expected stock below may be overstated.
              </p>
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <Link to="/recipes">See which items</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase text-muted-foreground">Expected stock value</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency((live?.total_expected_value_cents ?? 0) / 100)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase text-muted-foreground">Ingredients tracked</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{live?.ingredient_count ?? 0}</p>
          </CardContent>
        </Card>
        <Card className={live?.needs_attention_count ? 'border-amber-500/50' : undefined}>
          <CardContent className="py-4">
            <p className="text-xs uppercase text-muted-foreground">Need a look</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {live?.needs_attention_count ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {showReceiving && (
        <Card>
          <CardHeader>
            <CardTitle>Record a delivery</CardTitle>
            <CardDescription>
              Enter what you actually counted when it arrived — not what you ordered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="max-w-xs">
                <Label htmlFor="ref">Delivery note number</Label>
                <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder="INV-10432" />
              </div>
              <div className="max-w-xs">
                <Label htmlFor="supplier">Supplier (optional)</Label>
                {suppliers && suppliers.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No suppliers set up yet.{' '}
                    <Link to="/suppliers" className="underline">Add one</Link> to attribute deliveries —
                    you can still record this delivery without one.
                  </p>
                ) : (
                  <select
                    id="supplier"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">No supplier recorded</option>
                    {(suppliers ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {lines.map((line, index) => {
              const ing = (ingredients ?? []).find((i) => i.id === line.ingredient_id);
              const noun = ing?.unit_label ?? 'units';
              return (
                <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <select
                    value={line.ingredient_id}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, ingredient_id: e.target.value };
                      setLines(next);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Choose ingredient…</option>
                    {(ingredients ?? []).map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  <Input value={line.quantity}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, quantity: e.target.value };
                      setLines(next);
                    }}
                    placeholder="How many" />
                  <select
                    value={line.unit}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, unit: e.target.value };
                      setLines(next);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="PACK">packs</option>
                    {ing?.canonical_unit === 'UNIT' && <option value="UNIT">{noun}</option>}
                    {ing?.canonical_unit === 'GRAM' && <><option value="KG">kg</option><option value="G">g</option></>}
                    {ing?.canonical_unit === 'MILLILITRE' && <><option value="L">L</option><option value="ML">ml</option></>}
                  </select>
                  <Input value={line.cost}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, cost: e.target.value };
                      setLines(next);
                    }}
                    placeholder="Cost R" />
                  <Button variant="ghost" size="icon" aria-label="Remove line"
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline"
                onClick={() => setLines([...lines, { ingredient_id: '', quantity: '', unit: 'PACK', cost: '' }])}>
                <Plus className="mr-2 h-4 w-4" /> Add line
              </Button>
              {lines.length > 0 && (
                <Button onClick={() => receiveMutation.mutate()}
                  disabled={receiveMutation.isPending || !lines.some((l) => l.ingredient_id && l.quantity)}>
                  {receiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Record delivery
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showAdjust && (
        <Card>
          <CardHeader>
            <CardTitle>Adjust stock</CardTitle>
            <CardDescription>
              For a correction with no delivery note or sale behind it — a miscount, breakage you're
              not logging separately, or fixing a mistake. Always audited, and always needs a reason.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
              <div>
                <Label htmlFor="adj-ingredient">Ingredient</Label>
                <select
                  id="adj-ingredient"
                  value={adjIngredientId}
                  onChange={(e) => selectAdjIngredient(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose ingredient…</option>
                  {(ingredients ?? []).map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="adj-direction">Direction</Label>
                <select
                  id="adj-direction"
                  value={adjDirection}
                  onChange={(e) => setAdjDirection(e.target.value as AdjustmentDirection)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="ADD">Add stock</option>
                  <option value="REMOVE">Remove stock</option>
                </select>
              </div>
              <div>
                <Label htmlFor="adj-quantity">Quantity</Label>
                <Input
                  id="adj-quantity"
                  value={adjQuantity}
                  onChange={(e) => setAdjQuantity(e.target.value)}
                  placeholder="How many"
                  inputMode="decimal"
                />
              </div>
              <div>
                <Label htmlFor="adj-unit">Unit</Label>
                <select
                  id="adj-unit"
                  value={adjUnit}
                  onChange={(e) => setAdjUnit(e.target.value)}
                  disabled={!selectedAdjIngredient}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {!selectedAdjIngredient && <option value="">—</option>}
                  {selectedAdjIngredient &&
                    unitOptionsFor(selectedAdjIngredient.canonical_unit, selectedAdjIngredient.unit_label).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="adj-reason">Reason (required)</Label>
              <Textarea
                id="adj-reason"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="e.g. Recounted after a suspected miscount on Tuesday"
                rows={2}
              />
            </div>
            {adjError && <p className="text-sm text-destructive">{adjError}</p>}
            <Button onClick={submitAdjustment} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save adjustment
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Expected stock</CardTitle>
              <CardDescription>
                Click any ingredient to see exactly what moved.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={attentionOnly}
                onChange={(e) => setAttentionOnly(e.target.checked)} className="h-4 w-4" />
              Only show ones needing a look
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-3">Ingredient</th>
                  <th className="px-3 py-3">Opening</th>
                  <th className="px-3 py-3">Received</th>
                  <th className="px-3 py-3">Used by sales</th>
                  <th className="px-3 py-3">Wastage</th>
                  <th className="px-3 py-3">Adjustments</th>
                  <th className="px-3 py-3">Expected now</th>
                  <th className="px-3 py-3">Last count</th>
                  <th className="px-3 py-3 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      {attentionOnly ? 'Nothing needs a look right now.' : 'No ingredients set up yet.'}
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr
                    key={row.ingredient_id}
                    onClick={() => setDrillDown(row)}
                    className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${
                      row.needs_attention ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">
                      <span className="flex items-center gap-2">
                        {row.needs_attention && (
                          <AlertTriangle className="h-3.5 w-3.5 flex-none text-amber-500" />
                        )}
                        {row.name}
                      </span>
                      {row.category && (
                        <span className="text-xs text-muted-foreground">{row.category}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.opening_display}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.received_display}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.used_by_sales_display}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.wastage_display}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.adjustments_display}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {row.expected_display}
                      {row.below_par && (
                        <span className="ml-2 text-xs font-normal text-amber-600">low</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.last_counted_display ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${
                      (row.variance_value_cents ?? 0) < 0 ? 'text-destructive' : ''
                    }`}>
                      {row.variance_display
                        ? <>
                            {row.variance_display}
                            {row.variance_value_cents != null && (
                              <span className="block text-xs">
                                {formatCurrency(row.variance_value_cents / 100)}
                              </span>
                            )}
                          </>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {drillDown && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <Card className="mt-10 w-full max-w-3xl">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{drillDown.name}</CardTitle>
                  <CardDescription>Everything that moved this period.</CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDrillDown(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Opening', drillDown.opening_display],
                  ['Received', drillDown.received_display],
                  ['Used by sales', drillDown.used_by_sales_display],
                  ['Wastage', drillDown.wastage_display],
                  ['Adjustments', drillDown.adjustments_display],
                  ['Expected now', drillDown.expected_display],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs uppercase text-muted-foreground">{label}</p>
                    <p className="mt-1 font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Movements</p>
                {loadingMovements ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
                ) : (movements ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nothing has moved yet.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="px-3 py-2">When</th>
                          <th className="px-3 py-2">What happened</th>
                          <th className="px-3 py-2 text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(movements ?? []).map((m) => (
                          <tr key={m.id} className="border-b last:border-0">
                            <td className="px-3 py-2 text-muted-foreground">
                              {m.occurred_at ? new Date(m.occurred_at).toLocaleString() : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}
                              {m.notes && (
                                <span className="block text-xs text-muted-foreground">{m.notes}</span>
                              )}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums ${
                              m.quantity_milli < 0 ? 'text-destructive' : 'text-emerald-600'
                            }`}>
                              {m.quantity_milli > 0 ? '+' : ''}
                              {(m.quantity_milli / 1000).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Ledger movement types translated into what a restaurant would actually
 * say. The enum values are an engineering detail and have no business on a
 * manager's screen.
 */
const MOVEMENT_LABELS: Record<string, string> = {
  OPENING_BALANCE: 'Opening stock',
  GOODS_RECEIVED: 'Delivery received',
  SALE_CONSUMPTION: 'Used by a sale',
  SALE_REVERSAL: 'Sale reversed',
  REMAKE_CONSUMPTION: 'Used by a remake',
  WASTAGE: 'Wastage',
  STAFF_MEAL: 'Staff meal',
  COMPLIMENTARY: 'Complimentary',
  MANUAL_ADJUSTMENT: 'Manual adjustment',
  STOCKTAKE_ADJUSTMENT: 'Stocktake correction',
  SUPPLIER_RETURN: 'Returned to supplier',
};
