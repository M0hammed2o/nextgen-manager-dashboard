/**
 * MobileBottomNav — the manager dashboard's primary navigation on a phone.
 *
 * WHY THIS EXISTS
 * ===============
 * The dashboard has far more navigation entries (see nav-items.ts) than fit
 * on one bar. On a desktop sidebar that is fine:
 * they are all visible at once and scanning is cheap. On a phone the same list
 * was reachable only by opening a drawer, which means every single navigation
 * act cost two taps and the owner had to remember what was in there.
 *
 * This surfaces the few destinations an owner actually opens repeatedly, and
 * keeps everything else one tap away behind "More" -- which opens the EXISTING
 * MobileSidebar rather than a second parallel menu, so there is still one
 * source of truth for the full list and nothing is hidden.
 *
 * WHICH FOUR, AND WHY
 * ===================
 * Home, Orders, Stock, Reports. Chosen from what the dashboard actually does
 * rather than from a generic template:
 *  - Home is where the day's numbers and alerts live.
 *  - Orders is the most frequently checked operational surface.
 *  - Stock is the module an Operations/Complete tenant opens daily; it is
 *    entitlement-gated, so a POS-only tenant does not see a tab that leads
 *    somewhere they cannot use.
 *  - Reports maps to Analytics, which is deliberately available on every plan
 *    (Advanced Analytics is gated INSIDE that page, not at the nav level).
 *
 * When Stock is not entitled the bar falls back to Menu, so the fifth slot is
 * never wasted on a disabled item and the layout stays even.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Boxes, LayoutDashboard, Menu as MenuIcon, ShoppingCart, UtensilsCrossed } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBusinessSettings } from '@/hooks/use-business-settings';

interface Props {
  onOpenMore: () => void;
}

export function MobileBottomNav({ onOpenMore }: Props) {
  const { data: settings } = useBusinessSettings();
  const location = useLocation();
  const inventoryEnabled = settings?.inventory_enabled === true;

  const primary = [
    { to: '/', icon: LayoutDashboard, label: 'Home', exact: true },
    { to: '/orders', icon: ShoppingCart, label: 'Orders' },
    inventoryEnabled
      ? { to: '/stock', icon: Boxes, label: 'Stock' }
      : { to: '/menu', icon: UtensilsCrossed, label: 'Menu' },
    { to: '/analytics', icon: BarChart3, label: 'Reports' },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <nav
      // `safe-bottom` keeps the bar clear of a phone's home indicator; without
      // it the last row of targets sits under the system gesture area.
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm md:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {primary.map((item) => {
          const active = isActive(item.to, 'exact' in item ? item.exact : undefined);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // 56px tall: comfortably above a 44px touch target even after
                // the label, which is what a thumb actually misses on.
                'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-fast',
                active ? 'text-brand' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5', active && 'text-brand')} />
              <span className="truncate px-1">{item.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground"
        >
          <MenuIcon className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
