// ═══════════════════════════════════════════════════════════════
// Types aligned to REAL backend schemas — source of truth
// ═══════════════════════════════════════════════════════════════

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface SetPasswordRequest {
  email: string;
  current_password: string;
  new_password: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
  staff_name: string | null;
  role: string;
  business_id: string | null;
  business_name: string | null;
}

export interface LoginResponse {
  tokens: AuthTokens;
  user: AuthUser;
}

export interface MeResponse extends AuthUser {
  last_login_at: string | null;
}

// Analytics — matches backend AnalyticsSummary exactly
export interface AnalyticsSummaryRaw {
  period?: string;
  total_orders?: number;
  completed_orders?: number;
  cancelled_orders?: number;
  revenue_cents?: number;
  total_messages?: number;
  llm_calls?: number;
  llm_cost_cents?: number;
  unique_customers?: number;
}

export interface AnalyticsSummary {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  revenue: number;
  totalMessages: number;
  llmCalls: number;
  llmCost: number;
  uniqueCustomers: number;
}

// Backend field: "name" (not item_name)
export interface TopItem {
  name: string;
  quantity: number;
  revenue_cents: number;
}

// Backend field: "day" (not date), "messages" (present)
export interface DailyAnalytics {
  day: string;
  orders: number;
  revenue_cents: number;
  messages: number;
}

// ── Advanced Analytics (NextGen Complete and above — migration 0047,
//    gated server-side by Business.advanced_analytics_enabled). Matches
//    backend/app/api/v1/routes_analytics.py's AverageOrderValue/
//    PaymentMethodBreakdown/PaymentMethodsReport response models exactly. ──

export interface AverageOrderValue {
  period: string;
  completed_orders: number;
  net_cents: number;
  /** 0 when completed_orders is 0 — never a divide-by-zero on the backend. */
  average_order_value_cents: number;
}

export interface PaymentMethodBreakdown {
  /** e.g. "CASH" | "CARD" | "UNKNOWN" (NULL payment_method coalesced server-side) — no fixed enum, render whatever comes back. */
  payment_method: string;
  order_count: number;
  gross_cents: number;
  vat_cents: number;
  refunds_cents: number;
  net_cents: number;
}

export interface PaymentMethodsReport {
  days: number;
  since: string;
  methods: PaymentMethodBreakdown[];
  total_orders: number;
  total_gross_cents: number;
  total_refunds_cents: number;
  total_net_cents: number;
}

// Matches the dict shape returned by GET /business/external-orders/channels
// (routes_external_orders.py::channel_breakdown) — no dedicated Pydantic
// response model on the backend, so this type is hand-derived from that
// route's literal return dict.
export interface ChannelBreakdown {
  source: string;
  label: string;
  is_external: boolean;
  order_count: number;
  gross_cents: number;
  vat_cents: number;
  refunds_cents: number;
  net_cents: number;
}

export interface ChannelsReport {
  days: number;
  since: string;
  channels: ChannelBreakdown[];
  total_orders: number;
  total_gross_cents: number;
  total_refunds_cents: number;
  total_net_cents: number;
  external_gross_cents: number;
}

// Orders — matches backend OrderResponse exactly
export type OrderStatus = 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'READY' | 'COLLECTED' | 'DELIVERED' | 'CANCELLED';

// Backend OrderItemResponse
export interface OrderItemAddOn {
  name: string;
  price_cents: number;
  quantity: number;
}

export interface OrderItem {
  id: string;
  name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  options_snapshot: Record<string, unknown> | null;
  add_ons_snapshot: OrderItemAddOn[] | null;
  // Matches what the backend actually ever writes here (both
  // backend/app/bot/pipeline.py::_resolve_option_prices and
  // backend/app/pos/pricing.py) -- group_id/option_id also exist but are
  // unused by this app today.
  selected_options_snapshot: Array<{ group_name: string; option_name: string; price_delta_cents: number }> | null;
  special_instructions: string | null;
}

