import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Bike, Boxes, ClipboardCheck, Download,
  FileUp, Gift, LayoutDashboard, MessageCircle, Receipt, Rocket,
  Palette, Settings, ShoppingCart, Sparkles, UserRound, Users, UtensilsCrossed, Wallet,
} from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Hidden unless the business's inventory module is enabled (see PRODUCT_MAP.md). */
  requiresInventory?: boolean;
  /** Hidden unless the business has WhatsApp ordering enabled. */
  requiresWhatsapp?: boolean;
  /**
   * Hidden unless the business's Loyalty entitlement (migration 0051,
   * `Business.loyalty_enabled`, KNOWN_BUGS.md BUG-0107) is on. Unlike
   * Advanced Analytics (a section within the Analytics page, gated inline —
   * see AnalyticsPage.tsx), Loyalty is its own dedicated route with nothing
   * else on it, so nav-level gating (same as requiresInventory) is correct
   * here.
   */
  requiresLoyalty?: boolean;
  /**
   * UI V2.1, A5: shown as a top-level shortcut ONLY while the business has
   * not yet finished setup (`useSetupProgress().ready_to_trade === false`).
   * Once trading, this entry disappears from the top level — Setup is still
   * reachable permanently via the Settings group below. Hidden (not shown
   * then removed) while setup-progress hasn't loaded yet, same "hide while
   * unknown" rule as every other entitlement gate here.
   */
  requiresSetupIncomplete?: boolean;
  /**
   * UI V2.1 follow-up (Part C4): shown while EITHER
   * `delivery_reconciliation_enabled` OR `delivery_platforms_enabled` is
   * true — the two are independent commercial entitlements (CSV/manual
   * reconciliation vs. the live marketplace integrations), so a tenant with
   * only one of them still needs this entry. Hidden only when BOTH are
   * false (or unknown). Matched against the single precomputed
   * `ctx.has_delivery_access` rather than two separate `requires*` flags,
   * since every other gate in this file is AND-combined and this is
   * deliberately OR — see `isNavItemVisible`.
   */
  requiresDeliveryAccess?: boolean;
  /**
   * WhatsApp-only subscriptions (2026-10): hidden only once we positively
   * know the business's POS/till module is switched off
   * (`Business.pos_enabled === false`, read via BusinessSettings.pos_enabled
   * — see types/api.ts for the backend-contract assumption this was built
   * against). Deliberately the OPPOSITE default-safety direction from every
   * other `requires*` flag above: those hide while the flag is unknown
   * (`undefined`) because an entitlement should never flash on before it's
   * confirmed. POS is not a new entitlement being added for a subset of
   * tenants — it is the pre-existing default for nearly every tenant today,
   * so hiding Till while `pos_enabled` is merely unknown/not-yet-loaded (or
   * absent from an older cached settings response) would wrongly hide a
   * core feature for the overwhelming majority of existing POS tenants
   * during rollout. Only an explicit `false` hides it.
   */
  requiresPos?: boolean;
  /**
   * UI V2.1, A6: an expandable group (currently only "Settings") instead of
   * a standalone route. Each child is rendered as its own link when the
   * group is expanded; the parent itself is not a route.
   */
  children?: NavItem[];
}

