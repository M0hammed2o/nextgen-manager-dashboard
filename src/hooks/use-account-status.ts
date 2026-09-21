import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AccountStatus } from '@/types/api';

/**
 * Shared read of GET /v1/business/billing/account — the derived
 * TRIAL/ACTIVE/PAYMENT_DUE/OVERDUE/EXPIRED/SUSPENDED/CANCELLED status used
 * by both the app-shell trial/invoice banner (`AccountStatusBanner.tsx`)
 * and the Billing page's "Plan & invoices" section, keyed the same
 * ('account-status') so TanStack Query serves both from one cached fetch.
 *
 * OWNER and MANAGER may both call this endpoint (`require_owner_or_manager`
 * on the backend) — unlike the self-service Stripe/PayFast billing routes,
 * which are OWNER-only.
 *
 * 5-minute staleTime: this data changes at most daily (trial countdown) or
 * on a billing event, so there's no reason to refetch on every navigation
 * and risk a refetch storm across the app shell.
 */
export function useAccountStatus() {
  return useQuery({
    queryKey: ['account-status'],
    queryFn: () => apiClient.get<AccountStatus>('/v1/business/billing/account'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
