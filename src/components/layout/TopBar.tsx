import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Sun, Moon, LogOut, Menu, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { MobileSidebar } from './MobileSidebar';

export function TopBar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-accent text-muted-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{user?.business_name ?? 'Dashboard'}</h2>
            <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase() ?? ''} · {user?.staff_name ?? ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
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
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
