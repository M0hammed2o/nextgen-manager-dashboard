import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X, Grid3x3 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { centsToRandsInput, formatCents, parseRandsToCents } from '@/lib/mappers';
import {
  MAX_MATRIX, buildMatrixPreview, normaliseChips, variantErrorMessage,
  type MatrixCreateBody, type Variant, type VariantCreateBody,
} from '@/lib/variants';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

// Variants (size / colour / SKU) for one menu item. Business scope comes from
// the JWT on the backend; nothing tenant-related is sent from here.

const variantsKey = (itemId: string) => ['variants', itemId] as const;

function useVariantMutations(itemId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const done = () => qc.invalidateQueries({ queryKey: variantsKey(itemId) });
  const fail = (err: unknown) =>
    toast({ title: 'Could not save variant', description: variantErrorMessage(err), variant: 'destructive' });
  return { toast, done, fail };
}

/** Optional rand amount: '' -> undefined, invalid -> null. */
function optionalCents(raw: string): number | null | undefined {
  if (raw.trim() === '') return undefined;
  return parseRandsToCents(raw);
}

/** Optional whole number: '' -> undefined, invalid -> null. */
function optionalCount(raw: string): number | null | undefined {
  if (raw.trim() === '') return undefined;
  return /^\d+$/.test(raw.trim()) ? parseInt(raw, 10) : null;
}

// ---- per-variant stock -----------------------------------------------------

/** Signed whole-number change: '+5', '5', '-2'. '' / 0 / invalid -> null. */
export function parseStockChange(raw: string): number | null {
  const t = raw.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n === 0 ? null : n;
}

/**
 * Add or remove units of one tracked variant through the existing, audited
 * manual-adjustment endpoint (POST /v1/business/inventory/adjustments,
 * owner/manager, business from the JWT). A signed change rather than "set to"
 * so a sale rung up meanwhile is never overwritten.
 */
