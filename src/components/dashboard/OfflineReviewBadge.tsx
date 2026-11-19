import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CloudOff, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { useBusinessSettings } from '@/hooks/use-business-settings';
import {
  buildFlaggedPath, buildLateUploadsPath, OFFLINE_FLAGGED_KEY, OFFLINE_REVIEWS_KEY, pendingCountOf,
  type FlaggedOfflineOrder,
} from '@/lib/offline-review';

const BADGE_LIMIT = 20;

/**
 * Dashboard notice: unreviewed offline sales exist. One cheap request (limit 20, the
 * API returns no total, so a full page shows as "20+"). Renders nothing while loading,
 * on error, for non-owner/manager roles, while settings load, when POS is off, or when nothing is flagged,
 * so it can never add noise or break the dashboard.
 */
export function OfflineReviewBadge() {
  const { user } = useAuth();
  const { data: settings } = useBusinessSettings();
  const allowed = (user?.role === 'OWNER' || user?.role === 'MANAGER') && settings !== undefined && settings.pos_enabled !== false;

  const { data } = useQuery({
    queryKey: [OFFLINE_FLAGGED_KEY, 'badge'],
    queryFn: () => apiClient.get<FlaggedOfflineOrder[]>(buildFlaggedPath({ limit: BADGE_LIMIT })),
    enabled: allowed,
    staleTime: 60000,
    retry: false,
  });

  // Late uploads awaiting approval (BUG-0208). Separate request; a failure counts as 0.
  const { data: late } = useQuery({
    queryKey: [OFFLINE_REVIEWS_KEY, 'badge'],
    queryFn: () => apiClient.get<unknown>(buildLateUploadsPath('PENDING', 1)),
    enabled: allowed,
    staleTime: 60000,
    retry: false,
  });

  const count = Array.isArray(data) ? data.length : 0;
  const pendingLate = pendingCountOf(late);
  if (!allowed || (count === 0 && pendingLate === 0)) return null;
  const label = count >= BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count);

  return (
    <Link
      to="/offline-sales"
      className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground hover:bg-amber-500/15"
    >
      <CloudOff className="w-5 h-5 text-amber-600" />
      <span className="flex-1">
        {count > 0 && (
          <span>
            <span className="font-semibold">{label}</span> offline {count === 1 ? 'sale needs' : 'sales need'} review
          </span>
        )}
        {count > 0 && pendingLate > 0 && <span> · </span>}
        {pendingLate > 0 && (
          <span data-testid="late-uploads-count">
            <span className="font-semibold">{pendingLate}</span> late {pendingLate === 1 ? 'upload awaits' : 'uploads await'} approval
          </span>
        )}
      </span>
      <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
