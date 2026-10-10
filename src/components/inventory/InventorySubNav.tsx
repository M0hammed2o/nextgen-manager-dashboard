import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Cross-nav between the Inventory hub's internal pages (UI V2.1, A3) --
 * mirrors components/delivery/DeliverySubNav.tsx's exact pattern, for the
 * same reason: these pages are tightly coupled (opening stock feeds stock,
 * recipes drive variance, wastage and suppliers both sit on top of the same
 * ingredient list), so a shared sub-nav beats sending a manager back to the
 * sidebar for every hop between them.
 *
 * Every existing URL is preserved -- this is purely a navigation aid added
 * on top of each page, never a route change. `/stock` is the hub's default
 * landing page (nav-items.ts's single "Inventory" entry points there), so it
 * is labelled "Overview" here rather than repeating "Stock".
 *
 * Stocktake is deliberately NOT one of these tabs -- per A3, it stays its
 * own top-level sidebar entry because it is an active operational workflow
 * staff are sent to directly, not a configuration page someone browses to
 * from here.
 */
const LINKS = [
  { to: '/stock', label: 'Overview' },
  { to: '/ingredients', label: 'Ingredients' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/opening-stock', label: 'Opening Stock' },
  { to: '/variance', label: 'Variance' },
  { to: '/wastage', label: 'Wastage' },
];

export function InventorySubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border pb-0">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end
          className={({ isActive }) =>
            cn(
              'shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )
          }
        >
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}