function StockAdjustForm({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [change, setChange] = useState('');
  const [reason, setReason] = useState('Stock count correction');
  const delta = parseStockChange(change);
  const current = variant.stock_on_hand ?? 0;
  const after = delta === null ? null : current + delta;
  const problem =
    change.trim() === '' ? null
    : delta === null ? 'Enter a whole number of units, like 5 to add or -2 to remove.'
    : after !== null && after < 0 ? `That would leave ${after} in stock. You have ${current}.`
    : reason.trim().length < 3 ? 'Give a reason (at least 3 characters).'
    : null;

  const adjust = useMutation({
    mutationFn: () =>
      apiClient.post('/v1/business/inventory/adjustments', {
        ingredient_id: variant.ingredient_id, quantity: String(delta), unit: 'unit', reason: reason.trim(),
      }),
    onSuccess: () => {
      toast({ title: 'Stock updated', description: `${variant.label}: ${current} → ${after} in stock` });
      qc.invalidateQueries({ queryKey: variantsKey(variant.menu_item_id) });
      onClose();
    },
    onError: (err) => toast({
      title: 'Could not update stock',
      description: err instanceof ApiError && err.code === 'INVENTORY_NOT_ENABLED'
        ? 'Stock tracking (inventory) is not switched on for this business.'
        : variantErrorMessage(err),
      variant: 'destructive',
    }),
  });

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2" aria-label={`Adjust stock for ${variant.label}`}>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`vsc-${variant.id}`} className="text-xs">Change in units (- to remove)</Label>
          <Input
            id={`vsc-${variant.id}`} inputMode="numeric" placeholder="e.g. 5 or -2" value={change}
            onChange={(e) => setChange(e.target.value)} aria-invalid={!!problem}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`vsr-${variant.id}`} className="text-xs">Reason</Label>
          <Input id={`vsr-${variant.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
        </div>
      </div>
      {after !== null && !problem && (
        <p className="text-xs text-muted-foreground" data-testid={`stock-preview-${variant.sku}`}>{current} → {after} in stock</p>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="button" size="sm" disabled={delta === null || !!problem || adjust.isPending} onClick={() => adjust.mutate()}>
          {adjust.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update stock'}
        </Button>
      </div>
    </div>
  );
}

// ---- list ------------------------------------------------------------------

function VariantRow({ variant }: { variant: Variant }) {
  const { toast, done, fail } = useVariantMutations(variant.menu_item_id);
  const initialPrice = variant.price_cents === null ? '' : centsToRandsInput(variant.price_cents);
  const [price, setPrice] = useState(initialPrice);
  const [barcode, setBarcode] = useState(variant.barcode ?? '');
  const [active, setActive] = useState(variant.is_active);
  const [adjusting, setAdjusting] = useState(false);
  const canAdjustStock = variant.ingredient_id !== null && variant.stock_on_hand !== null;

  const priceCents = optionalCents(price);
  const priceInvalid = priceCents === null;
  const dirty =
    price !== initialPrice ||
    barcode.trim() !== (variant.barcode ?? '') ||
    active !== variant.is_active;

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<Variant>(`/v1/business/menu/variants/${variant.id}`, {
        // null clears the override / barcode on the backend.
        price_cents: priceCents === undefined ? null : priceCents,
        barcode: barcode.trim() === '' ? null : barcode.trim(),
        is_active: active,
      }),
    onSuccess: () => { toast({ title: 'Variant updated' }); done(); },
    onError: fail,
  });

  return (
    <li className="rounded-lg border border-border p-3 space-y-2" data-testid={`variant-row-${variant.sku}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{variant.label}</p>
          <p className="text-xs text-muted-foreground">SKU {variant.sku}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <p className="text-sm font-semibold text-foreground">{formatCents(variant.effective_price_cents)}</p>
          <p>{variant.stock_on_hand === null ? 'Stock not tracked' : `${variant.stock_on_hand} in stock`}</p>
          {canAdjustStock && !adjusting && (
            <Button
              type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
              onClick={() => setAdjusting(true)} aria-label={`Adjust stock for ${variant.label}`}
            >
              Adjust stock
            </Button>
          )}
        </div>
      </div>
      {adjusting && <StockAdjustForm variant={variant} onClose={() => setAdjusting(false)} />}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`vp-${variant.id}`} className="text-xs">Price override (R)</Label>
          <Input
            id={`vp-${variant.id}`} inputMode="decimal" placeholder="Item price" value={price}
            onChange={(e) => setPrice(e.target.value)} aria-invalid={priceInvalid}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`vb-${variant.id}`} className="text-xs">Barcode</Label>
          <Input id={`vb-${variant.id}`} value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={64} />
        </div>
      </div>
      {priceInvalid && (
        <p className="text-xs text-destructive">Enter a price like 199.99, or leave blank to use the item price.</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id={`va-${variant.id}`} checked={active} onCheckedChange={setActive} aria-label={`${variant.label} active`} />
          <Label htmlFor={`va-${variant.id}`} className="text-xs">{active ? 'Active' : 'Inactive'}</Label>
        </div>
        <Button type="button" size="sm" disabled={!dirty || priceInvalid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </li>
  );
}

// ---- chip input ------------------------------------------------------------

export function ChipInput({
  label, values, onChange, placeholder,
}: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft.split(',');
    if (parts.some((p) => p.trim())) onChange(normaliseChips([...values, ...parts]));
    setDraft('');
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
        }}
      />
    </div>
  );
}

// ---- single add ------------------------------------------------------------