// Backend Order.payment_status — the full set the model actually writes
// (shared/enums.py / routes_pos.py / routes_orders.py), not just the subset
// a normal WhatsApp/manual order lifecycle touches. VOIDED/PARTIALLY_REFUNDED
// only ever appear after a manager reversal (see OrderReversalPanel).
export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'VOIDED'
  | 'CASH_ON_COLLECTION';

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  payment_link_url: string | null;
  payment_required: boolean;
  paid_at: string | null;
  order_mode: string;
  source: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  currency: string;
  // Set only once a refund/void has actually happened — routes_pos.py's
  // refund/void endpoints and routes_orders.py's provider refund endpoint
  // are the only writers. refund_amount_cents is the amount actually
  // reversed (may be less than total_cents for a partial refund).
  refund_amount_cents: number | null;
  refund_reference: string | null;
  refunded_at: string | null;
  customer_name: string | null;
  phone_number: string | null;
  delivery_address: string | null;
  estimated_ready_at: string | null;
  confirmed_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_reason: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

// Backend OrderCreate — manual order from dashboard
export interface CreateOrderRequest {
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  items: {
    name: string;
    qty: number;
    price_cents: number;
    options?: Record<string, unknown>;
    special_instructions?: string;
  }[];
  notes?: string;
  order_mode?: string;
  source?: string;
}

