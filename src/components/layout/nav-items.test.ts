import { describe, it, expect } from 'vitest';
import { isNavItemVisible, navItems, visibleChildren, type NavItem } from './nav-items';

const plainItem: NavItem = { to: '/orders', icon: navItems[0].icon, label: 'Orders' };
const whatsappItem: NavItem = { to: '/whatsapp-thing', icon: navItems[0].icon, label: 'WhatsApp thing', requiresWhatsapp: true };
const inventoryItem: NavItem = { to: '/stock', icon: navItems[0].icon, label: 'Stock', requiresInventory: true };
const bothItem: NavItem = {
  to: '/both', icon: navItems[0].icon, label: 'Both', requiresInventory: true, requiresWhatsapp: true,
};

describe('isNavItemVisible — WhatsApp/inventory nav gating predicate', () => {
  it('an ungated item is always visible, settings loaded or not', () => {
    expect(isNavItemVisible(plainItem, undefined)).toBe(true);
    expect(isNavItemVisible(plainItem, { inventory_enabled: false, is_whatsapp_enabled: false })).toBe(true);
  });

  it('a requiresWhatsapp item is hidden while settings have not loaded yet', () => {
    expect(isNavItemVisible(whatsappItem, undefined)).toBe(false);
  });

  it('a requiresWhatsapp item is hidden for a POS-only tenant (is_whatsapp_enabled === false)', () => {
    expect(isNavItemVisible(whatsappItem, { is_whatsapp_enabled: false })).toBe(false);
  });

  it('a requiresWhatsapp item is visible once is_whatsapp_enabled is true', () => {
    expect(isNavItemVisible(whatsappItem, { is_whatsapp_enabled: true })).toBe(true);
  });

  it('requiresInventory gating still behaves exactly as before (regression guard)', () => {
    expect(isNavItemVisible(inventoryItem, undefined)).toBe(false);
    expect(isNavItemVisible(inventoryItem, { inventory_enabled: false })).toBe(false);
    expect(isNavItemVisible(inventoryItem, { inventory_enabled: true })).toBe(true);
  });

  it('an item requiring both flags needs both to be true', () => {
    expect(isNavItemVisible(bothItem, { inventory_enabled: true, is_whatsapp_enabled: false })).toBe(false);
    expect(isNavItemVisible(bothItem, { inventory_enabled: false, is_whatsapp_enabled: true })).toBe(false);
    expect(isNavItemVisible(bothItem, { inventory_enabled: true, is_whatsapp_enabled: true })).toBe(true);
  });

  // UI V2.1 (A6) moved WhatsApp from a top-level item to a child of the
  // Settings group, so these two flatten one level to find it.
  const allItems = navItems.flatMap((item) => [item, ...(item.children ?? [])]);

  it('the WhatsApp Connect nav item is gated on requiresWhatsapp (added for the Embedded Signup UI)', () => {
    const whatsappConnect = allItems.find((item) => item.to === '/settings/whatsapp');
    expect(whatsappConnect?.requiresWhatsapp).toBe(true);
  });

  it('no nav item other than WhatsApp Connect requires WhatsApp today (documents current state, not a design constraint)', () => {
    const gated = allItems.filter((item) => item.requiresWhatsapp);
    expect(gated.map((item) => item.to)).toEqual(['/settings/whatsapp']);
  });

  // Loyalty entitlement (migration 0051, Business.loyalty_enabled,
  // KNOWN_BUGS.md BUG-0107) — closes the gap where a POS-only plan could
  // previously self-enable Loyalty via LoyaltyProgram.is_enabled alone.
  it('a requiresLoyalty item is hidden until loyalty_enabled is true', () => {
    const loyaltyItem: NavItem = {
      to: '/loyalty', icon: navItems[0].icon, label: 'Loyalty', requiresLoyalty: true,
    };
    expect(isNavItemVisible(loyaltyItem, undefined)).toBe(false);
    expect(isNavItemVisible(loyaltyItem, { loyalty_enabled: false })).toBe(false);
    expect(isNavItemVisible(loyaltyItem, { loyalty_enabled: true })).toBe(true);
  });

  it('the Loyalty nav item is gated on requiresLoyalty', () => {
    const loyalty = navItems.find((item) => item.to === '/loyalty');
    expect(loyalty?.requiresLoyalty).toBe(true);
  });
});

