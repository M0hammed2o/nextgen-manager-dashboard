import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Sheet = 'menu' | 'ingredients' | 'recipes';

interface RowError { row: number; message: string }

interface PreviewResult {
  template_columns: string[];
  detected_columns?: string[];
  total_rows: number;
  valid_items?: number;
  valid_rows?: number;
  error_count: number;
  errors: RowError[];
  preview: Record<string, unknown>[];
  would_create?: number | string[];
  would_update?: number;
  would_skip_existing?: string[];
  recipes?: { menu_item_name: string; lines: number }[];
}

const SHEETS: Record<Sheet, {
  title: string;
  blurb: string;
  columns: { name: string; required: boolean; hint: string }[];
  example: string;
}> = {
  menu: {
    title: 'Menu',
    blurb: 'Your items, prices and sizes. One row per size.',
    columns: [
      { name: 'category', required: false, hint: 'Pizza, Drinks…' },
      { name: 'name', required: true, hint: 'Margherita' },
      { name: 'description', required: false, hint: 'Shown on screen' },
      { name: 'price', required: true, hint: 'The price a customer pays' },
      { name: 'size', required: false, hint: 'Small / Medium / Large' },
      { name: 'active', required: false, hint: 'no to hide it' },
    ],
    example:
      'category,name,description,price,size\n' +
      'Pizza,Margherita,Tomato and cheese,89.00,Small\n' +
      'Pizza,Margherita,Tomato and cheese,149.00,Large\n' +
      'Drinks,Coca-Cola 330ml,,22.00,\n',
  },
  ingredients: {
    title: 'Ingredients',
    blurb: 'What you stock, in the units you actually count.',
    columns: [
      { name: 'name', required: true, hint: 'Cheese Portion' },
      { name: 'unit', required: true, hint: 'portion, box, g, kg, ml, L' },
      { name: 'unit_label', required: false, hint: 'What you call one — portion, box' },
      { name: 'category', required: false, hint: 'Dairy, Packaging…' },
      { name: 'pack_size', required: false, hint: 'How much is in one pack' },
      { name: 'pack_unit', required: false, hint: 'kg, portion, box' },
      { name: 'pack_cost', required: false, hint: 'What one pack costs' },
      { name: 'par_level', required: false, hint: 'Reorder level' },
      { name: 'opening_quantity', required: false, hint: 'Starting stock, in the unit column above — posts through the ledger, same as the Opening Stock page' },
    ],
    example:
      'name,unit,unit_label,category,pack_size,pack_unit,pack_cost,opening_quantity\n' +
      'Cheese Portion,portion,portion,Dairy,1,portion,15.00,20\n' +
      'Large Dough Ball,portion,portion,Dough,1,portion,6.50,40\n' +
      'Flour,g,,Dry Goods,1,kg,18.00,15000\n',
  },
  recipes: {
    title: 'Recipes',
    blurb: 'What each menu item uses. One row per ingredient, per size.',
    columns: [
      { name: 'menu_item', required: true, hint: 'Must match a menu item exactly' },
      { name: 'ingredient', required: true, hint: 'Must match an ingredient exactly' },
      { name: 'quantity', required: true, hint: '1, 150, 20' },
      { name: 'unit', required: true, hint: 'portion, box, g — never guessed' },
      { name: 'option_id', required: false, hint: 'size-large, for size-only lines' },
      { name: 'removable_id', required: false, hint: 'Skip when removed' },
    ],
    example:
      'menu_item,ingredient,quantity,unit,option_id\n' +
      'Margherita,Large Dough Ball,1,portion,size-large\n' +
      'Margherita,Cheese Portion,2,portion,size-large\n' +
      'Margherita,Flour,20,g,\n',
  },
};

/**
 * Spreadsheet import for a restaurant's own menu, ingredients and recipes.
 *
 * Upload -> map columns -> preview -> confirm. Nothing touches live data
 * until the manager presses Import, and a file with ANY bad row imports
 * nothing rather than most of itself: a menu that looks complete and is
 * silently missing four items is worse than an import that refused and said
 * which rows to fix.
 */
