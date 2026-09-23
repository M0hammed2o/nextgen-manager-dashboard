import type { BusinessSettings } from '@/types/api';

/**
 * Shared Advanced Analytics entitlement-gating helpers (migration 0047,
 * `Business.advanced_analytics_enabled`). Extracted as small, pure,
 * independently-testable functions for the same reason
 * `nav-items.ts`'s `isNavItemVisible` is — the gating decision itself
 * should be unit-testable without mounting a page/query.
 *
 * Gates `GET /business/analytics/average-order-value`,
 * `/business/analytics/payment-methods`, and
 * `/business/external-orders/channels` (backend/app/analytics/revenue.py::
 * require_advanced_analytics_enabled, 409 ADVANCED_ANALYTICS_NOT_ENABLED).
 * Deliberately does NOT gate Core Analytics (`/summary`, `/top-items`,
 * `/daily`), which stays available on every plan — see AnalyticsPage.tsx.
 */

/**
 * True only once settings have actually loaded and the flag is on.
 * `undefined`/not-yet-loaded settings are treated as "not entitled" (the
 * same "hidden while unknown" rule `isNavItemVisible` already applies to
 * `requiresInventory`/`requiresWhatsapp`), so the page never briefly shows
 * a gated section before settings arrive.
 */
export function isAdvancedAnalyticsEntitled(
  settings: Pick<BusinessSettings, 'advanced_analytics_enabled'> | undefined
): boolean {
  return settings?.advanced_analytics_enabled === true;
}

/**
 * Detects the backend's 409 ADVANCED_ANALYTICS_NOT_ENABLED response.
 * Hidden navigation/page sections are convenience only — the backend gate
 * (`require_advanced_analytics_enabled`) is the real enforcement, so a
 * query can still come back with this error even when the frontend
 * believed the tenant was entitled (e.g. a race right after an admin
 * flips the flag off, or a query that was already in flight). Matches the
 * existing INVENTORY_NOT_ENABLED / DIGITAL_RECEIPTS_NOT_ENABLED detection
 * pattern used elsewhere in this app (IngredientsPage.tsx, StockPage.tsx,
 * RecipesPage.tsx, StocktakePage.tsx, VariancePage.tsx, WastagePage.tsx,
 * BillingPage.tsx's DigitalReceiptsSection).
 */
export function isAdvancedAnalyticsNotEnabledError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && code === 'ADVANCED_ANALYTICS_NOT_ENABLED') return true;

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('ADVANCED_ANALYTICS_NOT_ENABLED') || message.toLowerCase().includes('not enabled');
}

/**
 * Single decision point for "should this page show the upgrade-prompt
 * empty state instead of real Advanced Analytics data?" — true when we
 * already know the tenant isn't entitled, OR when a query came back with
 * the 409 despite that (the graceful-degradation case above).
 */
export function shouldShowAdvancedAnalyticsUpgradePrompt(
  settings: Pick<BusinessSettings, 'advanced_analytics_enabled'> | undefined,
  error?: unknown
): boolean {
  if (isAdvancedAnalyticsEntitled(settings)) {
    return error !== undefined && error !== null && isAdvancedAnalyticsNotEnabledError(error);
  }
  return true;
}