describe('UI V2.1 consolidation (A2-A6)', () => {
  it('no nav item appears twice at the top level', () => {
    const tos = navItems.map((item) => item.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it('Delivery Orders is ONE always-visible top-level item — not gated on delivery_platforms_enabled, and the old separate "Delivery Platforms" entry no longer exists at the top level', () => {
    const deliveryOrders = navItems.find((item) => item.label === 'Delivery Orders');
    expect(deliveryOrders?.to).toBe('/delivery-orders');
    expect(isNavItemVisible(deliveryOrders!, undefined)).toBe(true);
    expect(isNavItemVisible(deliveryOrders!, {})).toBe(true);

    expect(navItems.find((item) => item.label === 'Delivery Platforms')).toBeUndefined();
    expect(navItems.find((item) => item.to === '/settings/delivery')).toBeUndefined();
  });

  it('Inventory is consolidated into one hub item (plus Stocktake, which stays top-level) — the other 6 former standalone inventory routes are gone from the top level', () => {
    const inventory = navItems.find((item) => item.label === 'Inventory');
    expect(inventory?.to).toBe('/stock');
    expect(inventory?.requiresInventory).toBe(true);

    const stocktake = navItems.find((item) => item.label === 'Stocktake');
    expect(stocktake?.to).toBe('/stocktake');
    expect(stocktake?.requiresInventory).toBe(true);

    for (const removedLabel of ['Ingredients', 'Suppliers', 'Opening Stock', 'Recipes', 'Variance', 'Wastage']) {
      expect(navItems.find((item) => item.label === removedLabel)).toBeUndefined();
    }
  });

  it('Inventory and Stocktake are both hidden together when inventory is off or unknown, and both appear once it is on', () => {
    const inventory = navItems.find((item) => item.label === 'Inventory')!;
    const stocktake = navItems.find((item) => item.label === 'Stocktake')!;
    expect(isNavItemVisible(inventory, undefined)).toBe(false);
    expect(isNavItemVisible(stocktake, undefined)).toBe(false);
    expect(isNavItemVisible(inventory, { inventory_enabled: false })).toBe(false);
    expect(isNavItemVisible(stocktake, { inventory_enabled: false })).toBe(false);
    expect(isNavItemVisible(inventory, { inventory_enabled: true })).toBe(true);
    expect(isNavItemVisible(stocktake, { inventory_enabled: true })).toBe(true);
  });

  it('Settings is a single expandable group, not 7 flat top-level items, and Billing is removed from the nav entirely', () => {
    const settings = navItems.find((item) => item.to === '/settings');
    expect(settings?.children).toBeDefined();
    expect(settings!.children!.length).toBe(7);

    expect(navItems.find((item) => item.label === 'Billing')).toBeUndefined();
    const allLabels = navItems.flatMap((item) => [item.label, ...(item.children ?? []).map((c) => c.label)]);
    expect(allLabels).not.toContain('Billing');
  });

  it('the Settings group\'s children are General/Setup/Import/Branding/Receipts/WhatsApp/Exports, in that order', () => {
    const settings = navItems.find((item) => item.to === '/settings')!;
    expect(settings.children!.map((c) => c.label)).toEqual([
      'General', 'Setup', 'Import', 'Branding', 'Receipts', 'WhatsApp', 'Exports',
    ]);
  });

  it('Setup is permanently reachable under Settings regardless of ready_to_trade — only the top-level shortcut is conditional', () => {
    const settings = navItems.find((item) => item.to === '/settings')!;
    const setupChild = settings.children!.find((c) => c.to === '/setup')!;
    expect(isNavItemVisible(setupChild, { ready_to_trade: true })).toBe(true);
    expect(isNavItemVisible(setupChild, { ready_to_trade: false })).toBe(true);
    expect(isNavItemVisible(setupChild, undefined)).toBe(true);
  });

  it('the top-level Setup shortcut is visible only while ready_to_trade is positively known to be false — hidden once true, and hidden while unknown (no flash)', () => {
    const setupShortcut = navItems.find((item) => item.to === '/setup' && !item.children)!;
    expect(setupShortcut.requiresSetupIncomplete).toBe(true);
    expect(isNavItemVisible(setupShortcut, undefined)).toBe(false);
    expect(isNavItemVisible(setupShortcut, { ready_to_trade: true })).toBe(false);
    expect(isNavItemVisible(setupShortcut, { ready_to_trade: false })).toBe(true);
  });

  it('visibleChildren hides only the entitlement-gated WhatsApp child when WhatsApp is off, keeping the rest of the Settings group', () => {
    const settings = navItems.find((item) => item.to === '/settings')!;
    const kids = visibleChildren(settings, { is_whatsapp_enabled: false });
    expect(kids.map((c) => c.label)).toEqual(['General', 'Setup', 'Import', 'Branding', 'Receipts', 'Exports']);
  });

  it('visibleChildren shows every Settings child once WhatsApp is on', () => {
    const settings = navItems.find((item) => item.to === '/settings')!;
    const kids = visibleChildren(settings, { is_whatsapp_enabled: true });
    expect(kids.map((c) => c.label)).toEqual([
      'General', 'Setup', 'Import', 'Branding', 'Receipts', 'WhatsApp', 'Exports',
    ]);
  });

  it('the final top-level nav order matches the brief: Dashboard, (Setup), Orders, Menu, Specials, (Loyalty), Staff, Till, Delivery Orders, (Inventory), (Stocktake), Analytics, Settings', () => {
    expect(navItems.map((item) => item.label)).toEqual([
      'Dashboard', 'Setup', 'Orders', 'Menu', 'Specials', 'Loyalty', 'Staff', 'Till',
      'Delivery Orders', 'Inventory', 'Stocktake', 'Analytics', 'Settings',
    ]);
  });
});