/**
 * Single source of truth for the dashboard's navigation, used by both
 * `Sidebar.tsx` (desktop) and `MobileSidebar.tsx` (mobile) so the two can
 * never drift out of sync again (mobile was previously missing "Billing" —
 * see KNOWN_BUGS.md). Add a route here once and both menus pick it up.
 *
 * UI V2.1 consolidation (A2-A6): the final top-level order is Dashboard /
 * (Setup, while incomplete) / Orders / Menu / Specials / Loyalty /
 * Customers / Staff / Till / Delivery Orders / Inventory / Stocktake /
 * Analytics / Settings.
 *
 * - Customers (WhatsApp-only subscription support, 2026-10): closes a gap
 *   that existed for every tenant, not a POS- or WhatsApp-only-specific
 *   feature — deliberately ungated (no `requires*` flag), placed next to
 *   Loyalty since both are customer-relationship surfaces.
 * - Till (same effort): gains `requiresPos`, hidden only once
 *   `pos_enabled === false` is positively known — see that flag's own
 *   comment above for why this is the one flag in this file that defaults
 *   to VISIBLE rather than hidden while unknown. The `/till` route itself
 *   stays registered in App.tsx regardless (same precedent as Billing,
 *   removed from nav entirely in A6 but still reachable at
 *   /settings/billing), so a WhatsApp-only tenant that later adds a
 *   physical till can still reach it by URL even before this nav entry
 *   reappears.
 *
 * - Inventory (A3): the 7 non-stocktake inventory pages (Stock, Ingredients,
 *   Recipes, Suppliers, Opening Stock, Variance, Wastage) are no longer
 *   separate sidebar entries. They are reached via one "Inventory" entry
 *   pointing at /stock, cross-linked by `InventorySubNav` on every one of
 *   those pages. Stocktake stays its own top-level item per the brief, since
 *   it's a daily staff workflow, not a setup/admin page. All 8 URLs are
 *   unchanged. Both are hidden together when inventory is off.
 * - Delivery Orders (A4, follow-up Part C4): the CSV/manual reconciliation
 *   importer (`/delivery-orders`) and the live marketplace pages
 *   (`/settings/delivery*`) are ONE sidebar entry, cross-linked by
 *   `DeliverySubNav`. Shown while EITHER `delivery_reconciliation_enabled`
 *   OR `delivery_platforms_enabled` is true (`requiresDeliveryAccess`) —
 *   these are two independent commercial entitlements (reconciliation vs.
 *   live marketplace), never one conflated flag. Hidden only when BOTH are
 *   off. Inside the page, `DeliverySubNav` gates the CSV/Import tab on
 *   `delivery_reconciliation_enabled` and the Connections/Orders/Menu
 *   Mapping tabs on `delivery_platforms_enabled` — see that component's own
 *   comment for the full per-tab breakdown and why a direct link to a
 *   now-disabled tab redirects rather than rendering blank.
 * - Settings (A6): General/Setup/Import/Branding/Receipts/WhatsApp/Exports
 *   are grouped under one expandable "Settings" parent instead of being 7
 *   flat top-level entries. Billing is deliberately REMOVED from the nav
 *   entirely (route and page stay, see BillingPage.tsx/App.tsx) per the
 *   brief. "General" is the existing /settings page, unchanged inside.
 */
export const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/setup', icon: Rocket, label: 'Setup', requiresSetupIncomplete: true },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/menu', icon: UtensilsCrossed, label: 'Menu' },
  { to: '/specials', icon: Sparkles, label: 'Specials' },
  { to: '/loyalty', icon: Gift, label: 'Loyalty', requiresLoyalty: true },
  { to: '/customers', icon: UserRound, label: 'Customers' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/till', icon: Wallet, label: 'Till', requiresPos: true },
  { to: '/delivery-orders', icon: Bike, label: 'Delivery Orders', requiresDeliveryAccess: true },
  { to: '/stock', icon: Boxes, label: 'Inventory', requiresInventory: true },
  { to: '/stocktake', icon: ClipboardCheck, label: 'Stocktake', requiresInventory: true },
  // Deliberately ungated here: Core Analytics (summary/top-items/daily) is
  // available on every plan, including POS-only tenants. Advanced Analytics
  // (average order value, payment method split, delivery channel breakdown
  // — Business.advanced_analytics_enabled, migration 0047) is a section
  // *within* this same page, not a separate route, so it's gated inline by
  // AnalyticsPage.tsx/src/lib/entitlements.ts instead of at the nav level —
  // hiding this whole nav item would also hide Core Analytics for a
  // non-entitled tenant, which is wrong.
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  {
    to: '/settings',
    icon: Settings,
    label: 'Settings',
    children: [
      { to: '/settings', icon: Settings, label: 'General' },
      { to: '/setup', icon: Rocket, label: 'Setup' },
      { to: '/import', icon: FileUp, label: 'Import' },
      { to: '/settings/branding', icon: Palette, label: 'Branding' },
      { to: '/settings/receipts', icon: Receipt, label: 'Receipts' },
      { to: '/settings/whatsapp', icon: MessageCircle, label: 'WhatsApp', requiresWhatsapp: true },
      { to: '/exports', icon: Download, label: 'Exports' },
    ],
  },
];

