// ═══════════════════════════════════════════════════════════════
// Types aligned to REAL backend schemas — source of truth
// ═══════════════════════════════════════════════════════════════

// Auth
export interface LoginRequest {
  email: string;
  password: string;
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
  selected_options_snapshot: Array<{ group: string; option: string; price_delta_cents: number }> | null;
  special_instructions: string | null;
}

export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CASH_ON_COLLECTION';

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

export interface MenuItem {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  options_json: Record<string, unknown> | null;
  add_ons: MenuAddOn[];
  is_active: boolean;
  sort_order: number;
  image_url: string | null;
}

export interface CreateMenuItemRequest {
  category_id?: string;
  name: string;
  description?: string;
  price_cents: number;
  sort_order?: number;
  image_asset_id?: string;
  options_json?: Record<string, unknown>;
}

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
}

// Assets
export interface UploadUrlResponse {
  upload_url: string;
  asset_id: string;
}

export interface SignedUrlResponse {
  signed_url: string;
}
