import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SetupStep {
  key: string;
  label: string;
  description: string;
  status: 'done' | 'partial' | 'todo';
  detail: string;
  count: number;
  total: number;
  required_to_trade: boolean;
  href: string | null;
}

export interface SetupProgress {
  business_name: string;
  inventory_enabled: boolean;
  ready_to_trade: boolean;
  percent_complete: number;
  steps: SetupStep[];
}

/**
 * Shared read of GET /v1/business/setup/progress, keyed the same as
 * SetupPage.tsx's own former query ('setup-progress') so TanStack Query
 * serves both the page and the sidebar's Setup-shortcut visibility
 * (nav-items.ts's `requiresSetupIncomplete` gate, UI V2.1 A5) from one
 * cached fetch, exactly matching the use-business-settings.ts pattern.
 */
export function useSetupProgress() {
  return useQuery({
    queryKey: ['setup-progress'],
    queryFn: () => apiClient.get<SetupProgress>('/v1/business/setup/progress'),
    staleTime: 60000,
  });
}
