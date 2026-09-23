/**
 * Opening stock entry — shapes and validates a single row of the Opening
 * Stock grid into the backend's OpeningStockRequest
 * (routes_inventory.py, POST /v1/business/inventory/opening-stock), and
 * classifies the one error code that grid genuinely has to handle
 * specially.
 *
 * ONE OPENING BALANCE PER INGREDIENT, EVER
 * -----------------------------------------
 * The backend rejects a second opening-stock submission for the same
 * ingredient with 409 OPENING_STOCK_ALREADY_SET — an opening balance is by
 * definition the position before any other movement existed, so a repeat is
 * inherently ambiguous (see routes_inventory.py's own docstring on
 * `set_opening_stock`). `isOpeningStockDuplicateError` lets the grid
 * recognise that specific case and tell the user what to do instead (a
 * manual adjustment, or a goods receipt) rather than showing a generic
 * failure.
 */

import { ApiError } from './api-client';

export const OPENING_STOCK_DUPLICATE_CODE = 'OPENING_STOCK_ALREADY_SET';

export interface OpeningStockRowInput {
  ingredientId: string;
  /** Raw text from the row's quantity input — always positive, never signed. */
  quantity: string;
  unit: string;
}

export interface OpeningStockShared {
  /** Applied to every row submitted in the same batch, e.g. "Physical count on go-live day". */
  source?: string;
  /** ISO datetime string; omitted (server defaults to now) when blank. */
  occurredAt?: string;
}

export interface OpeningStockPayload {
  ingredient_id: string;
  quantity: string;
  unit: string;
  source?: string;
  occurred_at?: string;
}

export interface BuildOpeningStockRowResult {
  payload: OpeningStockPayload | null;
  error: string | null;
}

/**
 * Validate and shape one grid row. Returns a validation `error` instead of
 * throwing, so the row can show it inline the same way the stock-adjustment
 * and stocktake-count builders already do.
 */
export function buildOpeningStockPayload(
  row: OpeningStockRowInput,
  shared: OpeningStockShared = {}
): BuildOpeningStockRowResult {
  if (!row.ingredientId) {
    return { payload: null, error: 'Missing ingredient' };
  }
  if (!row.unit) {
    return { payload: null, error: 'Choose a unit' };
  }

  const raw = (row.quantity ?? '').trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value <= 0) {
    return { payload: null, error: 'Enter a quantity greater than zero' };
  }

  const payload: OpeningStockPayload = {
    ingredient_id: row.ingredientId,
    quantity: raw,
    unit: row.unit,
  };
  const trimmedSource = (shared.source ?? '').trim();
  if (trimmedSource) payload.source = trimmedSource;
  if (shared.occurredAt) payload.occurred_at = shared.occurredAt;

  return { payload, error: null };
}

/**
 * True only for the specific "opening stock already recorded" 409 — never
 * matched by message text, since backend copy can change without this
 * classification breaking (see ApiError.code, api-client.ts).
 */
export function isOpeningStockDuplicateError(err: unknown): boolean {
  return err instanceof ApiError && err.code === OPENING_STOCK_DUPLICATE_CODE;
}
