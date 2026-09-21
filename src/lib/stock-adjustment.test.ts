import { describe, it, expect } from 'vitest';
import { buildAdjustmentPayload } from './stock-adjustment';

describe('buildAdjustmentPayload', () => {
  it('always includes an explicit unit and a positive-magnitude signed quantity when adding', () => {
    const { payload, error } = buildAdjustmentPayload({
      ingredientId: 'ing-1',
      direction: 'ADD',
      quantity: '5',
      unit: 'KG',
      reason: 'Recount after delivery',
    });
    expect(error).toBeNull();
    expect(payload).toEqual({
      ingredient_id: 'ing-1',
      quantity: '5',
      unit: 'KG',
      reason: 'Recount after delivery',
    });
  });

  it('negates the quantity for a REMOVE direction', () => {
    const { payload, error } = buildAdjustmentPayload({
      ingredientId: 'ing-1',
      direction: 'REMOVE',
      quantity: '2.5',
      unit: 'KG',
      reason: 'Spillage not logged as wastage',
    });
    expect(error).toBeNull();
    expect(payload?.quantity).toBe('-2.5');
  });

  it('rejects a missing ingredient', () => {
    const { payload, error } = buildAdjustmentPayload({
      ingredientId: '',
      direction: 'ADD',
      quantity: '1',
      unit: 'KG',
      reason: 'Reason text',
    });
    expect(payload).toBeNull();
    expect(error).toMatch(/ingredient/i);
  });

  it('rejects a missing unit rather than letting one be silently assumed', () => {
    const { payload, error } = buildAdjustmentPayload({
      ingredientId: 'ing-1',
      direction: 'ADD',
      quantity: '1',
      unit: '',
      reason: 'Reason text',
    });
    expect(payload).toBeNull();
    expect(error).toMatch(/unit/i);
  });

  it('rejects a reason shorter than the backend minimum (3 chars)', () => {
    const { payload, error } = buildAdjustmentPayload({
      ingredientId: 'ing-1',
      direction: 'ADD',
      quantity: '1',
      unit: 'KG',
      reason: 'ok',
    });
    expect(payload).toBeNull();
    expect(error).toMatch(/reason/i);
  });

  it('rejects a zero, negative, blank, or non-numeric quantity', () => {
    for (const bad of ['0', '-1', '', 'abc']) {
      const { payload, error } = buildAdjustmentPayload({
        ingredientId: 'ing-1',
        direction: 'ADD',
        quantity: bad,
        unit: 'KG',
        reason: 'Reason text',
      });
      expect(payload).toBeNull();
      expect(error).toMatch(/quantity/i);
    }
  });

  it('trims the reason before sending it', () => {
    const { payload } = buildAdjustmentPayload({
      ingredientId: 'ing-1',
      direction: 'ADD',
      quantity: '1',
      unit: 'KG',
      reason: '  Recount  ',
    });
    expect(payload?.reason).toBe('Recount');
  });
});
