import { Navigate } from 'react-router-dom';
import { useEventAccess } from '@/hooks/use-event-access';
import { PageSkeleton } from '@/components/shared/PageComponents';
import DashboardPage from '@/pages/Dashboard';

/**
 * "/" is the restaurant dashboard, except for a souk event vendor, whose home
 * is the event checklist. If the event-access lookup fails we fall back to the
 * dashboard rather than blocking the app.
 */
export function RootRoute() {
  const { data, isLoading } = useEventAccess();
  if (isLoading) return <PageSkeleton />;
  if (data?.is_event_vendor) return <Navigate to="/event" replace />;
  return <DashboardPage />;
}
