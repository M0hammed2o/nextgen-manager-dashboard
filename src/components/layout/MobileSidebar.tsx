import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { useSetupProgress } from '@/hooks/use-setup-progress';
import { navItems, isNavItemVisible, visibleChildren, hasDeliveryAccess } from './nav-items';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const location = useLocation();
  const { data: settings } = useBusinessSettings();
  const { data: setup } = useSetupProgress();

  // Same merged gating context as Sidebar.tsx (desktop) — see nav-items.ts's
  // isNavItemVisible for why this is a single shared predicate rather than
  // two that can drift apart.
  const ctx = {
    inventory_enabled: settings?.inventory_enabled,
    is_whatsapp_enabled: settings?.is_whatsapp_enabled,
    loyalty_enabled: settings?.loyalty_enabled,
    ready_to_trade: setup?.ready_to_trade,
    has_delivery_access: hasDeliveryAccess(settings),
  };

  const visibleItems = navItems.filter((item) => isNavItemVisible(item, ctx));

  useEffect(() => {
    for (const item of visibleItems) {
      if (!item.children) continue;
      const kids = visibleChildren(item, ctx);
      const hasActiveChild = kids.some(
        (c) => location.pathname === c.to || (c.to !== '/' && location.pathname.startsWith(c.to))
      );
      if (hasActiveChild) {
        setExpanded((prev) => (prev.has(item.to) ? prev : new Set(prev).add(item.to)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!open) return null;

  const matchable = visibleItems.flatMap((item) => (item.children ? visibleChildren(item, ctx) : [item]));
  const activeTo = matchable
    .filter((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

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
          {visibleItems.map((item) => {
            if (item.children) {
              const kids = visibleChildren(item, ctx);
              const groupActive = kids.some((c) => c.to === activeTo);
              const isOpen = expanded.has(item.to);
              return (
                <div key={item.to}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.to)) next.delete(item.to);
                        else next.add(item.to);
                        return next;
                      })
                    }
                    className={cn(
                      'sidebar-item w-full justify-between',
                      groupActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
                    )}
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {isOpen && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                      {kids.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={cn(
                            'sidebar-item',
                            child.to === activeTo ? 'sidebar-item-active' : 'sidebar-item-inactive'
                          )}
                        >
                          <child.icon className="w-4 h-4 flex-shrink-0" />
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = item.to === activeTo;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={cn('sidebar-item', isActive ? 'sidebar-item-active' : 'sidebar-item-inactive')}
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
