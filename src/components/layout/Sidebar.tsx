import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import { useSetupProgress } from '@/hooks/use-setup-progress';
import { navItems, isNavItemVisible, visibleChildren } from './nav-items';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const location = useLocation();
  const { data: settings } = useBusinessSettings();
  const { data: setup } = useSetupProgress();

  // Merged visibility context (UI V2.1, A5/A6) — nav-items.ts's gates read
  // from both the business's module entitlements and its setup-completion
  // state, so both queries feed the same `isNavItemVisible` call. Hidden
  // (not disabled) while either hasn't loaded yet — see nav-items.ts.
  const ctx = {
    inventory_enabled: settings?.inventory_enabled,
    is_whatsapp_enabled: settings?.is_whatsapp_enabled,
    loyalty_enabled: settings?.loyalty_enabled,
    ready_to_trade: setup?.ready_to_trade,
  };

  const visibleItems = navItems.filter((item) => isNavItemVisible(item, ctx));

  // Auto-expand a group the first time the active route falls under one of
  // its children, so landing directly on e.g. /settings/branding doesn't
  // leave "Settings" collapsed with its own active child hidden from view.
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
    // Only re-run when the route changes, not on every settings refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Flatten groups into their visible children for "which entry is active"
  // matching, so a group parent (e.g. /settings) and its own General child
  // (also /settings) don't double-count, and e.g. /settings/branding
  // correctly highlights the Branding child rather than the General one.
  const matchable = visibleItems.flatMap((item) => (item.children ? visibleChildren(item, ctx) : [item]));
  const activeTo = matchable
    .filter((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

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
        {visibleItems.map((item) => {
          if (item.children) {
            const kids = visibleChildren(item, ctx);
            const groupActive = kids.some((c) => c.to === activeTo);
            const isOpen = !collapsed && expanded.has(item.to);
            return (
              <div key={item.to}>
                {collapsed ? (
                  // No room to show a nested list while collapsed — fall
                  // back to a direct link to the group's own page.
                  <NavLink
                    to={item.to}
                    className={cn('sidebar-item', groupActive ? 'sidebar-item-active' : 'sidebar-item-inactive')}
                    title={item.label}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                  </NavLink>
                ) : (
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
                )}
                {isOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                    {kids.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={cn(
                          'sidebar-item',
                          child.to === activeTo ? 'sidebar-item-active' : 'sidebar-item-inactive'
                        )}
                        title={child.label}
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
              className={cn('sidebar-item', isActive ? 'sidebar-item-active' : 'sidebar-item-inactive')}
              title={item.label}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
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
