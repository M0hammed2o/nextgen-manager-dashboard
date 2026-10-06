import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileSidebar } from './MobileSidebar';
import { TopBar } from './TopBar';
import { WhatsAppPauseBanner } from './WhatsAppPauseBanner';
import { AccountStatusBanner } from './AccountStatusBanner';
import { Loader2 } from 'lucide-react';

export function DashboardLayout() {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <AccountStatusBanner />
        <WhatsAppPauseBanner />
        {/* pb-20 on phone reserves room for the fixed bottom nav, so the last
            element of any page is never trapped underneath it. */}
        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav onOpenMore={() => setMobileMoreOpen(true)} />
      <MobileSidebar open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)} />
    </div>
  );
}
