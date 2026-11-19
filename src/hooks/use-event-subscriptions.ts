import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EventSubscriptionsResponse } from '@/lib/souk';

export const EVENT_SUBSCRIPTIONS_KEY = ['event-subscriptions'] as const;

/** GET /v1/business/event-subscriptions: this business's events, quote options and subscriptions. */
export function useEventSubscriptions() {
  return useQuery({
    queryKey: EVENT_SUBSCRIPTIONS_KEY,
    queryFn: () => apiClient.get<EventSubscriptionsResponse>('/v1/business/event-subscriptions'),
    staleTime: 15000,
  });
}