export default function ImportPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sheet, setSheet] = useState<Sheet>('menu');
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; errors: RowError[] } | null>(null);

  const spec = SHEETS[sheet];
  const knownColumns = useMemo(() => spec.columns.map((c) => c.name), [spec]);

  // Headings we did not recognise — exactly the ones worth offering a mapping
  // control for, so the manager is not asked to re-map columns already correct.
  const unmapped = useMemo(() => {
    if (!preview?.detected_columns) return [];
    return preview.detected_columns.filter((c) => !knownColumns.includes(c));
  }, [preview, knownColumns]);

  function reset(next?: Sheet) {
    setFile(null);
    setPreview(null);
    setMapping({});
    setFailure(null);
    if (next) setSheet(next);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function runPreview(chosen?: File, withMapping?: Record<string, string>) {
    const target = chosen ?? file;
    if (!target) return;
    setBusy(true);
    setFailure(null);
    try {
      const form = new FormData();
      form.append('file', target);
      const map = withMapping ?? mapping;
      if (Object.keys(map).length) form.append('mapping', JSON.stringify(map));
      const result = await apiClient.postForm<PreviewResult>(
        `/v1/business/import/${sheet}/preview`, form
      );
      setPreview(result);
    } catch (err) {
      const e = err as ApiError;
      setFailure({ message: e.message, errors: [] });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setFailure(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (Object.keys(mapping).length) form.append('mapping', JSON.stringify(mapping));
      const result = await apiClient.postForm<Record<string, number>>(
        `/v1/business/import/${sheet}/commit`, form
      );
      const summary = Object.entries(result)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
        .join(', ');
      toast({
        title: `${spec.title} imported`,
        description: summary || 'Nothing needed changing.',
      });
      // Everything downstream reads this data, so refresh it all.
      ['menu-items', 'ingredients', 'recipes', 'stock-levels', 'live-stock',
        'setup-progress', 'recipe-coverage'].forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      reset();
    } catch (err) {
      const e = err as ApiError & { details?: { errors?: RowError[] } };
      setFailure({ message: e.message, errors: e.details?.errors ?? [] });
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([spec.example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nextgen-${sheet}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const validCount = preview?.valid_items ?? preview?.valid_rows ?? 0;
  const canImport = preview && preview.error_count === 0 && validCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import from a spreadsheet</h1>
        <p className="text-sm text-muted-foreground">
          Upload your own menu, ingredient or recipe sheet. Nothing changes until you confirm.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SHEETS) as Sheet[]).map((key) => (
          <Button
            key={key}
            variant={sheet === key ? 'default' : 'outline'}
            onClick={() => reset(key)}
          >
            {SHEETS[key].title}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{spec.title} sheet</CardTitle>
          <CardDescription>{spec.blurb}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Required</th>
                  <th className="px-3 py-2">Example</th>
                </tr>
              </thead>
              <tbody>
                {spec.columns.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                    <td className="px-3 py-2">
                      {c.required
                        ? <span className="text-xs font-medium text-destructive">required</span>
                        : <span className="text-xs text-muted-foreground">optional</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Download a template
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                setPreview(null);
                setMapping({});
                setFailure(null);
                if (chosen) void runPreview(chosen, {});
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Choose a file
            </Button>
            {file && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {file.name}
                <button onClick={() => reset()} aria-label="Clear file">
                  <X className="h-4 w-4" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Accepts .csv and .xlsx. Your column headings do not have to match ours — you
            can map them in the next step.
          </p>
        </CardContent>
      </Card>

      {failure && (
        <Card className="border-destructive/50">
          <CardContent className="space-y-3 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> {failure.message}
            </p>
            {failure.errors.length > 0 && (
              <ul className="space-y-1 text-sm">
                {failure.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">Row {e.row}:</span>{' '}
                    <span className="text-muted-foreground">{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Nothing was imported. Fix your spreadsheet and upload it again.
            </p>
          </CardContent>
        </Card>
      )}

      {preview && unmapped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Match your columns</CardTitle>
            <CardDescription>
              We did not recognise these headings. Tell us what they mean, or leave them ignored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unmapped.map((column) => (
              <div key={column} className="flex flex-wrap items-center gap-3">
                <Label className="min-w-[10rem] font-mono text-xs">{column}</Label>
                <select
                  value={mapping[column] ?? ''}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[column] = e.target.value;
                    else delete next[column];
                    setMapping(next);
                    void runPreview(undefined, next);
                  }}
                  className="h-10 min-w-[14rem] rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Ignore this column</option>
                  {spec.columns.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  {preview.total_rows} row{preview.total_rows === 1 ? '' : 's'} read
                  {validCount ? ` · ${validCount} ready to import` : ''}
                  {preview.error_count ? ` · ${preview.error_count} need fixing` : ''}
                </CardDescription>
              </div>
              {preview.error_count === 0 ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> Looks good
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Fix these first
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.error_count > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <ul className="space-y-1 text-sm">
                  {preview.errors.slice(0, 25).map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">Row {e.row}:</span>{' '}
                      <span className="text-muted-foreground">{e.message}</span>
                    </li>
                  ))}
                </ul>
                {preview.errors.length > 25 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    …and {preview.errors.length - 25} more.
                  </p>
                )}
              </div>
            )}

            {sheet === 'menu' && preview.preview.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Sizes</th>
                      <th className="px-3 py-2 text-right">From</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.preview as unknown as {
                      name: string; category: string; price_cents: number;
                      sizes: { name: string; price_cents: number }[]; action: string;
                    }[]).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.sizes.length
                            ? row.sizes.map((s) => `${s.name} ${formatCurrency(s.price_cents / 100)}`).join(' · ')
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(row.price_cents / 100)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={row.action === 'create' ? 'text-success' : 'text-muted-foreground'}>
                            {row.action === 'create' ? 'New' : 'Update'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sheet === 'ingredients' && preview.preview.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Ingredient</th>
                      <th className="px-3 py-2">Counted in</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Pack cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.preview as unknown as {
                      name: string; unit_label: string | null; canonical_unit: string;
                      category: string | null; cost_per_pack_cents: number | null;
                    }[]).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.unit_label ??
                            (row.canonical_unit === 'GRAM' ? 'grams'
                              : row.canonical_unit === 'MILLILITRE' ? 'millilitres' : 'units')}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.cost_per_pack_cents != null
                            ? formatCurrency(row.cost_per_pack_cents / 100) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sheet === 'recipes' && (preview.recipes?.length ?? 0) > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Menu item</th>
                      <th className="px-3 py-2 text-right">Ingredient lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.recipes!.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{r.menu_item_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.lines}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {Array.isArray(preview.would_skip_existing) && preview.would_skip_existing.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Already exists, will be left alone: {preview.would_skip_existing.join(', ')}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={commit} disabled={!canImport || busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {validCount} {sheet === 'menu' ? 'item' : sheet === 'recipes' ? 'line' : 'ingredient'}
                {validCount === 1 ? '' : 's'}
              </Button>
              <Button variant="outline" onClick={() => reset()} disabled={busy}>
                Cancel
              </Button>
            </div>
            {!canImport && preview.error_count > 0 && (
              <p className="text-xs text-muted-foreground">
                Every row has to be valid before anything is imported.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
