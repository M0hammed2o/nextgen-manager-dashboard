import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBusinessSettings } from '@/hooks/use-business-settings';

/**
 * Cross-nav between every delivery-related page (UI V2.1, A4) -- the three
 * tightly-coupled live-marketplace pages (connections, live orders, menu
 * mapping) PLUS the CSV import/reconciliation page, which is now reached
 * via the same single "Delivery Orders" sidebar entry instead of its own
 * separate one. Does not replace the sidebar entry itself.
 *
 * IMPORTANT, and a deliberate deviation from the literal brief (recorded in
 * the final report): the brief asked for the whole merged nav item to be
 * gated on `delivery_platforms_enabled`. The CSV import page
 * (ExternalOrdersPage, "Import") is NOT gated on that entitlement today --
 * see docs/DELIVERY_PLATFORM_ARCHITECTURE.md §0's own note ("ExternalOrdersPage.tsx
 * (CSV importer) untouched") and the commercial feature matrix, which lists
 * CSV reconciliation as already-live baseline functionality, separate from
 * the new direct-API entitlement. Gating the whole item would have silently
 * removed existing access for every tenant without that entitlement, which
 * is exactly the "don't silently invent/remove product access" gap Part D
 * exists to catch. So: "Delivery Orders" stays a single, always-visible
 * sidebar entry (nav-items.ts), and ONLY the three live-marketplace tabs
 * here are gated on the entitlement -- "Import" is always shown.
 */
const MARKETPLACE_LINKS = [
  { to: '/settings/delivery', label: 'Connections' },
  { to: '/settings/delivery/orders', label: 'Orders' },
  { to: '/settings/delivery/mappings', label: 'Menu Mapping' },
];
const IMPORT_LINK = { to: '/delivery-orders', label: 'Import' };

export function DeliverySubNav() {
  const { data: settings } = useBusinessSettings();
  const links = settings?.delivery_platforms_enabled
    ? [IMPORT_LINK, ...MARKETPLACE_LINKS]
    : [IMPORT_LINK];

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border pb-0">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/settings/delivery'}
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
