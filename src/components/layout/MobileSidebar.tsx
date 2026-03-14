import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, Sparkles,
  Users, BarChart3, Settings, Download, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/menu', icon: UtensilsCrossed, label: 'Menu' },
  { to: '/specials', icon: Sparkles, label: 'Specials' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/exports', icon: Download, label: 'Exports' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: Props) {
  const location = useLocation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border h-16">
          <div className="flex items-center gap-3">
            <img src={logoNextgen} alt="NextGen Intelligence" className="w-8 h-8 rounded object-cover" />
            <span className="text-sm font-semibold text-sidebar-primary-foreground">NextGen Intelligence</span>
          </div>
          <button onClick={onClose} className="text-sidebar-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={cn(
                  'sidebar-item',
                  isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
