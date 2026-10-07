import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatCurrency } from '@/lib/mappers';
import type { Ingredient } from '@/types/inventory';
import type { MenuItem } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/PageComponents';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Upload, X, Truck, Link2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Platform = 'UBER_EATS' | 'MR_D' | 'GENERIC';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'UBER_EATS', label: 'Uber Eats' },
  { value: 'MR_D', label: 'Mr D' },
  { value: 'GENERIC', label: 'Other platform' },
];

interface PlatformStatus {
  platform: Platform;
  label: string;
  ever_imported: boolean;
  last_import_at: string | null;
  covered_through: string | null;
  last_orders_imported: number;
  hours_behind: number | null;
  is_stale: boolean;
  total_orders_all_time: number;
  total_gross_cents_all_time: number;
}

interface StatusResponse {
  platforms: PlatformStatus[];
  any_stale: boolean;
  never_imported: string[];
  stock_warning: string | null;
}

interface PreviewLine {
  external_item_text: string;
  quantity: number;
  menu_item_name: string | null;
  option_name: string | null;
  unresolved_modifiers: string[];
  is_resolved: boolean;
  is_ignored: boolean;
  gross_cents: number | null;
}

interface PreviewOrder {
  external_order_id: string;
  placed_at: string | null;
  status: string | null;
  gross_cents: number | null;
  is_duplicate: boolean;
  is_cancelled: boolean;
  in_closed_period: boolean;
  blocks_import: boolean;
  lines: PreviewLine[];
}

interface PreviewResponse {
  platform: Platform;
  platform_label: string;
  detected_columns: string[];
  resolved_mapping: Record<string, string>;
  missing_required_columns: string[];
  issues: { row: number; message: string }[];
  rows_read?: number;
  items_total?: number;
  orders_total?: number;
  orders_ready?: number;
  duplicates?: number;
  cancelled?: number;
  blocked?: number;
  unresolved_items?: string[];
  unresolved_modifiers?: string[];
  closed_period_cutoff?: string | null;
  orders_in_closed_period?: number;
  orders?: PreviewOrder[];
  can_import: boolean;
  message?: string;
}

interface BatchRow {
  id: string;
  platform_label: string;
  status: string;
  filename: string | null;
  uploaded_at: string | null;
  period_start_at: string | null;
  period_end_at: string | null;
  orders_imported: number;
  duplicate_orders: number;
  rejected_rows: number;
  movements_created: number;
  gross_sales_cents: number;
  notes: string | null;
}

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  external_order_id: 'Order ID',
  item: 'Item / product name',
  quantity: 'Quantity',
  order_datetime: 'Order date & time',
  order_date: 'Order date',
  order_time: 'Order time',
  size: 'Size',
  modifiers: 'Modifiers / add-ons',
  price: 'Price',
  status: 'Status',
};

/**
 * Delivery orders — import a daily Uber Eats / Mr D report so those sales
 * consume ingredients like any other.
 *
 * Nothing posts until the manager confirms a clean preview, and the import
 * refuses outright while any product is unmapped: a silently skipped item
 * understates stock forever, and the gap gets read as loss.
 */
