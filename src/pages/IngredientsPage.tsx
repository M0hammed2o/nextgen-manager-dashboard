import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Ingredient } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import { AlertTriangle, EyeOff, Loader2, Package, Pencil, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Ingredient management — the reference data every other part of the stock
 * system depends on.
 *
 * The form is built around the two things that most often get entered wrong
 * and silently destroy variance accuracy:
 *
 *  1. Canonical unit vs purchase unit. Cheese is *stored* in grams but
 *     *bought* in 2 kg bags. Both are captured, so goods receiving can say
 *     "5 bags" and the ledger still records 10 000 g.
 *  2. Count method. Whether a half-full cheese bag is counted as "0.5" or
 *     weighed decides whether cheese ever reconciles, so staff are told
 *     explicitly on the count sheet.
 */

const UNITS: { value: string; label: string; hint: string }[] = [
  { value: 'GRAM', label: 'Weight (g)', hint: 'Cheese, chicken, flour' },
  { value: 'MILLILITRE', label: 'Volume (ml)', hint: 'Oil, poured sauces' },
  { value: 'UNIT', label: 'Counted whole', hint: 'Portions, dough balls, boxes, cans' },
];

const COUNT_METHODS: { value: string; label: string; hint: string }[] = [
  { value: 'UNIT_COUNT', label: 'Count items', hint: 'Count whole items' },
  { value: 'WEIGHT', label: 'Weigh it', hint: 'Put it on a scale' },
  { value: 'VOLUME', label: 'Measure volume', hint: 'Measure the volume' },
];

// Pack units offered per measurement family. A pack must be in the same
// family as the ingredient itself, or the API (correctly) rejects the
// conversion — so we never show kg against a countable portion.
const PACK_UNITS_BY_FAMILY: Record<string, string[]> = {
  GRAM: ['KG', 'G'],
  MILLILITRE: ['L', 'ML'],
  UNIT: ['UNIT', 'PORTION', 'BOX', 'SACHET', 'BOTTLE', 'BALL', 'CAN'],
};

export default function IngredientsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    canonical_unit: 'GRAM',
    count_method: 'WEIGHT',
    unit_label: '',
    category: '',
    purchase_unit_name: '',
    purchase_pack_quantity: '1',
    purchase_pack_unit: 'KG',
    cost_per_pack_cents: '',
    par_level_quantity: '',
  });

  const blankForm = () => ({
    name: '', canonical_unit: 'GRAM', count_method: 'WEIGHT',
    unit_label: '', category: '',
    purchase_unit_name: '', purchase_pack_quantity: '1', purchase_pack_unit: 'KG',
    cost_per_pack_cents: '', par_level_quantity: '',
  });

  /**
   * Load an existing ingredient into the form.
   *
   * Quantities come back from the API in canonical milli-units, so they are
   * converted to the unit the owner actually typed. Editing must never be a
   * delete-and-recreate: the stock ledger references ingredients with ON
   * DELETE RESTRICT precisely so history survives, and recreating one would
   * orphan every past movement from the name it was recorded against.
   */
  function startEdit(item: Ingredient) {
    const packUnit =
      item.canonical_unit === 'GRAM' ? 'KG'
        : item.canonical_unit === 'MILLILITRE' ? 'L'
          : (item.unit_label ? item.unit_label.toUpperCase() : 'UNIT');
    const divisor =
      item.canonical_unit === 'GRAM' || item.canonical_unit === 'MILLILITRE'
        ? 1000 * 1000   // milli -> kg / L
        : 1000;         // milli -> whole units
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      name: item.name,
      canonical_unit: item.canonical_unit,
      count_method: item.count_method,
      unit_label: item.unit_label ?? '',
      category: item.category ?? '',
      purchase_unit_name: item.purchase_unit_name ?? '',
      purchase_pack_quantity: String(item.purchase_pack_milli / divisor),
      purchase_pack_unit: PACK_UNITS_BY_FAMILY[item.canonical_unit]?.includes(packUnit)
        ? packUnit
        : (PACK_UNITS_BY_FAMILY[item.canonical_unit]?.[0] ?? 'UNIT'),
      cost_per_pack_cents:
        item.cost_per_pack_cents != null ? String(item.cost_per_pack_cents / 100) : '',
      par_level_quantity:
        item.par_level_milli != null ? String(item.par_level_milli / divisor) : '',
    });
  }

  const { data: ingredients, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiClient.get<Ingredient[]>('/v1/business/inventory/ingredients'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post<Ingredient>('/v1/business/inventory/ingredients', {
        name: form.name.trim(),
        canonical_unit: form.canonical_unit,
        count_method: form.count_method,
        unit_label: form.unit_label.trim() || null,
        category: form.category.trim() || null,
        purchase_unit_name: form.purchase_unit_name.trim() || null,
        purchase_pack_quantity: form.purchase_pack_quantity || '1',
        purchase_pack_unit: form.purchase_pack_unit,
        cost_per_pack_cents: form.cost_per_pack_cents
          ? Math.round(parseFloat(form.cost_per_pack_cents) * 100)
          : null,
        par_level_quantity: form.par_level_quantity || null,
        par_level_unit: form.par_level_quantity ? form.purchase_pack_unit : null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      setShowForm(false);
      setForm({
        name: '', canonical_unit: 'GRAM', count_method: 'WEIGHT',
        unit_label: '', category: '',
        purchase_unit_name: '', purchase_pack_quantity: '1', purchase_pack_unit: 'KG',
        cost_per_pack_cents: '', par_level_quantity: '',
      });
      toast({ title: 'Ingredient added', description: `${created.name} is ready to use in recipes.` });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not add that', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch<Ingredient>(`/v1/business/inventory/ingredients/${editingId}`, {
        name: form.name.trim(),
        count_method: form.count_method,
        unit_label: form.unit_label.trim() || null,
        category: form.category.trim() || null,
        purchase_unit_name: form.purchase_unit_name.trim() || null,
        purchase_pack_quantity: form.purchase_pack_quantity || '1',
        purchase_pack_unit: form.purchase_pack_unit,
        cost_per_pack_cents: form.cost_per_pack_cents
          ? Math.round(parseFloat(form.cost_per_pack_cents) * 100)
          : null,
        par_level_quantity: form.par_level_quantity || null,
        par_level_unit: form.par_level_quantity ? form.purchase_pack_unit : null,
      }),
    onSuccess: (updated) => {
      // Cost changes affect FUTURE movements only — existing ledger rows keep
      // the cost snapshotted when they were posted, so history never reprices.
      ['ingredients', 'stock-levels', 'live-stock', 'recipes', 'setup-progress']
        .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      setShowForm(false);
      setEditingId(null);
      setForm(blankForm());
      toast({ title: 'Ingredient updated', description: `${updated.name} saved.` });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/v1/business/inventory/ingredients/${id}`, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast({
        title: 'Ingredient hidden',
        description: 'It stays on past stock records, but will not appear on new counts.',
      });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not hide it', description: err.message, variant: 'destructive' }),
  });

  const isEditing = editingId !== null;
  const saving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    // The module is opt-in per tenant; say so plainly rather than showing a
    // bare error to an owner who simply hasn't bought it.
    if (message.includes('INVENTORY_NOT_ENABLED') || message.includes('not enabled')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Ingredients</h1>
          <Card>
            <CardContent className="py-8 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">Stock tracking is not switched on</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask NextGen to enable the inventory module for this restaurant.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Ingredients</h1>
        <p className="text-sm text-destructive">Could not load ingredients: {message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    );
  }

  const list = ingredients ?? [];
  const belowPar = list.filter((i) => i.below_par);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ingredients</h1>
          <p className="text-sm text-muted-foreground">
            What you physically stock. Recipes consume these.
          </p>
        </div>
        <Button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setEditingId(null);
              setForm(blankForm());
            } else {
              setEditingId(null);
              setForm(blankForm());
              setShowForm(true);
            }
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {showForm ? 'Cancel' : 'Add ingredient'}
        </Button>
      </div>

      {belowPar.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-warning" />
            <div>
              <p className="text-sm font-medium">
                {belowPar.length} ingredient{belowPar.length === 1 ? ' is' : 's are'} below par level
              </p>
              <p className="text-sm text-muted-foreground">
                {belowPar.map((i) => i.name).join(', ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? 'Edit ingredient' : 'New ingredient'}</CardTitle>
            <CardDescription>
              How it is stored, how it is bought, and how staff should count it.
              {isEditing && ' Changing the cost affects future stock value only — past records keep the cost they were recorded at.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Cheese"
                />
              </div>
              <div>
                <Label htmlFor="unit">How is it measured?</Label>
                <select
                  id="unit"
                  value={form.canonical_unit}
                  disabled={isEditing}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      canonical_unit: e.target.value,
                      // Keep the pack unit in the same family, or the API
                      // will (correctly) reject the conversion.
                      purchase_pack_unit:
                        e.target.value === 'GRAM' ? 'KG'
                          : e.target.value === 'MILLILITRE' ? 'L' : 'UNIT',
                      count_method:
                        e.target.value === 'GRAM' ? 'WEIGHT'
                          : e.target.value === 'MILLILITRE' ? 'VOLUME' : 'UNIT_COUNT',
                    })
                  }
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label} — {u.hint}</option>
                  ))}
                </select>
                {isEditing && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    How something is measured cannot change once stock has been recorded
                    against it — past movements are stored in this unit.
                  </p>
                )}
              </div>
            </div>

            {form.canonical_unit === 'UNIT' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="unitlabel">What do you call one?</Label>
                  <Input
                    id="unitlabel"
                    value={form.unit_label}
                    onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
                    placeholder="portion, box, sachet, ball…"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used everywhere stock is shown, so your screens read
                    "72 {form.unit_label.trim() ? `${form.unit_label.trim()}s` : 'portions'}"
                    instead of a bare number.
                  </p>
                </div>
                <div>
                  <Label htmlFor="cat">Group (optional)</Label>
                  <Input
                    id="cat"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Dairy, Packaging, Dough…"
                  />
                </div>
              </div>
            )}
            {form.canonical_unit !== 'UNIT' && (
              <div className="md:w-1/2">
                <Label htmlFor="cat2">Group (optional)</Label>
                <Input
                  id="cat2"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Dairy, Packaging, Dry Goods…"
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="packname">Pack description</Label>
                <Input
                  id="packname"
                  value={form.purchase_unit_name}
                  onChange={(e) => setForm({ ...form, purchase_unit_name: e.target.value })}
                  placeholder="2 kg bag"
                />
              </div>
              <div>
                <Label htmlFor="packqty">One pack holds</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="packqty"
                    value={form.purchase_pack_quantity}
                    onChange={(e) => setForm({ ...form, purchase_pack_quantity: e.target.value })}
                    placeholder="2"
                  />
                  <select
                    value={form.purchase_pack_unit}
                    onChange={(e) => setForm({ ...form, purchase_pack_unit: e.target.value })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {(PACK_UNITS_BY_FAMILY[form.canonical_unit] ?? ['UNIT']).map((u) => (
                      <option key={u} value={u}>{u.toLowerCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="cost">Pack cost (R)</Label>
                <Input
                  id="cost"
                  value={form.cost_per_pack_cents}
                  onChange={(e) => setForm({ ...form, cost_per_pack_cents: e.target.value })}
                  placeholder="190.00"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="count">How should staff count it?</Label>
                <select
                  id="count"
                  value={form.count_method}
                  onChange={(e) => setForm({ ...form, count_method: e.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {COUNT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shown on the count sheet. Counting a half-full bag as "0.5" when it
                  should be weighed is the most common cause of an unexplainable variance.
                </p>
              </div>
              <div>
                <Label htmlFor="par">Reorder level (optional)</Label>
                <Input
                  id="par"
                  value={form.par_level_quantity}
                  onChange={(e) => setForm({ ...form, par_level_quantity: e.target.value })}
                  placeholder={`In ${form.purchase_pack_unit}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
                disabled={!form.name.trim() || saving}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save changes' : 'Add ingredient'}
              </Button>
              {isEditing && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm(blankForm());
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="py-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">No ingredients yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the things you stock, then build recipes from them.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Ingredient</th>
                    <th className="px-4 py-3">On hand</th>
                    <th className="px-4 py-3">Counted in</th>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Pack</th>
                    <th className="px-4 py-3 text-right">Pack cost</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">
                        <span className={item.below_par ? 'font-semibold text-warning' : ''}>
                          {item.on_hand_display}
                        </span>
                        {item.below_par && <span className="ml-2 text-xs text-warning">low</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.unit_label
                          ? `${item.unit_label}s`
                          : item.canonical_unit === 'GRAM' ? 'grams'
                            : item.canonical_unit === 'MILLILITRE' ? 'millilitres' : 'units'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.purchase_unit_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {item.cost_per_pack_cents != null
                          ? formatCurrency(item.cost_per_pack_cents / 100)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                          {item.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deactivateMutation.mutate(item.id)}
                              disabled={deactivateMutation.isPending}
                              title="Stop using this ingredient without losing its history"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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
