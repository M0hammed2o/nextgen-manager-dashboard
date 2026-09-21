import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { navItems } from './nav-items';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { data: settings } = useBusinessSettings();

  // Inventory-only routes stay out of the menu until the module is switched
  // on for this tenant — see PRODUCT_MAP.md / routes_inventory.py's
  // _require_inventory_enabled. Hidden (not merely disabled) while settings
  // are still loading, rather than flashing them on then off.
  const visibleItems = navItems.filter((item) => !item.requiresInventory || settings?.inventory_enabled);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border h-16">
        <img src={logoNextgen} alt="NextGen Intelligence" className="w-8 h-8 rounded object-cover flex-shrink-0" />
        {!collapsed && (
          <span className="text-sm font-semibold text-sidebar-primary-foreground truncate">
            NextGen Intelligence
          </span>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Pick the single longest-matching `to` prefix as active, so a nested
            route like /settings/billing doesn't also light up /settings. */}
        {(() => {
          const activeTo = visibleItems
            .filter((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)))
            .sort((a, b) => b.to.length - a.to.length)[0]?.to;

          return visibleItems.map((item) => {
            const isActive = item.to === activeTo;
            return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'sidebar-item',
                isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
            );
          });
        })()}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-3 border-t border-sidebar-border text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-5 h-5 mx-auto" /> : <ChevronLeft className="w-5 h-5 mx-auto" />}
      </button>
    </aside>
  );
}
