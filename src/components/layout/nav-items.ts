import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Bike, Boxes, ChefHat, ClipboardCheck, CreditCard, Download,
  FileUp, Gift, LayoutDashboard, MessageCircle, Package, Receipt, Rocket,
  Settings, ShoppingCart, Sparkles, Trash, TrendingDown, Users, UtensilsCrossed, Wallet,
} from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Hidden unless the business's inventory module is enabled (see PRODUCT_MAP.md). */
  requiresInventory?: boolean;
  /** Hidden unless the business has WhatsApp ordering enabled. */
  requiresWhatsapp?: boolean;
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
  { to: '/ingredients', icon: Package, label: 'Ingredients', requiresInventory: true },
  { to: '/recipes', icon: ChefHat, label: 'Recipes', requiresInventory: true },
  { to: '/stock', icon: Boxes, label: 'Stock', requiresInventory: true },
  { to: '/stocktake', icon: ClipboardCheck, label: 'Stocktake', requiresInventory: true },
  { to: '/variance', icon: TrendingDown, label: 'Variance', requiresInventory: true },
  { to: '/wastage', icon: Trash, label: 'Wastage', requiresInventory: true },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/loyalty', icon: Gift, label: 'Loyalty' },
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
 */
export function isNavItemVisible(
  item: NavItem,
  settings: { inventory_enabled?: boolean; is_whatsapp_enabled?: boolean } | undefined
): boolean {
  if (item.requiresInventory && !settings?.inventory_enabled) return false;
  if (item.requiresWhatsapp && !settings?.is_whatsapp_enabled) return false;
  return true;
}
