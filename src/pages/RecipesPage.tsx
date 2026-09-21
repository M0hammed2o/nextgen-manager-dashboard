import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Ingredient, Recipe } from '@/types/inventory';
import type { MenuItem } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import {
  AlertTriangle, CheckCircle2, ChefHat, Copy, Loader2, Plus, Trash2, XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RecipeCoverageItem {
  menu_item_id: string;
  name: string;
  is_active: boolean;
  status: 'complete' | 'incomplete' | 'none';
  line_count: number;
  sizes_total: number;
  sizes_covered: number;
  message: string;
}

interface RecipeCoverage {
  total_items: number;
  complete: number;
  incomplete: number;
  missing: number;
  items: RecipeCoverageItem[];
}

interface DraftLine {
  ingredient_id: string;
  quantity: string;
  unit: string;
  option_id: string;
  removable_ref_id: string;
}

const UNIT_CHOICES: Record<string, string[]> = {
  GRAM: ['G', 'KG'],
  MILLILITRE: ['ML', 'L'],
  UNIT: ['UNIT'],
};

/**
 * Recipe builder.
 *
 * Two things here exist specifically because of how this platform models a
 * menu, and getting either wrong makes variance meaningless:
 *
 *  1. SIZE. A small and a large pizza are the SAME menu item with an option
 *     group, so a line can be scoped to one option. That is how a Large
 *     deducts 150 g of cheese where a Small deducts 100 g.
 *  2. REMOVALS. A line can be tied to a removable ingredient, so "no
 *     mushroom" deducts no mushroom at all rather than a reduced amount.
 *
 * Live food cost is shown while editing because it doubles as a correctness
 * check: a line entered as 150 kg instead of 150 g shows up instantly as an
 * absurd cost per portion, long before it corrupts a variance report.
 */
export default function RecipesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState('');
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyTo, setCopyTo] = useState('');

  const { data: recipes, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => apiClient.get<Recipe[]>('/v1/business/recipes'),
  });

  // Server-side completeness. Computed there rather than here because the
  // subtle case — an item WITH a recipe whose sizes are not all scoped —
  // needs to know which options exist, and getting it wrong would tell a
  // manager they are ready when some sizes silently deduct nothing.
  const { data: coverage } = useQuery({
    queryKey: ['recipe-coverage'],
    queryFn: () => apiClient.get<RecipeCoverage>('/v1/business/setup/recipe-coverage'),
  });

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiClient.get<Ingredient[]>('/v1/business/inventory/ingredients'),
  });

  const { data: menuItems } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => apiClient.get<MenuItem[]>('/v1/business/menu/items'),
  });

  const selectedItem = useMemo(
    () => (menuItems ?? []).find((m) => m.id === selectedItemId),
    [menuItems, selectedItemId]
  );

  // Options and removable ingredients this menu item actually offers — a
  // recipe line can only be scoped to something that exists on the item.
  const optionChoices = useMemo(() => {
    const groups = (selectedItem?.options_json?.option_groups ?? []) as Array<{
      id: string; name: string; options?: Array<{ id: string; name: string }>;
    }>;
    return groups.flatMap((g) =>
      (g.options ?? []).map((o) => ({ id: o.id, label: `${g.name}: ${o.name}`, groupId: g.id }))
    );
  }, [selectedItem]);

  const removableChoices = useMemo(
    () =>
      ((selectedItem?.options_json?.removable_ingredients ?? []) as Array<{
        id: string; name: string;
      }>) ?? [],
    [selectedItem]
  );

  const existing = useMemo(
    () => (recipes ?? []).find((r) => r.menu_item_id === selectedItemId),
    [recipes, selectedItemId]
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put<Recipe>('/v1/business/recipes', {
        menu_item_id: selectedItemId,
        yield_qty: 1,
        items: draft
          .filter((l) => l.ingredient_id && l.quantity)
          .map((l, index) => ({
            ingredient_id: l.ingredient_id,
            quantity: l.quantity,
            unit: l.unit,
            option_id: l.option_id || null,
            option_group_id:
              optionChoices.find((o) => o.id === l.option_id)?.groupId ?? null,
            removable_ref_id: l.removable_ref_id || null,
            sort_order: index,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['setup-progress'] });
      setDraft([]);
      setSelectedItemId('');
      toast({ title: 'Recipe saved', description: 'Sales of this item will now consume stock.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save recipe', description: e.message, variant: 'destructive' }),
  });

  /**
   * Copy every line scoped to one size onto another size.
   *
   * Franchise recipes are structurally near-identical between sizes — same
   * ingredients, different portions — so building Large from Small and
   * adjusting two numbers is far less error-prone than retyping the lot.
   * Lines that apply to every size are left alone; copying them would create
   * duplicates that double-deduct.
   */
  function copyBetweenSizes(fromOptionId: string, toOptionId: string) {
    if (!fromOptionId || !toOptionId || fromOptionId === toOptionId) return;
    const source = draft.filter((l) => l.option_id === fromOptionId);
    if (source.length === 0) {
      toast({
        title: 'Nothing to copy',
        description: 'That size has no ingredients of its own yet.',
      });
      return;
    }
    const kept = draft.filter((l) => l.option_id !== toOptionId);
    setDraft([...kept, ...source.map((l) => ({ ...l, option_id: toOptionId }))]);
    toast({
      title: 'Copied',
      description: `${source.length} ingredient line(s) copied. Adjust the quantities.`,
    });
  }

  function loadExisting() {
    if (!existing) return;
    setDraft(
      existing.items.map((item) => ({
        ingredient_id: item.ingredient_id,
        quantity: String(item.quantity_milli / 1000),
        unit: item.canonical_unit === 'GRAM' ? 'G' : item.canonical_unit === 'MILLILITRE' ? 'ML' : 'UNIT',
        option_id: item.option_id ?? '',
        removable_ref_id: item.removable_ref_id ?? '',
      }))
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = (error as Error).message ?? '';
    if (message.includes('INVENTORY_NOT_ENABLED') || message.includes('not enabled')) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Recipes</h1>
          <Card><CardContent className="py-8 text-center">
            <p className="font-medium">Stock tracking is not switched on</p>
          </CardContent></Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="text-sm text-destructive">Could not load recipes: {message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    );
  }

  const itemsWithRecipes = new Set((recipes ?? []).map((r) => r.menu_item_id));
  const missing = (menuItems ?? []).filter((m) => !itemsWithRecipes.has(m.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="text-sm text-muted-foreground">
          What each menu item consumes. This is what turns a sale into stock usage.
        </p>
      </div>

      {coverage && (
        <Card>
          <CardHeader>
            <CardTitle>Recipe status</CardTitle>
            <CardDescription>
              An item with no recipe still sells — it just does not reduce any stock, so your
              expected figures will be too high.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase text-muted-foreground">Ready</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                  {coverage.complete}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase text-muted-foreground">Some sizes missing</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">
                  {coverage.incomplete}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase text-muted-foreground">No recipe</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">
                  {coverage.missing}
                </p>
              </div>
            </div>

            {coverage.items.filter((i) => i.status !== 'complete').length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Menu item</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">What is missing</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.items.filter((i) => i.status !== 'complete').map((item) => (
                      <tr key={item.menu_item_id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.name}</td>
                        <td className="px-3 py-2">
                          {item.status === 'none' ? (
                            <span className="flex items-center gap-1.5 text-destructive">
                              <XCircle className="h-3.5 w-3.5" /> No recipe
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-600">
                              <AlertTriangle className="h-3.5 w-3.5" /> Incomplete
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.message}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="outline" size="sm"
                            onClick={() => { setSelectedItemId(item.menu_item_id); setDraft([]); }}>
                            Build it
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {coverage.items.length > 0 && coverage.missing === 0 && coverage.incomplete === 0 && (
              <p className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Every menu item has a complete recipe.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Build a recipe</CardTitle>
          <CardDescription>
            Leave "applies to" blank for ingredients used on every size.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="item">Menu item</Label>
              <select
                id="item"
                value={selectedItemId}
                onChange={(e) => { setSelectedItemId(e.target.value); setDraft([]); }}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose an item…</option>
                {(menuItems ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{itemsWithRecipes.has(m.id) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
            {existing && draft.length === 0 && (
              <Button variant="outline" onClick={loadExisting}>
                Load current recipe
              </Button>
            )}
          </div>

          {selectedItemId && (
            <>
              {draft.map((line, index) => {
                const ingredient = (ingredients ?? []).find((i) => i.id === line.ingredient_id);
                const units = ingredient ? UNIT_CHOICES[ingredient.canonical_unit] : ['G'];
                return (
                  <div key={index} className="grid gap-2 lg:grid-cols-[2fr_1fr_auto_2fr_2fr_auto]">
                    <select
                      value={line.ingredient_id}
                      onChange={(e) => {
                        const next = [...draft];
                        const chosen = (ingredients ?? []).find((i) => i.id === e.target.value);
                        next[index] = {
                          ...line,
                          ingredient_id: e.target.value,
                          unit: chosen ? UNIT_CHOICES[chosen.canonical_unit][0] : 'G',
                        };
                        setDraft(next);
                      }}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Ingredient…</option>
                      {(ingredients ?? []).map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                    <Input
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...draft];
                        next[index] = { ...line, quantity: e.target.value };
                        setDraft(next);
                      }}
                      placeholder="150"
                    />
                    <select
                      value={line.unit}
                      onChange={(e) => {
                        const next = [...draft];
                        next[index] = { ...line, unit: e.target.value };
                        setDraft(next);
                      }}
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <select
                      value={line.option_id}
                      onChange={(e) => {
                        const next = [...draft];
                        next[index] = { ...line, option_id: e.target.value };
                        setDraft(next);
                      }}
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      title="Only consume this when a particular option is chosen"
                    >
                      <option value="">Applies to every option</option>
                      {optionChoices.map((o) => (
                        <option key={o.id} value={o.id}>Only when: {o.label}</option>
                      ))}
                    </select>
                    <select
                      value={line.removable_ref_id}
                      onChange={(e) => {
                        const next = [...draft];
                        next[index] = { ...line, removable_ref_id: e.target.value };
                        setDraft(next);
                      }}
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      title="Skip this line when the customer removes that ingredient"
                    >
                      <option value="">Never removed</option>
                      {removableChoices.map((r) => (
                        <option key={r.id} value={r.id}>Skip if "no {r.name}"</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}

              {optionChoices.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                  <span className="text-sm font-medium">Copy from</span>
                  <select
                    value={copyFrom}
                    onChange={(e) => setCopyFrom(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">choose a size…</option>
                    {optionChoices.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <span className="text-sm font-medium">to</span>
                  <select
                    value={copyTo}
                    onChange={(e) => setCopyTo(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">choose a size…</option>
                    {optionChoices.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyBetweenSizes(copyFrom, copyTo)}
                    disabled={!copyFrom || !copyTo || copyFrom === copyTo}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Then adjust the portions for the new size.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setDraft([
                      ...draft,
                      { ingredient_id: '', quantity: '', unit: 'G', option_id: '', removable_ref_id: '' },
                    ])
                  }
                >
                  <Plus className="mr-2 h-4 w-4" /> Add ingredient
                </Button>
                {draft.length > 0 && (
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !draft.some((l) => l.ingredient_id && l.quantity)}
                  >
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save recipe
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current recipes</CardTitle>
          <CardDescription>
            Food cost is per portion. Option-scoped lines are costed separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(recipes ?? []).length === 0 ? (
            <div className="py-8 text-center">
              <ChefHat className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">No recipes yet</p>
            </div>
          ) : (
            (recipes ?? []).map((recipe) => {
              const item = (menuItems ?? []).find((m) => m.id === recipe.menu_item_id);
              return (
                <div key={recipe.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{item?.name ?? 'Add-on recipe'}</p>
                    <p className="text-sm text-muted-foreground">
                      Food cost {formatCurrency(recipe.base_food_cost_cents / 100)}
                      {recipe.max_food_cost_cents !== recipe.base_food_cost_cents &&
                        ` – ${formatCurrency(recipe.max_food_cost_cents / 100)}`}
                      {item?.price_cents ? (
                        <span className="ml-2">
                          ({Math.round((recipe.max_food_cost_cents / item.price_cents) * 100)}% of price)
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {recipe.items.map((line) => (
                      <li key={line.id} className="flex justify-between gap-4">
                        <span>
                          {line.ingredient_name} — {line.quantity_display}
                          {line.option_id && <span className="ml-1 text-xs">(option only)</span>}
                          {line.removable_ref_id && <span className="ml-1 text-xs">(removable)</span>}
                        </span>
                        <span className="tabular-nums">{formatCurrency(line.cost_cents / 100)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