// Paginated response wrapper
export interface PaginationMeta {
  per_page: number;
  next_cursor: string | null;
  has_more: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// Menu — matches backend CategoryResponse / ItemResponse
export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

// Phase 8: Paid add-on — matches backend AddOnResponse
export interface MenuAddOn {
  id: string;
  name: string;
  price_cents: number;
  min_qty: number;
  max_qty: number;
  default_qty: number;
  is_active: boolean;
  sort_order: number;
}

// Option groups (e.g. "Size") — mirrors backend OptionGroupSchema/OptionChoiceSchema
// in backend/app/api/v1/routes_menu.py exactly. price_delta_cents is signed:
// negative = cheaper than the item's base price, positive = more expensive.
export interface MenuOptionChoice {
  id: string;
  name: string;
  price_delta_cents: number;
  sort_order: number;
  is_enabled: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  is_enabled: boolean;
  default_option_id: string | null;
  options: MenuOptionChoice[];
}

export interface RemovableIngredient {
  id: string;
  name: string;
}

export interface MenuItemOptions {
  option_groups: MenuOptionGroup[];
  removable_ingredients?: RemovableIngredient[];
}

export interface MenuItem {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  options_json: MenuItemOptions | null;
  add_ons: MenuAddOn[];
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
  requires_preparation: boolean;
}

export interface CreateMenuItemRequest {
  category_id?: string;
  name: string;
  description?: string;
  price_cents: number;
  sort_order?: number;
  // null (not omitted) is required to actually CLEAR an existing image on an
  // update — same partial-update rule as options_json below.
  image_asset_id?: string | null;
  // null (not omitted) is required to actually CLEAR existing options on an
  // update — the backend does a partial update via exclude_unset, so an
  // omitted key leaves the stored value untouched.
  options_json?: MenuItemOptions | null;
  requires_preparation?: boolean;
}

// Matches backend's ItemUpdate schema (routes_menu.py) — every field optional
// (partial update via exclude_unset), plus `is_active` which only makes
// sense on an existing item, not at creation time.
export type UpdateMenuItemRequest = Partial<CreateMenuItemRequest> & {
  is_active?: boolean;
};

// Specials — matches backend SpecialResponse
export interface Special {
  id: string;
  title: string;
  description: string | null;
  days_of_week: string[] | null;
  start_at: string | null;
  end_at: string | null;
  rule_json: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
  created_at: string;
}

// Staff — matches backend StaffResponse
export interface StaffMember {
  id: string;
  staff_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  // Present only in the response right after creation, when no pin was
  // supplied — shown once, never returned by GET/PUT.
  initial_pin?: string | null;
}

export interface CreateStaffRequest {
  staff_name: string;
  email?: string;
  password?: string;
  role: string;
  pin?: string;
}

// Business Settings — matches backend BusinessSettingsResponse
export interface BusinessSettings {
  id: string;
  name: string;
  slug: string;
  business_code: string;
  timezone: string;
  business_hours: Record<string, { open: string; close: string } | null> | null;
  greeting_text: string | null;
  fallback_text: string | null;
  closed_text: string | null;
  busy_text: string | null;
  order_in_only: boolean;
  delivery_enabled: boolean;
  delivery_fee_cents: number;
  require_customer_name: boolean;
  require_phone_number: boolean;
  require_delivery_address: boolean;
  currency: string;
  plan: string;
  billing_status: string;
  daily_message_limit: number;
  daily_llm_call_limit: number;
  daily_order_limit: number;
  address: string | null;
  phone: string | null;
  menu_image_url: string | null;
  // Payment settings
  payment_methods_enabled: string[] | null;
  online_payment_required: boolean;
  payment_provider: string | null;
  payment_timeout_minutes: number;
  eft_bank_name: string | null;
  eft_account_name: string | null;
  eft_account_number: string | null;
  eft_branch_code: string | null;
  eft_reference_prefix: string | null;
  // Provider credentials — hints only, never raw values
  payment_api_key_hint: string | null;
  payment_api_secret_hint: string | null;
  payment_webhook_secret_configured: boolean;
  // POS till payment settings — distinct from payment_methods_enabled above,
  // which governs the WhatsApp/online-order flow.
  pos_cash_enabled: boolean;
  pos_card_enabled: boolean;
  pos_payfast_enabled: boolean;
  pos_yoco_enabled: boolean;
  pos_ikhoka_enabled: boolean;
  pos_direct_eft_enabled: boolean;
  pos_other_payment_enabled: boolean;
  pos_table_number_required: boolean;
  // Staff app navigation — which tabs this tenant's bottom bar shows. These
  // hide tabs only; the underlying features and their APIs are untouched.
  staff_live_orders_tab_enabled: boolean;
  staff_wastage_tab_enabled: boolean;
  staff_stocktake_tab_enabled: boolean;
  // How often a count is expected. Guidance and overdue-flagging only — it
  // never blocks staff from starting one.
  stocktake_frequency: 'DAILY_1' | 'DAILY_2' | 'DAILY_3' | 'DAILY_4' | 'CUSTOM';
  stocktake_times_json: string[] | null;
  // Whether the inventory module (ingredients/recipes/stock/stocktake/
  // variance) is switched on for this tenant — was missing from this type
  // even though the backend has always returned it (routes_business.py
  // BusinessSettingsResponse.inventory_enabled); nothing in the dashboard
  // could read it until now.
  inventory_enabled: boolean;
  // Platform-admin kill switch for the WhatsApp ordering channel (read-only
  // here — routes_business.py's BusinessSettingsResponse.is_whatsapp_enabled,
  // defaults true). Used to hide WhatsApp-only UI (pause banner, chatbot/
  // online-order settings sections) for a POS-only tenant.
  is_whatsapp_enabled: boolean;
  // Delivery marketplace entitlements (migration 0044, admin_api commits
  // ca95867/82e0143) — platform-admin-set, business-plane READ-ONLY (see
  // admin-suite ModuleTogglesFieldset's superAdminOnly gating). A true value
  // is commercial permission only — it does NOT mean Uber/Mr D has approved
  // or connected this restaurant; see DeliveryConnectionResponse.status for
  // the real live/sandbox/awaiting-approval state.
  delivery_platforms_enabled: boolean;
  uber_eats_enabled: boolean;
  mrd_enabled: boolean;
  // Advanced Analytics entitlement (migration 0047) — platform-admin-set,
  // business-plane READ-ONLY, same pattern as inventory_enabled/
  // delivery_platforms_enabled above. Gates GET /business/analytics/
  // average-order-value, /business/analytics/payment-methods, and
  // /business/external-orders/channels (routes_analytics.py,
  // routes_external_orders.py; backend/app/analytics/revenue.py::
  // require_advanced_analytics_enabled). A false value does NOT affect
  // Core Analytics (/summary, /top-items, /daily), which stays available
  // on every plan.
  advanced_analytics_enabled: boolean;
}

// WhatsApp pause/busy toggle
export interface WhatsAppStatus {
  paused: boolean;
  paused_at: string | null;
  paused_by_name: string | null;
  busy_text: string | null;
}

// ── WhatsApp Connect (customer-owned WhatsApp via Meta Embedded Signup) —
//    matches backend/app/api/v1/routes_whatsapp_connect.py exactly ──
export type WhatsAppConnectionStatusValue =
  | 'NOT_CONNECTED' | 'PENDING' | 'CONNECTED' | 'NEEDS_ATTENTION' | 'DISCONNECTED';

/** GET /v1/business/whatsapp/connection/config — public identifiers only, never a secret. */
export interface WhatsAppConnectConfig {
  available: boolean;
  reason: string | null;
  app_id: string | null;
  config_id: string | null;
  graph_version: string | null;
}

/**
 * GET /v1/business/whatsapp/connection — deliberately never includes a
 * token/secret (see routes_whatsapp_connect.py's WhatsAppConnectionStatus
 * docstring). Safe to hold in component state / TanStack Query cache.
 */
export interface WhatsAppConnection {
  connected: boolean;
  status: WhatsAppConnectionStatusValue;
  status_reason: string | null;
  waba_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  webhook_subscribed: boolean;
  phone_registered: boolean;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_health_check_at: string | null;
  last_webhook_at: string | null;
  on_legacy_platform_path: boolean;
  whatsapp_module_enabled: boolean;
  whatsapp_paused: boolean;
}

/** POST /v1/business/whatsapp/connection/start — mints a single-use, ~10-minute anti-CSRF state token. */
export interface WhatsAppConnectStartResponse {
  state: string;
  expires_in: number;
}

export interface WhatsAppExchangeRequest {
  // Anti-CSRF/replay state minted by POST /connection/start — required as of
  // tonight's backend hardening pass. A request without a valid, matching,
  // unexpired state is rejected with 401 INVALID_OR_EXPIRED_STATE.
  state: string;
  code: string;
  waba_id: string;
  phone_number_id: string;
}

export interface WhatsAppExchangeResponse {
  success: boolean;
  failed_step: string | null;
  message: string;
  connection: WhatsAppConnection;
}

export interface WhatsAppHealthCheckResponse {
  ok: boolean;
  detail: string;
  technical_details: Record<string, unknown>;
  connection: WhatsAppConnection;
}

export interface WhatsAppTestMessageResponse {
  success: boolean;
  detail: string;
}

// ── Digital receipts (backend/app/api/v1/routes_receipts.py,
//    GET /v1/business/digital-receipts/usage) — metering visibility only,
//    not analytics. The entitlement flag itself (Business.digital_receipts_
//    enabled) is not currently returned by GET /v1/business/settings (see
//    BusinessSettingsResponse in routes_business.py) — a backend gap, not
//    something the frontend can infer from this response. ──
export interface DigitalReceiptsUsage {
  receipts_requested: number;
  whatsapp_sent: number;
  whatsapp_failed: number;
}

/** POST /v1/business/orders/{order_id}/receipt/resend */
export interface ReceiptResendRequest {
  phone_number?: string;
}

export interface ReceiptResendResponse {
  id: string;
  order_id: string;
  receipt_url: string;
  whatsapp_status: string;
  whatsapp_failure_reason: string | null;
}

// ── Loyalty (backend/app/api/v1/routes_loyalty.py, prefix /business/loyalty) ──
export interface LoyaltyProgram {
  is_enabled: boolean;
  points_per_rand: number;
  points_per_order: number;
  points_expiry_days: number | null;
  min_redemption_points: number;
  silver_tier_points: number;
  gold_tier_points: number;
  birthday_reward_points: number | null;
  referral_reward_points: number | null;
  double_points_promo_active: boolean;
  double_points_promo_starts_at: string | null;
  double_points_promo_ends_at: string | null;
}

/** PUT body — every field optional, only changed fields need to be sent. */
export type LoyaltyProgramUpdate = Partial<LoyaltyProgram>;

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  is_active: boolean;
}

