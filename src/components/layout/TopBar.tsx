import { useAuth } from '@/lib/auth';
import { LogOut, ExternalLink } from 'lucide-react';
import { RestaurantMark } from '@/components/RestaurantIdentity';
import { useBrand } from '@/lib/brand-provider';
import { Button } from '@/components/ui/button';

export function TopBar() {
  const { user, logout } = useAuth();
  const { displayName, branchName } = useBrand();

  return (
    <>
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          {/* The hamburger and this component's own MobileSidebar instance
              were removed when MobileBottomNav shipped: its "More" tab opens
              the same drawer at the same breakpoint, and two affordances
              driving two SEPARATE drawer instances is duplication. The drawer
              now lives once, in DashboardLayout. */}
          {/* The restaurant leads here too, exactly as on the till: an owner
              opening the dashboard should see their own business, not a
              generic product chrome. RestaurantMark degrades logo ->
              monogram -> neutral, so a tenant with no branding configured
              still gets a deliberate header.

              A future branch selector drops in beside the name without
              restructuring this row -- the name and branch already sit in
              their own column. No fake branch switching is rendered today,
              because no multi-branch backend exists. */}
          <RestaurantMark size="sm" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {displayName?.trim() || user?.business_name || 'Dashboard'}
            </h2>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {branchName ? `${branchName} · ` : ''}
              {user?.role?.toLowerCase() ?? ''} · {user?.staff_name ?? ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* DARK MODE IS DEFERRED -- the toggle is removed on purpose.
              See KNOWN_BUGS.md BUG-0121 and DECISIONS.md DECISION-0050.

              The theme engine derives a restaurant's brand tokens against a
              WHITE surface (lib/brand.ts enforces WCAG 1.4.11 visibility
              against the light card colour). In dark mode those same tokens
              are still written to <html>, so a dark brand -- including the
              unbranded NextGen charcoal default -- renders charcoal-on-
              charcoal. This dashboard is the only app with BOTH a brand engine
              and a theme toggle, which is exactly the broken combination.

              Leaving a user able to select a visual mode we know is broken is
              worse than not offering it, so the control is removed until the
              derivation is theme-aware. ThemeProvider stays (light is the
              default and `.dark` remains defined), so re-enabling this is one
              button, not a rebuild. */}
          <Button variant="ghost" size="sm" className="hidden sm:flex text-muted-foreground gap-1.5" asChild>
            <a href="https://nextgenintelligence.co.za" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Website
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground gap-1.5">
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>
    </>
  );
}
