import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, Sparkles,
  Users, BarChart3, Settings, Download, ChevronLeft, ChevronRight, CreditCard, Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/menu', icon: UtensilsCrossed, label: 'Menu' },
  { to: '/specials', icon: Sparkles, label: 'Specials' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/till', icon: Wallet, label: 'Till' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/settings/billing', icon: CreditCard, label: 'Billing' },
  { to: '/exports', icon: Download, label: 'Exports' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

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
          const activeTo = navItems
            .filter((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)))
            .sort((a, b) => b.to.length - a.to.length)[0]?.to;

          return navItems.map((item) => {
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
