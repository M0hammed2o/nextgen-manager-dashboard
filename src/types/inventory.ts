/**
 * Inventory types — mirror of the backend schemas in
 * backend/app/api/v1/routes_inventory.py, routes_recipes.py,
 * routes_wastage.py and routes_stocktake.py.
 *
 * Quantities ending in `_milli` are integers counting thousandths of the
 * ingredient's canonical unit (see backend/app/inventory/units.py). The API
 * also returns pre-formatted `*_display` strings so the UI never has to
 * re-implement that arithmetic — always prefer the display string when
 * showing a quantity to a person.
 */

export type CanonicalUnit = 'GRAM' | 'MILLILITRE' | 'UNIT';
export type CountMethod = 'UNIT_COUNT' | 'WEIGHT' | 'VOLUME';
export type StocktakeStatus = 'DRAFT' | 'COMPLETED' | 'APPROVED' | 'CANCELLED';

export interface Ingredient {
  id: string;
  name: string;
  sku: string | null;
  canonical_unit: CanonicalUnit;
  count_method: CountMethod;
  // Present on the backend response (routes_inventory.py IngredientResponse)
  // but missing from this type until now — several pages were already
  // reading these two fields off values typed as `Ingredient` (a real gap
  // masked only because the plain `npx tsc --noEmit` invocation in this
  // repo checks zero files; `npx tsc --noEmit -p tsconfig.app.json` is the
  // command that actually type-checks src/, see WORKLOG.md).
  unit_label: string | null;
  category: string | null;
  purchase_unit_name: string | null;
  purchase_pack_milli: number;
  cost_per_pack_cents: number | null;
  cost_per_canonical_micro_cents: number;
  par_level_milli: number | null;
  is_active: boolean;
  notes: string | null;
  on_hand_milli: number;
  on_hand_display: string;
  below_par: boolean;
}

export interface StockLevel {
  ingredient_id: string;
  name: string;
  canonical_unit: CanonicalUnit;
  count_method: CountMethod;
  on_hand_milli: number;
  on_hand_display: string;
  par_level_milli: number | null;
  below_par: boolean;
  unit_cost_micro_cents: number;
  value_cents: number;
}

export interface StockMovement {
  id: string;
  quantity_milli: number;
  movement_type: string;
  source_type: string | null;
  source_id: string | null;
  value_cents: number;
  notes: string | null;
  occurred_at: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  // Usage visibility (routes_inventory.py SupplierResponse) — derived live
  // from goods_receipts, never cached, so deactivation/deletion decisions
  // are always based on the current picture.
  goods_receipt_count: number;
  last_received_at: string | null;
}

export interface RecipeItem {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  canonical_unit: CanonicalUnit;
  quantity_milli: number;
  quantity_display: string;
  option_group_id: string | null;
  option_id: string | null;
  removable_ref_id: string | null;
  cost_cents: number;
  sort_order: number;
}

export interface Recipe {
  id: string;
  menu_item_id: string | null;
  menu_add_on_id: string | null;
  version: number;
  is_active: boolean;
  yield_qty: number;
  notes: string | null;
  items: RecipeItem[];
  base_food_cost_cents: number;
  max_food_cost_cents: number;
}

export interface WastageReasonOption {
  value: string;
  label: string;
  requires_note: boolean;
}

/** WastageResponse.status (routes_wastage.py `_wastage_status`) — the whole lifecycle summary in one field. */
export type WastageStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';

export interface WastageEntry {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity_milli: number;
  quantity_display: string;
  reason: string;
  note: string | null;
  value_cents: number;
  requires_approval: boolean;
  approved_by_user_id: string | null;
  rejected_by_user_id: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  status: WastageStatus;
  logged_by_name: string | null;
  approved_by_name: string | null;
  rejected_by_name: string | null;
  related_order_id: string | null;
  photo_asset_id: string | null;
  photo_url: string | null;
  occurred_at: string;
}

export interface StocktakeLine {
  ingredient_id: string;
  ingredient_name: string;
  canonical_unit: CanonicalUnit;
  count_method: CountMethod;
  /** The noun this ingredient is counted in (e.g. "portion") — null for mass/volume. */
  unit_label: string | null;
  counted_quantity_milli: number | null;
  counted_display: string | null;
  opening_quantity_milli: number;
  received_quantity_milli: number;
  theoretical_consumption_milli: number;
  wastage_quantity_milli: number;
  adjustment_quantity_milli: number;
  expected_quantity_milli: number;
  expected_display: string;
  variance_quantity_milli: number;
  variance_display: string;
  variance_value_cents: number;
  /** Basis points: 200 = 2.00%. Null when nothing was consumed to divide by. */
  variance_basis_points: number | null;
  variance_percent: string;
  is_flagged: boolean;
  notes: string | null;
}

export interface Stocktake {
  id: string;
  reference: string | null;
  status: StocktakeStatus;
  cutoff_at: string;
  period_start_at: string | null;
  opened_at: string;
  completed_at: string | null;
  approved_at: string | null;
  opened_by_user_id: string | null;
  completed_by_user_id: string | null;
  approved_by_user_id: string | null;
  total_variance_value_cents: number;
  total_theoretical_value_cents: number;
  /** 10000 = 100.00% accurate, value-weighted. Null with no consumption. */
  accuracy_basis_points: number | null;
  accuracy_percent: string;
  is_locked: boolean;
  lines: StocktakeLine[];
  notes: string | null;
}

export interface StocktakeSummary {
  id: string;
  reference: string | null;
  status: StocktakeStatus;
  opened_at: string | null;
  cutoff_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  /** Resolved server-side so the client needs no user directory to render an audit trail. */
  opened_by_name: string | null;
  completed_by_name: string | null;
  approved_by_name: string | null;
  line_count: number;
  counted_line_count: number;
  total_variance_value_cents: number;
  total_theoretical_value_cents: number;
  is_locked: boolean;
  notes: string | null;
}