function AddVariantForm({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { toast, done, fail } = useVariantMutations(itemId);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [size, setSize] = useState('');
  const [colour, setColour] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [track, setTrack] = useState(true);
  const [opening, setOpening] = useState('');

  const priceCents = optionalCents(price);
  const costCents = optionalCents(cost);
  const openingN = optionalCount(opening);
  const attributes: Record<string, string> = {};
  if (size.trim()) attributes.size = size.trim();
  if (colour.trim()) attributes.colour = colour.trim();
  const problem =
    !sku.trim() ? 'Enter a SKU.'
    : Object.keys(attributes).length === 0 ? 'Enter a size or a colour.'
    : priceCents === null || costCents === null ? 'Prices must look like 199.99.'
    : openingN === null ? 'Opening stock must be a whole number.'
    : openingN !== undefined && openingN > 0 && !track ? 'Opening stock needs stock tracking on.'
    : null;

  const create = useMutation({
    mutationFn: () => {
      const body: VariantCreateBody = { sku: sku.trim(), attributes, track_stock: track };
      if (barcode.trim()) body.barcode = barcode.trim();
      if (priceCents !== undefined && priceCents !== null) body.price_cents = priceCents;
      if (costCents !== undefined && costCents !== null) body.cost_cents = costCents;
      if (openingN !== undefined && openingN !== null) body.opening_stock = openingN;
      return apiClient.post<Variant>(`/v1/business/menu/items/${itemId}/variants`, body);
    },
    onSuccess: () => { toast({ title: 'Variant added' }); done(); onClose(); },
    onError: fail,
  });

  return (
    <div className="rounded-lg border border-border p-3 space-y-3" aria-label="Add a variant">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label htmlFor="nv-sku" className="text-xs">SKU</Label><Input id="nv-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={64} /></div>
        <div className="space-y-1"><Label htmlFor="nv-barcode" className="text-xs">Barcode (optional)</Label><Input id="nv-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={64} /></div>
        <div className="space-y-1"><Label htmlFor="nv-size" className="text-xs">Size</Label><Input id="nv-size" value={size} onChange={(e) => setSize(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="nv-colour" className="text-xs">Colour</Label><Input id="nv-colour" value={colour} onChange={(e) => setColour(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="nv-price" className="text-xs">Price override (R)</Label><Input id="nv-price" inputMode="decimal" placeholder="Item price" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="nv-cost" className="text-xs">Unit cost (R)</Label><Input id="nv-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="nv-track" checked={track} onCheckedChange={setTrack} />
          <Label htmlFor="nv-track" className="text-xs">Track stock</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="nv-open" className="text-xs">Opening stock</Label>
          <Input id="nv-open" inputMode="numeric" className="w-24" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={!track} />
        </div>
      </div>
      {problem && sku !== '' && <p className="text-xs text-destructive">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="button" size="sm" disabled={!!problem || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add variant'}
        </Button>
      </div>
    </div>
  );
}

// ---- matrix ----------------------------------------------------------------

function MatrixBuilder({ itemId, itemName, onClose }: { itemId: string; itemName: string; onClose: () => void }) {
  const { toast, done, fail } = useVariantMutations(itemId);
  const [prefix, setPrefix] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [track, setTrack] = useState(true);
  const [opening, setOpening] = useState('');

  const preview = buildMatrixPreview(prefix, sizes, colours);
  const priceCents = optionalCents(price);
  const costCents = optionalCents(cost);
  const openingN = optionalCount(opening);
  const numberProblem =
    priceCents === null || costCents === null ? 'Prices must look like 199.99.'
    : openingN === null ? 'Opening stock must be a whole number.'
    : openingN !== undefined && openingN > 0 && !track ? 'Opening stock needs stock tracking on.'
    : null;
  const blocked = preview.empty || preview.overLimit || preview.collisions.length > 0 || !!numberProblem;

  const create = useMutation({
    mutationFn: () => {
      const body: MatrixCreateBody = {
        sku_prefix: prefix.trim(), sizes: normaliseChips(sizes), colours: normaliseChips(colours), track_stock: track,
      };
      if (priceCents !== undefined && priceCents !== null) body.price_cents = priceCents;
      if (costCents !== undefined && costCents !== null) body.cost_cents = costCents;
      if (openingN !== undefined && openingN !== null) body.opening_stock = openingN;
      return apiClient.post<Variant[]>(`/v1/business/menu/items/${itemId}/variants/matrix`, body);
    },
    onSuccess: (created) => {
      toast({ title: `${created.length} variant${created.length === 1 ? '' : 's'} created` });
      done();
      onClose();
    },
    onError: fail,
  });

  return (
    <div className="rounded-lg border border-border p-3 space-y-3" aria-label="Generate sizes and colours">
      <p className="text-xs text-muted-foreground">
        Builds every size and colour combination for {itemName} in one go. If any SKU clashes, nothing is created.
      </p>
      <div className="space-y-1">
        <Label htmlFor="mx-prefix" className="text-xs">SKU prefix</Label>
        <Input id="mx-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={40} placeholder="e.g. TEE" />
      </div>
      <ChipInput label="Sizes" values={sizes} onChange={setSizes} placeholder="Type a size, press Enter (S, M, L)" />
      <ChipInput label="Colours" values={colours} onChange={setColours} placeholder="Type a colour, press Enter" />
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1"><Label htmlFor="mx-price" className="text-xs">Price (R)</Label><Input id="mx-price" inputMode="decimal" placeholder="Item price" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="mx-cost" className="text-xs">Unit cost (R)</Label><Input id="mx-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="mx-open" className="text-xs">Opening stock each</Label><Input id="mx-open" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={!track} /></div>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="mx-track" checked={track} onCheckedChange={setTrack} />
        <Label htmlFor="mx-track" className="text-xs">Track stock</Label>
      </div>

      <div aria-live="polite" className="space-y-1.5">
        {preview.empty ? (
          <p className="text-xs text-muted-foreground">Enter a prefix and at least one size or colour to preview.</p>
        ) : preview.overLimit ? (
          <p role="alert" className="text-xs text-destructive">
            {preview.count} combinations is too many. The most you can create at once is {MAX_MATRIX}.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground" data-testid="matrix-count">
              {preview.count} variant{preview.count === 1 ? '' : 's'} will be created
            </p>
            {preview.collisions.length > 0 && (
              <p role="alert" className="text-xs text-destructive">
                These SKUs would repeat: {preview.collisions.join(', ')}. Make the sizes/colours distinct.
              </p>
            )}
            <ul className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto rounded border border-border p-2 text-xs font-mono" aria-label="SKU preview">
              {preview.rows.map((r) => <li key={r.sku}>{r.sku}</li>)}
            </ul>
          </>
        )}
        {numberProblem && <p className="text-xs text-destructive">{numberProblem}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="button" size="sm" disabled={blocked || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : preview.count > 0 && !preview.overLimit ? `Create ${preview.count}` : 'Create'}
        </Button>
      </div>
    </div>
  );
}

// ---- section ---------------------------------------------------------------

export function VariantsSection({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [showInactive, setShowInactive] = useState(false);
  const [panel, setPanel] = useState<'none' | 'add' | 'matrix'>('none');
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [...variantsKey(itemId), showInactive],
    queryFn: () =>
      apiClient.get<Variant[]>(`/v1/business/menu/items/${itemId}/variants?include_inactive=${showInactive}`),
  });

  return (
    <section
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Variants"
      // This section sits inside the item form: Enter in one of its inputs must
      // not submit (and close) the item edit.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Variants</h3>
          <p className="text-xs text-muted-foreground">Sizes, colours and SKUs for clothing and retail items.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch id="vs-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="vs-inactive" className="text-xs">Show inactive</Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2" data-testid="variants-loading">
          <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
        </div>
      ) : isError || !data ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm space-y-2">
          <p className="text-destructive">{variantErrorMessage(error) || "Couldn't load variants."}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="variants-empty">
          No variants yet. Add one, or generate every size and colour at once.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((v) => <VariantRow key={v.id} variant={v} />)}
        </ul>
      )}

      {panel === 'add' && <AddVariantForm itemId={itemId} onClose={() => setPanel('none')} />}
      {panel === 'matrix' && <MatrixBuilder itemId={itemId} itemName={itemName} onClose={() => setPanel('none')} />}
      {panel === 'none' && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setPanel('add')}>
            <Plus className="w-4 h-4 mr-1" /> Add variant
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPanel('matrix')}>
            <Grid3x3 className="w-4 h-4 mr-1" /> Generate sizes × colours
          </Button>
        </div>
      )}
    </section>
  );
}