export interface LoyaltyRewardCreate {
  name: string;
  description: string | null;
  points_cost: number;
}

export type LoyaltyRewardUpdate = Partial<LoyaltyRewardCreate> & { is_active?: boolean };

export interface CustomerLoyalty {
  customer_id: string;
  display_name: string | null;
  phone_number: string | null;
  loyalty_points_balance: number;
  loyalty_tier: string;
}

/**
 * POST /redeem body — a customer redeems one catalogue reward (by id), NOT
 * an arbitrary point amount. There is no "amount" field — see
 * routes_loyalty.py RedeemRequest.
 */
export interface LoyaltyRedeemRequest {
  customer_id: string;
  reward_id: string;
}

/**
 * POST /redeem response. This ONLY adjusts the customer's points balance —
 * `redeem_reward()` in backend/app/loyalty/engine.py never touches an
 * order (order_id is always null on the resulting LoyaltyTransaction). Any
 * UI built on this response must describe it as recording a points
 * redemption, never as applying a discount to an order.
 */
export interface LoyaltyRedeemResponse {
  success: boolean;
  points_delta: number;
  balance_after: number;
}

// Assets
export interface UploadUrlResponse {
  upload_url: string;
  storage_path: string;
  asset_id: string;
  public_url: string;
}

export interface SignedUrlResponse {
  signed_url: string;
}

