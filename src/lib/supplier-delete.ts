/**
 * Supplier permanent-delete eligibility — a pure mirror of the backend's
 * server-verified rule (routes_inventory.py `delete_supplier`, lines
 * 710-759), used only to decide whether the UI should even offer a Delete
 * button. The backend is the actual authority and re-verifies independently
 * on every request; this exists so the UI never presents an action that is
 * guaranteed to fail with a confusing 409, not to relax or duplicate the
 * server-side check as a security boundary.
 *
 * The rule, matched exactly:
 *   1. The supplier must have zero goods receipts on record — a hard delete
 *      must never leave historical goods-received data attributed to a
 *      deleted supplier row.
 *   2. The supplier must already be deactivated (is_active === false) —
 *      same two-step gate the platform already uses for staff hard-delete.
 * Both must hold. A supplier that fails either should be deactivated
 * instead, which is always safe and always available.
 */

export interface SupplierUsageInfo {
  is_active: boolean;
  goods_receipt_count: number;
}

export interface SupplierDeleteEligibility {
  canDelete: boolean;
  /** Why deletion isn't offered, for display next to a disabled/absent Delete action. Null when canDelete is true. */
  reason: string | null;
}

export function supplierDeleteEligibility(supplier: SupplierUsageInfo): SupplierDeleteEligibility {
  // Checked in the same order as the backend (usage before active-state) so
  // a supplier that fails both shows the more fundamental reason.
  if (supplier.goods_receipt_count > 0) {
    return {
      canDelete: false,
      reason: `Has ${supplier.goods_receipt_count} goods receipt${
        supplier.goods_receipt_count === 1 ? '' : 's'
      } on record — deactivate instead to keep that history intact.`,
    };
  }
  if (supplier.is_active) {
    return {
      canDelete: false,
      reason: 'Deactivate this supplier first — a permanent delete is only offered once it is inactive.',
    };
  }
  return { canDelete: true, reason: null };
}
