import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Bike, Boxes, Building2, ChefHat, ClipboardCheck, ClipboardList, CreditCard, Download,
  FileUp, Gift, LayoutDashboard, MessageCircle, Package, Receipt, Rocket,
  Settings, ShoppingCart, Sparkles, Trash, TrendingDown, Truck, Users, UtensilsCrossed, Wallet,
} from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Hidden unless the business's inventory module is enabled (see PRODUCT_MAP.md). */
  requiresInventory?: boolean;
  /** Hidden unless the business has WhatsApp ordering enabled. */
  requiresWhatsapp?: boolean;
  /** Hidden unless the business's delivery marketplace module (Uber Eats/Mr D API) is enabled. */
  requiresDeliveryPlatforms?: boolean;
  /**
   * Hidden unless the business's Loyalty entitlement (migration 0051,
   * `Business.loyalty_enabled`, KNOWN_BUGS.md BUG-0107) is on. Unlike
   * Advanced Analytics (a section within the Analytics page, gated inline —
   * see AnalyticsPage.tsx), Loyalty is its own dedicated route with nothing
   * else on it, so nav-level gating (same as requiresInventory) is correct
   * here.
   */
  requiresLoyalty?: boolean;
}

/**
 * Single source of truth for the dashboard's navigation, used by both
 * `Sidebar.tsx` (desktop) and `MobileSidebar.tsx` (mobile) so the two can
 * never drift out of sync again (mobile was previously missing "Billing" —
 * see KNOWN_BUGS.md). Add a route here once and both menus pick it up.
 */
export const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/setup', icon: Rocket, label: 'Setup' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/menu', icon: UtensilsCrossed, label: 'Menu' },
  { to: '/specials', icon: Sparkles, label: 'Specials' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/till', icon: Wallet, label: 'Till' },
  // Import stays visible even with inventory off — it also imports the menu
  // (routes_import.py only gates its ingredients/recipes sheets, not menu).
  { to: '/import', icon: FileUp, label: 'Import' },
  // Delivery-order import is NOT inventory-gated on the backend
  // (routes_external_orders.py never calls _require_inventory_enabled) —
  // it feeds order data regardless of whether stock tracking is on.
  { to: '/delivery-orders', icon: Bike, label: 'Delivery orders' },
  // Live delivery-marketplace API module (Uber Eats direct order injection,
  // Mr D file reconciliation) — a DIFFERENT thing from the CSV importer
  // above, gated on the separate delivery_platforms_enabled entitlement
  // (migration 0044). Sub-pages (Orders/Menu Mapping) are reachable via
  // DeliverySubNav inside this page, not separate sidebar entries.
  { to: '/settings/delivery', icon: Truck, label: 'Delivery Platforms', requiresDeliveryPlatforms: true },
  { to: '/ingredients', icon: Package, label: 'Ingredients', requiresInventory: true },
  { to: '/suppliers', icon: Building2, label: 'Suppliers', requiresInventory: true },
  { to: '/opening-stock', icon: ClipboardList, label: 'Opening Stock', requiresInventory: true },
  { to: '/recipes', icon: ChefHat, label: 'Recipes', requiresInventory: true },
  { to: '/stock', icon: Boxes, label: 'Stock', requiresInventory: true },
  { to: '/stocktake', icon: ClipboardCheck, label: 'Stocktake', requiresInventory: true },
  { to: '/variance', icon: TrendingDown, label: 'Variance', requiresInventory: true },
  { to: '/wastage', icon: Trash, label: 'Wastage', requiresInventory: true },
  // Deliberately ungated here: Core Analytics (summary/top-items/daily) is
  // available on every plan, including POS-only tenants. Advanced Analytics
  // (average order value, payment method split, delivery channel breakdown
  // — Business.advanced_analytics_enabled, migration 0047) is a section
  // *within* this same page, not a separate route, so it's gated inline by
  // AnalyticsPage.tsx/src/lib/entitlements.ts instead of at the nav level —
  // hiding this whole nav item would also hide Core Analytics for a
  // non-entitled tenant, which is wrong.
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/loyalty', icon: Gift, label: 'Loyalty', requiresLoyalty: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/settings/receipts', icon: Receipt, label: 'Receipts' },
  { to: '/settings/billing', icon: CreditCard, label: 'Billing' },
  { to: '/settings/whatsapp', icon: MessageCircle, label: 'WhatsApp', requiresWhatsapp: true },
  { to: '/exports', icon: Download, label: 'Exports' },
];

/**
 * Shared visibility predicate for both `Sidebar.tsx` (desktop) and
 * `MobileSidebar.tsx` (mobile) — single source of truth so the two filters
 * can't drift apart (same reasoning as the shared `navItems` list itself).
 * Hidden (not merely disabled) while `settings` hasn't loaded yet, same as
 * the pre-existing `requiresInventory` gate, rather than flashing a
 * module-gated item on then off.
 *
 * This is a convenience/UX gate only — it hides the entry point so a
 * non-entitled tenant doesn't stumble into a page that will just 409. The
 * backend (`_require_loyalty_enabled` etc.) is the real enforcement and is
 * unaffected by anything here.
 */
export function isNavItemVisible(
  item: NavItem,
  settings: {
    inventory_enabled?: boolean;
    is_whatsapp_enabled?: boolean;
    delivery_platforms_enabled?: boolean;
    loyalty_enabled?: boolean;
  } | undefined
): boolean {
  if (item.requiresInventory && !settings?.inventory_enabled) return false;
  if (item.requiresWhatsapp && !settings?.is_whatsapp_enabled) return false;
  if (item.requiresDeliveryPlatforms && !settings?.delivery_platforms_enabled) return false;
  if (item.requiresLoyalty && !settings?.loyalty_enabled) return false;
  return true;
}
