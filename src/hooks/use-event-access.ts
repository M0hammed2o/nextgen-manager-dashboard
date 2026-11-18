import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EventAccess } from '@/lib/souk';

/**
 * Shared read of GET /v1/business/event-access. `is_event_vendor` is the
 * single signal for the simplified event-vendor navigation and home; for a
 * restaurant tenant the backend answers `{ is_event_vendor: false }`.
 * One cached fetch serves the sidebar, root route and event pages.
 */
export function useEventAccess() {
  return useQuery({
    queryKey: ['event-access'],
    queryFn: () => apiClient.get<EventAccess>('/v1/business/event-access'),
    staleTime: 60000,
  });
}
