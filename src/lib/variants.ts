/**
 * Product variants (clothing / retail) - wire types and pure helpers.
 *
 * Contract: backend docs/PRODUCT_VARIANTS_CONTRACT.md (routes_variants.py,
 * GET /v1/business/analytics/variants). Money is integer cents. The matrix
 * preview below mirrors the backend's SKU rule exactly, but the backend stays
 * the authority: the preview is only what we EXPECT it to create.
 */
import { ApiError } from '@/lib/api-client';

export const MAX_MATRIX = 200;

export interface Variant {
  id: string;
  menu_item_id: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  label: string;
  price_cents: number | null;
  effective_price_cents: number;
  cost_cents: number | null;
  is_active: boolean;
  sort_order: number;
  ingredient_id: string | null;
  /** Units; null when stock is not tracked. */
  stock_on_hand: number | null;
}

export interface VariantCreateBody {
  sku: string;
  barcode?: string;
  attributes: Record<string, string>;
  price_cents?: number;
  cost_cents?: number;
  track_stock: boolean;
  opening_stock?: number;
}

export interface MatrixCreateBody {
  sku_prefix: string;
  sizes: string[];
  colours: string[];
  price_cents?: number;
  cost_cents?: number;
  track_stock: boolean;
  opening_stock?: number;
}

export interface VariantSalesRow {
  variant_id: string | null;
  menu_item_id: string | null;
  name: string | null;
  sku: string | null;
  label: string | null;
  units_sold: number;
  gross_cents: number;
  units_returned: number;
  returned_cents: number;
  net_units: number;
  net_cents: number;
}

export interface VariantSalesReport {
  range: string;
  start_date: string;
  end_date: string;
  timezone: string;
  currency?: string;
  variants: VariantSalesRow[];
  totals: Omit<VariantSalesRow, 'variant_id' | 'menu_item_id' | 'name' | 'sku' | 'label'>;
  basis: string;
}

export interface MatrixPreviewRow {
  sku: string;
  attributes: Record<string, string>;
}

export interface MatrixPreview {
  rows: MatrixPreviewRow[];
  count: number;
  /** More than MAX_MATRIX combinations: creation must be blocked. */
  overLimit: boolean;
  /** Two combinations generate the same SKU (backend: SKU_PATTERN_COLLISION). */
  collisions: string[];
  /** Nothing to build yet (needs a prefix and at least one size or colour). */
  empty: boolean;
}

/** One SKU segment: spaces removed, upper-cased (backend: `p.replace(" ", "").upper()`). */
function skuPart(p: string): string {
  return p.replace(/ /g, '').toUpperCase();
}

/** Trim, drop blanks and case-insensitive duplicates, keeping first spelling. */
export function normaliseChips(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/**
 * SKU = PREFIX-SIZE-COLOUR, each part upper-cased with spaces removed, empty
 * axis skipped, joined with '-' and cut to 64 characters (as the backend does).
 */
export function buildSku(prefix: string, size?: string, colour?: string): string {
  return [prefix.trim(), size, colour]
    .filter((p): p is string => !!p)
    .map(skuPart)
    .join('-')
    .slice(0, 64);
}

export function buildMatrixPreview(prefix: string, sizesIn: string[], coloursIn: string[]): MatrixPreview {
  const sizes = normaliseChips(sizesIn);
  const colours = normaliseChips(coloursIn);
  const cleanPrefix = prefix.trim();
  const total = Math.max(sizes.length, 1) * Math.max(colours.length, 1);
  const empty = !cleanPrefix || (sizes.length === 0 && colours.length === 0);
  if (empty) return { rows: [], count: 0, overLimit: false, collisions: [], empty: true };
  if (total > MAX_MATRIX) {
    // Do not materialise an enormous grid; the count is what matters.
    return { rows: [], count: total, overLimit: true, collisions: [], empty: false };
  }
  const rows: MatrixPreviewRow[] = [];
  for (const size of sizes.length ? sizes : [undefined]) {
    for (const colour of colours.length ? colours : [undefined]) {
      const attributes: Record<string, string> = {};
      if (size) attributes.size = size;
      if (colour) attributes.colour = colour;
      rows.push({ sku: buildSku(cleanPrefix, size, colour), attributes });
    }
  }
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.sku, (counts.get(r.sku) ?? 0) + 1);
  const collisions = [...counts.entries()].filter(([, n]) => n > 1).map(([sku]) => sku);
  return { rows, count: rows.length, overLimit: false, collisions, empty: false };
}

const ERROR_MESSAGES: Record<string, string> = {
  SKU_TAKEN: 'That SKU is already used by another product. Choose a different SKU.',
  BARCODE_TAKEN: 'That barcode is already used by another product. Choose a different barcode.',
  VARIANT_CONFLICT: 'A SKU, barcode or stock name clashes with an existing variant. Nothing was saved.',
  SKU_PATTERN_COLLISION:
    'Two combinations would produce the same SKU. Use sizes and colours that stay distinct once spaces are removed.',
};

/** Clear, user-facing text for a variants API failure; falls back to the server message. */
export function variantErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code && ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code];
    if (err.status === 404) return 'This variant or item no longer exists. Refresh and try again.';
    if (err.status === 403) return 'Only an owner or manager can change variants.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
