import { describe, it, expect } from 'vitest';
import { isNavItemVisible, navItems, type NavItem } from './nav-items';

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

  it('no current nav item actually requires WhatsApp today (documents current state, not a design constraint)', () => {
    expect(navItems.some((item) => item.requiresWhatsapp)).toBe(false);
  });
});
