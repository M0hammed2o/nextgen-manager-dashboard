import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Ingredient, StockLevel } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { Loader2, Truck, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReceiptLine {
  ingredient_id: string;
  quantity: string;
  unit: string;
  cost: string;
}

/**
 * Stock levels and goods receiving.
 *
 * The receiving form asks for what was COUNTED on arrival, never what was
 * ordered — there is deliberately no "expected quantity" field to copy from.
 * Receiving at ordered quantity is one of the top causes of a variance that
 * only surfaces weeks later, by which point nobody can explain it.
 *
 * "packs" is the default unit because that is how deliveries actually
 * arrive ("five bags of cheese"), and the backend converts using the
 * ingredient's own pack size so the person receiving never does mental
 * arithmetic that could be wrong.
 */
export default function StockPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [reference, setReference] = useState('');

  const { data: levels, isLoading, error } = useQuery({
    queryKey: ['stock-levels'],
    queryFn: () => apiClient.get<StockLevel[]>('/v1/business/inventory/stock'),
  });

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiClient.get<Ingredient[]>('/v1/business/inventory/ingredients'),
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/v1/business/inventory/goods-receipts', {
        reference: reference.trim() || null,
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
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      setLines([]);
      setReference('');
      toast({ title: 'Delivery recorded', description: 'Stock levels updated.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not record that', description: err.message, variant: 'destructive' }),
  });

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.includes('INVENTORY_NOT_ENABLED') || message.includes('not enabled')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Stock</h1>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="font-medium">Stock tracking is not switched on</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask NextGen to enable the inventory module for this restaurant.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <p className="text-sm text-destructive">Could not load stock: {message}</p>;
  }

  const rows = levels ?? [];
  const totalValue = rows.reduce((sum, r) => sum + r.value_cents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock</h1>
        <p className="text-sm text-muted-foreground">
          Current levels, derived from the movement ledger — not a stored number that could drift.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase text-muted-foreground">Stock value</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(totalValue / 100)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase text-muted-foreground">Ingredients tracked</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase text-muted-foreground">Below par</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {rows.filter((r) => r.below_par).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Record a delivery
          </CardTitle>
          <CardDescription>
            Enter what you actually counted on arrival — not what was ordered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <Label htmlFor="ref">Delivery note / invoice no.</Label>
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="INV-10432"
            />
          </div>

          {lines.map((line, index) => (
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
                  <option key={i.id} value={i.id}>
                    {i.name}{i.purchase_unit_name ? ` (${i.purchase_unit_name})` : ''}
                  </option>
                ))}
              </select>
              <Input
                value={line.quantity}
                onChange={(e) => {
                  const next = [...lines];
                  next[index] = { ...line, quantity: e.target.value };
                  setLines(next);
                }}
                placeholder="Counted"
              />
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
                <option value="KG">kg</option>
                <option value="G">g</option>
                <option value="L">L</option>
                <option value="ML">ml</option>
                <option value="UNIT">units</option>
              </select>
              <Input
                value={line.cost}
                onChange={(e) => {
                  const next = [...lines];
                  next[index] = { ...line, cost: e.target.value };
                  setLines(next);
                }}
                placeholder="Cost R"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                aria-label="Remove line"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setLines([...lines, { ingredient_id: '', quantity: '', unit: 'PACK', cost: '' }])
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add line
            </Button>
            {lines.length > 0 && (
              <Button
                onClick={() => receiveMutation.mutate()}
                disabled={
                  receiveMutation.isPending ||
                  !lines.some((l) => l.ingredient_id && l.quantity)
                }
              >
                {receiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record delivery
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3">Ingredient</th>
                  <th className="px-4 py-3">On hand</th>
                  <th className="px-4 py-3">Par level</th>
                  <th className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No ingredients set up yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.ingredient_id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3">
                        <span className={row.below_par ? 'font-semibold text-amber-600' : ''}>
                          {row.on_hand_display}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.par_level_milli != null ? (row.par_level_milli / 1000).toString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(row.value_cents / 100)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
