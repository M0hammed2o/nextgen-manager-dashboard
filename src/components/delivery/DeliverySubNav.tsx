import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Lightweight cross-nav between the three delivery-marketplace pages
 * (connections, live orders, menu mapping) — they're tightly coupled (an
 * unmapped order on the Orders page needs a quick way to the Mappings page,
 * and vice versa) so a shared sub-nav beats making a manager go back to the
 * sidebar every time. Does not replace the sidebar entries themselves.
 */
const LINKS = [
  { to: '/settings/delivery', label: 'Connections' },
  { to: '/settings/delivery/orders', label: 'Orders' },
  { to: '/settings/delivery/mappings', label: 'Menu Mapping' },
];

export function DeliverySubNav() {
  return (
    <div className="flex gap-1 border-b border-border pb-0">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/settings/delivery'}
          className={({ isActive }) =>
            cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
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