/**
 * Shared visibility predicate for both `Sidebar.tsx` (desktop) and
 * `MobileSidebar.tsx` (mobile) — single source of truth so the two filters
 * can't drift apart (same reasoning as the shared `navItems` list itself).
 * Hidden (not merely disabled) while `ctx` hasn't loaded yet, same as the
 * pre-existing `requiresInventory` gate, rather than flashing a
 * module-gated item on then off. Applies recursively to `children` too.
 *
 * This is a convenience/UX gate only — it hides the entry point so a
 * non-entitled tenant doesn't stumble into a page that will just 409. The
 * backend (`_require_loyalty_enabled` etc.) is the real enforcement and is
 * unaffected by anything here.
 */
export function isNavItemVisible(
  item: NavItem,
  ctx: {
    inventory_enabled?: boolean;
    is_whatsapp_enabled?: boolean;
    loyalty_enabled?: boolean;
    ready_to_trade?: boolean;
    /**
     * Precomputed `delivery_reconciliation_enabled || delivery_platforms_enabled`
     * — see `requiresDeliveryAccess`'s own comment for why this is one
     * OR-combined field rather than two AND-style `requires*` flags.
     */
    has_delivery_access?: boolean;
    /**
     * WhatsApp-only subscriptions (2026-10) — see `requiresPos`'s own
     * comment on `NavItem` for why this flag's default-safety direction is
     * the opposite of every other one here.
     */
    pos_enabled?: boolean;
  } | undefined
): boolean {
  if (item.requiresInventory && !ctx?.inventory_enabled) return false;
  if (item.requiresWhatsapp && !ctx?.is_whatsapp_enabled) return false;
  if (item.requiresLoyalty && !ctx?.loyalty_enabled) return false;
  if (item.requiresDeliveryAccess && !ctx?.has_delivery_access) return false;
  // Hidden only once pos_enabled is positively known to be false — unlike
  // every flag above, unknown/undefined (not yet loaded, or an older
  // cached response that predates this field) stays VISIBLE here.
  if (item.requiresPos && ctx?.pos_enabled === false) return false;
  // Shown only once we positively know setup isn't finished — hidden while
  // ready_to_trade is unknown (undefined) or already true.
  if (item.requiresSetupIncomplete && ctx?.ready_to_trade !== false) return false;
  return true;
}

/**
 * Shared computation of `ctx.has_delivery_access`, so `Sidebar.tsx` and
 * `MobileSidebar.tsx` can't independently drift on the OR logic (same
 * reasoning as `isNavItemVisible`/`visibleChildren` being the single shared
 * predicate rather than two copies).
 */
export function hasDeliveryAccess(
  settings: { delivery_platforms_enabled?: boolean; delivery_reconciliation_enabled?: boolean } | undefined
): boolean {
  return !!(settings?.delivery_platforms_enabled || settings?.delivery_reconciliation_enabled);
}

/** True if `item` (or any of its visible children) should render. Lets a
 * parent group with an entitlement-gated child (e.g. Settings -> WhatsApp)
 * still show the group and its other children even when that one child is
 * hidden. */
export function visibleChildren(item: NavItem, ctx: Parameters<typeof isNavItemVisible>[1]): NavItem[] {
  return (item.children ?? []).filter((child) => isNavItemVisible(child, ctx));
}
