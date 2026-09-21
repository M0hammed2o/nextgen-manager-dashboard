/**
 * Manual stock adjustment — the one movement type with no external document
 * behind it (POST /v1/business/inventory/adjustments, routes_inventory.py
 * `create_adjustment`, OWNER/MANAGER only, always audited).
 *
 * The backend takes a single SIGNED decimal string as `quantity` (negative
 * removes stock) plus a required `unit` and a `reason` of at least 3
 * characters. This module is the single place that turns a manager's
 * "Add/Remove this many <unit>" form input into that exact shape, so the
 * unit is always sent explicitly (see stocktake-units.ts's header for why a
 * missing unit is a real, previously-shipped bug class) and never derived
 * from anything editable after the fact.
 */

export type AdjustmentDirection = 'ADD' | 'REMOVE';

export interface AdjustmentFormInput {
  ingredientId: string;
  direction: AdjustmentDirection;
  /** Raw text from the quantity input — always a positive magnitude, never signed by the user. */
  quantity: string;
  unit: string;
  reason: string;
}

export interface AdjustmentPayload {
  ingredient_id: string;
  /** Signed decimal string — negative removes stock, matching the backend's AdjustmentRequest.quantity. */
  quantity: string;
  unit: string;
  reason: string;
}

export interface BuildAdjustmentResult {
  payload: AdjustmentPayload | null;
  error: string | null;
}

/**
 * Validate and shape a manual adjustment form into the backend payload.
 * Returns a validation `error` message (and a null payload) instead of
 * throwing, so a page can show it inline the same way buildCountsPayload's
 * caller does.
 */
export function buildAdjustmentPayload(input: AdjustmentFormInput): BuildAdjustmentResult {
  if (!input.ingredientId) {
    return { payload: null, error: 'Choose an ingredient' };
  }
  if (!input.unit) {
    return { payload: null, error: 'Choose a unit' };
  }

  const reason = (input.reason ?? '').trim();
  if (reason.length < 3) {
    return { payload: null, error: 'Enter a reason (at least 3 characters)' };
  }

  const raw = (input.quantity ?? '').trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value <= 0) {
    return { payload: null, error: 'Enter a quantity greater than zero' };
  }

  const quantity = input.direction === 'REMOVE' ? `-${raw}` : raw;

  return {
    payload: {
      ingredient_id: input.ingredientId,
      quantity,
      unit: input.unit,
      reason,
    },
    error: null,
  };
}