export default function ExternalOrdersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [platform, setPlatform] = useState<Platform>('UBER_EATS');
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [ackClosedPeriod, setAckClosedPeriod] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['external-status'],
    queryFn: () => apiClient.get<StatusResponse>('/v1/business/external-orders/status'),
  });

  const { data: batches } = useQuery({
    queryKey: ['external-batches'],
    queryFn: () => apiClient.get<BatchRow[]>('/v1/business/external-orders/batches'),
  });

  const { data: menuItems } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => apiClient.get<MenuItem[]>('/v1/business/menu/items'),
  });

  const { data: mappings } = useQuery({
    queryKey: ['external-mappings', platform],
    queryFn: () =>
      apiClient.get<Record<string, unknown>[]>(
        `/v1/business/external-orders/mappings?platform=${platform}`
      ),
  });

  function reset(next?: Platform) {
    setFile(null);
    setPreview(null);
    setMapping({});
    setFailure(null);
    setAckClosedPeriod(false);
    setIncludeCancelled(false);
    if (next) setPlatform(next);
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
      form.append('platform', platform);
      const map = withMapping ?? mapping;
      if (Object.keys(map).length) form.append('mapping', JSON.stringify(map));
      setPreview(
        await apiClient.postForm<PreviewResponse>('/v1/business/external-orders/preview', form)
      );
    } catch (err) {
      setFailure((err as ApiError).message);
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
      form.append('platform', platform);
      if (Object.keys(mapping).length) form.append('mapping', JSON.stringify(mapping));
      form.append('acknowledge_closed_period', String(ackClosedPeriod));
      form.append('include_cancelled', String(includeCancelled));
      const result = await apiClient.postForm<{
        orders_imported: number;
        duplicates_skipped: number;
        stock_movements_created: number;
        backdated_into_closed_period: number;
        items_without_recipe: string[];
      }>('/v1/business/external-orders/commit', form);

      toast({
        title: `${result.orders_imported} order${result.orders_imported === 1 ? '' : 's'} imported`,
        description:
          `${result.stock_movements_created} stock movement(s) recorded` +
          (result.duplicates_skipped
            ? ` · ${result.duplicates_skipped} already imported, skipped`
            : '') +
          (result.backdated_into_closed_period
            ? ` · ${result.backdated_into_closed_period} recorded after a closed stocktake`
            : ''),
      });
      if (result.items_without_recipe?.length) {
        toast({
          title: 'Some items have no recipe',
          description:
            `${result.items_without_recipe.join(', ')} — these sold but reduced no stock.`,
          variant: 'destructive',
        });
      }
      ['external-status', 'external-batches', 'live-stock', 'stock-levels'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      reset();
    } catch (err) {
      setFailure((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const mapMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.post('/v1/business/external-orders/mappings', { platform, ...body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-mappings', platform] });
      void runPreview();
      toast({ title: 'Saved', description: 'We will remember this for future imports.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save mapping', description: e.message, variant: 'destructive' }),
  });

  // Only headings we did not recognise are worth asking about.
  const unmappedColumns = useMemo(() => {
    if (!preview?.detected_columns) return [];
    const used = new Set(Object.values(preview.resolved_mapping ?? {}));
    return preview.detected_columns.filter((c) => !used.has(c));
  }, [preview]);

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delivery orders</h1>
        <p className="text-sm text-muted-foreground">
          Import your daily Uber Eats and Mr D reports so those sales count towards your stock.
        </p>
      </div>

      {/* Freshness — the whole reason this screen leads with status */}
      {status?.stock_warning && (
        <Card className="border-warning/50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-warning" />
            <div>
              <p className="text-sm font-medium">{status.stock_warning}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Until delivery sales are imported, expected stock looks higher than it really
                is — which can look like a loss that never happened.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(status?.platforms ?? []).map((p) => (
          <Card key={p.platform} className={p.is_stale && p.ever_imported ? 'border-warning/50' : undefined}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{p.label}</p>
                {p.ever_imported ? (
                  p.is_stale ? (
                    <Clock className="h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )
                ) : (
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              {p.ever_imported ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sales counted through{' '}
                    {p.covered_through ? new Date(p.covered_through).toLocaleString() : '—'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.total_orders_all_time} orders ·{' '}
                    {formatCurrency(p.total_gross_cents_all_time / 100)} all time
                  </p>
                  {p.is_stale && (
                    <p className="mt-2 text-xs font-medium text-warning">
                      Today's orders may not be imported yet
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Never imported</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Import a daily report
          </CardTitle>
          <CardDescription>
            Export the day's orders from the platform, then upload the file here. Nothing
            changes until you confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <Button
                key={p.value}
                variant={platform === p.value ? 'default' : 'outline'}
                onClick={() => reset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              Choose file
            </Button>
            {file && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {file.name}
                <button onClick={() => reset()} aria-label="Clear">
                  <X className="h-4 w-4" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Accepts .csv and .xlsx. Column names do not have to match ours — we recognise the
            common ones and you can correct the rest.
          </p>
        </CardContent>
      </Card>

      {failure && (
        <Card className="border-destructive/50">
          <CardContent className="py-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {failure}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Nothing was imported.</p>
          </CardContent>
        </Card>
      )}

      {/* Column matching */}
      {preview && (preview.missing_required_columns.length > 0 || unmappedColumns.length > 0) && (
        <Card className={preview.missing_required_columns.length ? 'border-destructive/50' : undefined}>
          <CardHeader>
            <CardTitle>Match your columns</CardTitle>
            <CardDescription>
              {preview.missing_required_columns.length
                ? `We could not find: ${preview.missing_required_columns
                    .map((c) => REQUIRED_FIELD_LABELS[c] ?? c).join(', ')}`
                : 'These columns were not recognised. Tell us what they are, or leave them out.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...preview.missing_required_columns, ...Object.keys(REQUIRED_FIELD_LABELS)]
              .filter((f, i, a) => a.indexOf(f) === i)
              .filter((f) => preview.missing_required_columns.includes(f) || unmappedColumns.length)
              .map((fieldName) => (
                <div key={fieldName} className="flex flex-wrap items-center gap-3">
                  <Label className="min-w-[12rem] text-sm">
                    {REQUIRED_FIELD_LABELS[fieldName] ?? fieldName}
                    {preview.missing_required_columns.includes(fieldName) && (
                      <span className="ml-1 text-xs text-destructive">required</span>
                    )}
                  </Label>
                  <select
                    value={mapping[fieldName] ?? preview.resolved_mapping?.[fieldName] ?? ''}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value) next[fieldName] = e.target.value;
                      else delete next[fieldName];
                      setMapping(next);
                      void runPreview(undefined, next);
                    }}
                    className="h-10 min-w-[14rem] rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not in this file</option>
                    {(preview.detected_columns ?? []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Unmapped products — the blocking case */}
      {preview && (preview.unresolved_items?.length ?? 0) > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>Link these to your menu</CardTitle>
            <CardDescription>
              We will not import until every product is linked. Guessing would deduct the wrong
              ingredients every day.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.unresolved_items!.map((text) => (
              <UnresolvedItemRow
                key={text}
                text={text}
                menuItems={menuItems ?? []}
                onSave={(body) => mapMutation.mutate({ kind: 'ITEM', external_text: text, ...body })}
                saving={mapMutation.isPending}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {preview && (preview.unresolved_modifiers?.length ?? 0) > 0 && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Unknown extras</CardTitle>
            <CardDescription>
              These change what a dish uses. Ignoring one quietly loses that stock every day.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.unresolved_modifiers!.map((text) => (
              <div key={text} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[14rem] text-sm font-medium">{text}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={mapMutation.isPending}
                  onClick={() =>
                    mapMutation.mutate({
                      kind: 'MODIFIER', external_text: text, is_ignored: true,
                    })
                  }
                >
                  Does not affect stock
                </Button>
                <span className="text-xs text-muted-foreground">
                  To link it to an add-on, add that add-on to your menu first.
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && (preview.orders?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  {preview.orders_total} order{preview.orders_total === 1 ? '' : 's'} read
                  {preview.orders_ready ? ` · ${preview.orders_ready} ready` : ''}
                  {preview.duplicates ? ` · ${preview.duplicates} already imported` : ''}
                  {preview.cancelled ? ` · ${preview.cancelled} cancelled` : ''}
                  {preview.blocked ? ` · ${preview.blocked} need linking` : ''}
                </CardDescription>
              </div>
              {preview.can_import ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> Ready to import
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Not ready
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(preview.orders_in_closed_period ?? 0) > 0 && (
              <div className="rounded-lg border border-warning/50 bg-warning/5 p-3">
                <p className="text-sm font-medium">
                  {preview.orders_in_closed_period} order(s) were placed before your last
                  approved stocktake
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  That count is signed off and will not be changed. If you import these, their
                  stock is recorded just after the cut-off so the ingredients are not lost — and
                  your approved report stays exactly as it was.
                </p>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ackClosedPeriod}
                    onChange={(e) => setAckClosedPeriod(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Import them anyway
                </label>
              </div>
            )}

            {(preview.cancelled ?? 0) > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {preview.cancelled} cancelled order(s) found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A cancellation on the platform does not tell us whether the kitchen had
                  already made the food. Only include these if the food was actually made.
                </p>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeCancelled}
                    onChange={(e) => setIncludeCancelled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  The food was made — count these towards stock
                </label>
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <ul className="space-y-1 text-sm">
                  {preview.issues.slice(0, 15).map((i, idx) => (
                    <li key={idx}>
                      <span className="font-medium">Row {i.row}:</span>{' '}
                      <span className="text-muted-foreground">{i.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Placed</th>
                    <th className="px-3 py-2">Items</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.orders!.slice(0, 60).map((o) => (
                    <tr key={o.external_order_id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{o.external_order_id}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {o.placed_at ? new Date(o.placed_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {o.lines.map((l, i) => (
                          <div key={i}>
                            {l.quantity} x {l.menu_item_name ?? l.external_item_text}
                            {l.option_name ? ` (${l.option_name})` : ''}
                            {!l.is_resolved && (
                              <span className="ml-1 text-xs text-destructive">not linked</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {o.gross_cents != null ? formatCurrency(o.gross_cents / 100) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {o.is_duplicate ? (
                          <span className="text-muted-foreground">already imported</span>
                        ) : o.blocks_import ? (
                          <span className="text-destructive">needs linking</span>
                        ) : o.is_cancelled ? (
                          <span className="text-warning">cancelled</span>
                        ) : o.in_closed_period ? (
                          <span className="text-warning">before last count</span>
                        ) : (
                          <span className="text-success">ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={commit}
                disabled={
                  busy ||
                  !preview.can_import ||
                  ((preview.orders_in_closed_period ?? 0) > 0 && !ackClosedPeriod)
                }
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {preview.orders_ready} order{preview.orders_ready === 1 ? '' : 's'}
              </Button>
              <Button variant="outline" onClick={() => reset()} disabled={busy}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved mappings */}
      {(mappings?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Saved product links
            </CardTitle>
            <CardDescription>
              Tomorrow's file uses these automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2">On the platform</th>
                    <th className="px-4 py-2">On your menu</th>
                    <th className="px-4 py-2">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {(mappings ?? []).map((m) => (
                    <tr key={String(m.id)} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{String(m.external_text)}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {m.is_ignored
                          ? 'Does not affect stock'
                          : `${m.menu_item_name ?? m.menu_add_on_name ?? '—'}${
                              m.option_id ? ` (${m.option_id})` : ''
                            }`}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {String(m.times_used ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {(batches?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">Platform</th>
                    <th className="px-4 py-2">File</th>
                    <th className="px-4 py-2">Covers</th>
                    <th className="px-4 py-2 text-right">Orders</th>
                    <th className="px-4 py-2 text-right">Skipped</th>
                    <th className="px-4 py-2 text-right">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {(batches ?? []).map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">
                        {b.uploaded_at ? new Date(b.uploaded_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2">{b.platform_label}</td>
                      <td className="px-4 py-2 text-muted-foreground">{b.filename ?? '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {b.period_start_at ? new Date(b.period_start_at).toLocaleDateString() : '—'}
                        {b.period_end_at &&
                          b.period_start_at &&
                          new Date(b.period_end_at).toDateString() !==
                            new Date(b.period_start_at).toDateString()
                          ? ` – ${new Date(b.period_end_at).toLocaleDateString()}`
                          : ''}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.orders_imported}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {b.duplicate_orders}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(b.gross_sales_cents / 100)}
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

/** One unmapped external product, with the controls to link it. */
function UnresolvedItemRow({
  text, menuItems, onSave, saving,
}: {
  text: string;
  menuItems: MenuItem[];
  onSave: (body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [menuItemId, setMenuItemId] = useState('');
  const [optionId, setOptionId] = useState('');

  const options = useMemo(() => {
    const item = menuItems.find((m) => m.id === menuItemId);
    const groups = (item?.options_json?.option_groups ?? []) as Array<{
      name: string; options?: Array<{ id: string; name: string }>;
    }>;
    return groups.flatMap((g) =>
      (g.options ?? []).map((o) => ({ id: o.id, label: `${g.name}: ${o.name}` }))
    );
  }, [menuItems, menuItemId]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <span className="min-w-[14rem] text-sm font-medium">{text}</span>
      <select
        value={menuItemId}
        onChange={(e) => { setMenuItemId(e.target.value); setOptionId(''); }}
        className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Choose menu item…</option>
        {menuItems.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {options.length > 0 && (
        <select
          value={optionId}
          onChange={(e) => setOptionId(e.target.value)}
          className="h-9 min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Size / option…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        disabled={!menuItemId || saving}
        onClick={() => onSave({ menu_item_id: menuItemId, option_id: optionId || null })}
      >
        Save &amp; remember
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={() => onSave({ is_ignored: true })}
      >
        Not a food item
      </Button>
    </div>
  );
}