// ── Billing (NextGen's own SaaS subscription of this business — distinct
//    from the customer-facing PaymentMethods/PaymentProvider settings above) ──
export type SelfServicePlan = 'STARTER' | 'GROWTH';

export interface BillingStatus {
  plan: string;
  billing_status: string;
  is_active: boolean;
  has_subscription: boolean;
  supports_self_service_portal: boolean;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
}

export interface PortalSessionResponse {
  portal_url: string | null;
  supported: boolean;
}

// ── Wave 0A — commercial account status + EFT/cash invoices (matches
//    backend/app/api/v1/routes_billing.py AccountStatusResponse /
//    CommercialInvoiceCustomerResponse). Distinct from the self-service
//    Stripe/PayFast BillingStatus above. ──
export type AccountStatusValue =
  | 'TRIAL' | 'ACTIVE' | 'PAYMENT_DUE' | 'OVERDUE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';

// backend/app/billing/account_status.py's ALERT_* constants.
export type AccountAlertCode =
  | 'TRIAL_ENDS_7D' | 'TRIAL_ENDS_3D' | 'TRIAL_ENDS_1D' | 'TRIAL_EXPIRED'
  | 'INVOICE_OVERDUE' | 'PAYMENT_AWAITING' | 'SUSPENDED';

export interface AccountStatus {
  status: AccountStatusValue;
  plan: string;
  billing_status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_days_remaining: number | null;
  alerts: AccountAlertCode[];
}

export interface CommercialInvoice {
  id: string;
  invoice_number: string | null;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  payment_method: string | null;
  paid_at: string | null;
}

// Matches the Staff PWA's identical type (nextgen-staff-ops-main/src/types/index.ts)
// -- same backend routes (`/business/pos/till/*`), same response shape.
export interface TillSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  opening_float_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  cash_sales_cents?: number | null;
  cash_refunds_cents?: number | null;
  opened_at: string;
  closed_at: string | null;
}

/**
 * One past cash-up — GET /v1/business/pos/till/sessions (owner/manager only).
 * Staff names are resolved server-side so this page needs no user directory.
 */
export interface TillSessionHistoryEntry {
  id: string;
  status: 'OPEN' | 'CLOSED';
  opening_float_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
}

// ── Delivery marketplace (backend/app/api/v1/routes_delivery.py, prefix
//    /business/delivery) — Uber Eats + Mr D. Types match that module's
//    Pydantic response schemas field-for-field (read 2026-09-22).
//
// HONESTY CONTRACT: `DeliveryConnectionStatus` is commercial-correctness
// vocabulary, not a generic PENDING/ACTIVE/PAUSED set (see
// shared/models/delivery.py's DeliveryConnection.status comment) — SANDBOX
// and AWAITING_APPROVAL must never be presented as "Connected"/live in any
// UI. Only CONNECTED is a real, live, order-receiving connection. ──
export type DeliveryProvider = 'UBER_EATS' | 'MR_D';

export type DeliveryConnectionStatus =
  | 'NOT_CONNECTED' | 'SANDBOX' | 'AWAITING_APPROVAL' | 'CONNECTED'
  | 'ATTENTION_REQUIRED' | 'DISABLED';

