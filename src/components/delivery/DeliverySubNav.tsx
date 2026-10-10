import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBusinessSettings } from '@/hooks/use-business-settings';

/**
 * Cross-nav between every delivery-related page -- the three tightly-coupled
 * live-marketplace pages (connections, live orders, menu mapping) PLUS the
 * CSV import/reconciliation page, reached via the same single "Delivery
 * Orders" sidebar entry instead of separate ones. Does not replace the
 * sidebar entry itself.
 *
 * UI V2.1 follow-up (Part C4): two INDEPENDENT commercial entitlements now
 * gate the tabs here, never conflated:
 *   - Import (CSV/manual reconciliation) requires `delivery_reconciliation_enabled`
 *   - Connections/Orders/Menu Mapping (live marketplace) require
 *     `delivery_platforms_enabled`
 * A tenant can have either, both, or neither -- the sidebar entry itself
 * (nav-items.ts's `requiresDeliveryAccess`) is shown while EITHER is true,
 * hidden only when both are false. Each individual page
 * (ExternalOrdersPage/DeliveryOrdersPage/DeliveryMappingsPage/
 * DeliveryPlatformsPage) independently shows its own honest "not enabled"
 * state if reached directly while its specific entitlement is off, so
 * direct navigation to a disabled tab never renders blank.
 */
const MARKETPLACE_LINKS = [
  { to: '/settings/delivery', label: 'Connections' },
  { to: '/settings/delivery/orders', label: 'Orders' },
  { to: '/settings/delivery/mappings', label: 'Menu Mapping' },
];
const IMPORT_LINK = { to: '/delivery-orders', label: 'Import' };

export function DeliverySubNav() {
  const { data: settings } = useBusinessSettings();
  const links = [
    ...(settings?.delivery_reconciliation_enabled ? [IMPORT_LINK] : []),
    ...(settings?.delivery_platforms_enabled ? MARKETPLACE_LINKS : []),
  ];

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
