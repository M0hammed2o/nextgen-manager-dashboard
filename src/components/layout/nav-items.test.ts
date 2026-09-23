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

  it('the WhatsApp Connect nav item is gated on requiresWhatsapp (added for the Embedded Signup UI)', () => {
    const whatsappConnect = navItems.find((item) => item.to === '/settings/whatsapp');
    expect(whatsappConnect?.requiresWhatsapp).toBe(true);
  });

  it('no nav item other than WhatsApp Connect requires WhatsApp today (documents current state, not a design constraint)', () => {
    const gated = navItems.filter((item) => item.requiresWhatsapp);
    expect(gated.map((item) => item.to)).toEqual(['/settings/whatsapp']);
  });

  it('a requiresDeliveryPlatforms item is hidden until delivery_platforms_enabled is true', () => {
    const deliveryItem: NavItem = {
      to: '/settings/delivery', icon: navItems[0].icon, label: 'Delivery Platforms', requiresDeliveryPlatforms: true,
    };
    expect(isNavItemVisible(deliveryItem, undefined)).toBe(false);
    expect(isNavItemVisible(deliveryItem, { delivery_platforms_enabled: false })).toBe(false);
    expect(isNavItemVisible(deliveryItem, { delivery_platforms_enabled: true })).toBe(true);
  });

  it('the Delivery Platforms nav item is gated on requiresDeliveryPlatforms', () => {
    const deliveryPlatforms = navItems.find((item) => item.to === '/settings/delivery');
    expect(deliveryPlatforms?.requiresDeliveryPlatforms).toBe(true);
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