/**
 * GET /v1/business/delivery/connections, GET .../connections/{provider} —
 * deliberately NEVER includes provisioning_token_encrypted or any credential
 * (see routes_delivery.py's module docstring). `id` is null for a
 * synthesised NOT_CONNECTED row (no DeliveryConnection exists yet for this
 * provider/business).
 */
export interface DeliveryConnectionResponse {
  id: string | null;
  provider: DeliveryProvider;
  provider_label: string;
  status: DeliveryConnectionStatus;
  environment: string;
  external_store_id: string | null;
  store_status: string | null;
  last_status_synced_at: string | null;
  activated_at: string | null;
  disconnected_at: string | null;
  error_reason: string | null;
  needs_attention: boolean;
  last_webhook_at: string | null;
  last_order_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type DeliveryOrderStatus =
  | 'RECEIVED' | 'FETCHING' | 'NEEDS_MAPPING' | 'READY_TO_ACCEPT'
  | 'ACCEPTED' | 'DENIED' | 'FULFILLED' | 'CANCELLED' | 'FAILED';

/** Item/modifier text that failed to resolve against a saved mapping (unresolved_items_json). */
export interface DeliveryUnresolvedItem {
  external_id?: string | null;
  external_text?: string;
  [key: string]: unknown;
}

export interface DeliveryOrderResponse {
  id: string;
  provider: DeliveryProvider;
  provider_label: string;
  external_order_id: string;
  status: DeliveryOrderStatus;
  order_id: string | null;
  gross_cents: number | null;
  fee_cents: number | null;
  currency: string;
  placed_at: string | null;
  // received_at + 600s (deliberately under Uber's real 690s/11.5min deadline)
  // — the point past which the accept-deadline watchdog auto-denies an
  // still-open order. See UBER_EATS_INTEGRATION_2026-10.md §1.
  accept_deadline_at: string | null;
  accepted_at: string | null;
  denied_at: string | null;
  cancelled_at: string | null;
  deny_reason_code: string | null;
  deny_reason_text: string | null;
  unresolved_items: DeliveryUnresolvedItem[] | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryOrderListResponse {
  orders: DeliveryOrderResponse[];
  total: number;
  limit: number;
  offset: number;
}

// Uber's real accepted reason-code enum (routes_delivery.py::_DENY_REASON_CODES)
// — deny_order 422s on anything else.
export const DELIVERY_DENY_REASON_CODES = [
  'STORE_CLOSED', 'POS_NOT_READY', 'POS_OFFLINE', 'ITEM_AVAILABILITY',
  'MISSING_ITEM', 'MISSING_INFO', 'PRICING', 'CAPACITY', 'ADDRESS',
  'SPECIAL_INSTRUCTIONS', 'OTHER',
] as const;
export type DeliveryDenyReasonCode = typeof DELIVERY_DENY_REASON_CODES[number];

export interface DeliveryDenyOrderRequest {
  reason_code: DeliveryDenyReasonCode;
  notes?: string | null;
}

export type DeliveryMappingKind = 'ITEM' | 'MODIFIER' | 'MODIFIER_GROUP' | 'CATEGORY';
export type DeliveryMappingStatus = 'MAPPED' | 'UNMAPPED' | 'CHANGED' | 'INVALID' | 'IGNORED';

export interface DeliveryMappingResponse {
  id: string;
  platform: DeliveryProvider;
  kind: DeliveryMappingKind;
  external_id: string | null;
  external_text: string;
  status: DeliveryMappingStatus;
  status_reason: string | null;
  menu_item_id: string | null;
  menu_item_name: string | null;
  option_id: string | null;
  menu_add_on_id: string | null;
  menu_add_on_name: string | null;
  removable_ref_id: string | null;
  is_ignored: boolean;
  last_seen_at: string | null;
  times_used: number;
}

export interface DeliveryMappingUpsertRequest {
  platform: DeliveryProvider;
  kind: DeliveryMappingKind;
  external_id: string;
  external_text: string;
  menu_item_id?: string | null;
  option_id?: string | null;
  menu_add_on_id?: string | null;
  removable_ref_id?: string | null;
  is_ignored?: boolean;
}
