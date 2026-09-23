import { describe, it, expect } from 'vitest';
import { ApiError } from './api-client';
import {
  buildOpeningStockPayload,
  isOpeningStockDuplicateError,
  OPENING_STOCK_DUPLICATE_CODE,
} from './opening-stock';

describe('buildOpeningStockPayload', () => {
  it('builds a minimal payload with no source/occurred_at when neither is given', () => {
    const { payload, error } = buildOpeningStockPayload({
      ingredientId: 'ing-1',
      quantity: '10',
      unit: 'KG',
    });
    expect(error).toBeNull();
    expect(payload).toEqual({ ingredient_id: 'ing-1', quantity: '10', unit: 'KG' });
  });

  it('includes a trimmed shared source and occurred_at when provided', () => {
    const { payload, error } = buildOpeningStockPayload(
      { ingredientId: 'ing-1', quantity: '10', unit: 'KG' },
      { source: '  Physical count on go-live day  ', occurredAt: '2026-09-23T08:00:00Z' }
    );
    expect(error).toBeNull();
    expect(payload).toEqual({
      ingredient_id: 'ing-1',
      quantity: '10',
      unit: 'KG',
      source: 'Physical count on go-live day',
      occurred_at: '2026-09-23T08:00:00Z',
    });
  });

  it('omits a blank/whitespace-only source rather than sending an empty string', () => {
    const { payload } = buildOpeningStockPayload(
      { ingredientId: 'ing-1', quantity: '10', unit: 'KG' },
      { source: '   ' }
    );
    expect(payload).not.toHaveProperty('source');
  });

  it('rejects a missing ingredient', () => {
    const { payload, error } = buildOpeningStockPayload({ ingredientId: '', quantity: '10', unit: 'KG' });
    expect(payload).toBeNull();
    expect(error).toMatch(/ingredient/i);
  });

  it('rejects a missing unit rather than letting one be silently assumed', () => {
    const { payload, error } = buildOpeningStockPayload({ ingredientId: 'ing-1', quantity: '10', unit: '' });
    expect(payload).toBeNull();
    expect(error).toMatch(/unit/i);
  });

  it('rejects a zero, negative, blank, or non-numeric quantity (opening stock must be a positive magnitude)', () => {
    for (const bad of ['0', '-1', '', 'abc']) {
      const { payload, error } = buildOpeningStockPayload({ ingredientId: 'ing-1', quantity: bad, unit: 'KG' });
      expect(payload).toBeNull();
      expect(error).toMatch(/quantity/i);
    }
  });
});

describe('isOpeningStockDuplicateError — the 409 "already set" classification', () => {
  it('is true for an ApiError carrying the exact backend code', () => {
    const err = new ApiError('Opening stock has already been recorded for this ingredient.', 409, OPENING_STOCK_DUPLICATE_CODE);
    expect(isOpeningStockDuplicateError(err)).toBe(true);
  });

  it('is false for an ApiError with a different code (e.g. INVENTORY_NOT_ENABLED)', () => {
    const err = new ApiError('The inventory module is not enabled', 409, 'INVENTORY_NOT_ENABLED');
    expect(isOpeningStockDuplicateError(err)).toBe(false);
  });

  it('is false for an ApiError with no code at all', () => {
    const err = new ApiError('Something went wrong', 500);
    expect(isOpeningStockDuplicateError(err)).toBe(false);
  });

  it('is false for a plain Error, never matched on message text alone', () => {
    const err = new Error('Opening stock has already been recorded for this ingredient.');
    expect(isOpeningStockDuplicateError(err)).toBe(false);
  });

  it('is false for a non-error value', () => {
    expect(isOpeningStockDuplicateError(null)).toBe(false);
    expect(isOpeningStockDuplicateError(undefined)).toBe(false);
    expect(isOpeningStockDuplicateError('OPENING_STOCK_ALREADY_SET')).toBe(false);
  });
});
