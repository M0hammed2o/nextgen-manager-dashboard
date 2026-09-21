import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { BusinessSettings } from '@/types/api';

/**
 * Shared read of GET /v1/business/settings, keyed the same as
 * SettingsPage.tsx's own query ('settings') so TanStack Query serves both
 * from one cached fetch rather than duplicating the request. Used wherever
 * the dashboard needs to gate UI on a tenant flag (e.g. `inventory_enabled`)
 * without re-implementing its own fetch.
 */
export function useBusinessSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<BusinessSettings>('/v1/business/settings'),
    staleTime: 60000,
  });
}
