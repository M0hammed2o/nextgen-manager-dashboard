import { describe, it, expect } from 'vitest';
import { supplierDeleteEligibility } from './supplier-delete';

describe('supplierDeleteEligibility — mirrors routes_inventory.py delete_supplier exactly', () => {
  it('allows delete only when inactive AND zero goods receipts', () => {
    const result = supplierDeleteEligibility({ is_active: false, goods_receipt_count: 0 });
    expect(result.canDelete).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('refuses when the supplier has goods receipts, even if already inactive', () => {
    const result = supplierDeleteEligibility({ is_active: false, goods_receipt_count: 3 });
    expect(result.canDelete).toBe(false);
    expect(result.reason).toMatch(/3 goods receipts/);
    expect(result.reason).toMatch(/deactivate/i);
  });

  it('refuses when the supplier is still active, even with zero receipts', () => {
    const result = supplierDeleteEligibility({ is_active: true, goods_receipt_count: 0 });
    expect(result.canDelete).toBe(false);
    expect(result.reason).toMatch(/deactivate/i);
  });

  it('refuses when both conditions fail, and reports the goods-receipt reason first (matches backend check order)', () => {
    const result = supplierDeleteEligibility({ is_active: true, goods_receipt_count: 1 });
    expect(result.canDelete).toBe(false);
    expect(result.reason).toMatch(/1 goods receipt on record/);
  });

  it('uses singular "receipt" for exactly one, plural otherwise', () => {
    expect(supplierDeleteEligibility({ is_active: false, goods_receipt_count: 1 }).reason).toMatch(
      /1 goods receipt on record/
    );
    expect(supplierDeleteEligibility({ is_active: false, goods_receipt_count: 2 }).reason).toMatch(
      /2 goods receipts on record/
    );
  });
});
