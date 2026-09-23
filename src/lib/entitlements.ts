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

/**
 * Detects the backend's 409 LOYALTY_NOT_ENABLED response (migration 0051,
 * `Business.loyalty_enabled`, KNOWN_BUGS.md BUG-0107) — gates every route in
 * routes_loyalty.py (`_require_loyalty_enabled`) plus POS checkout's
 * `loyalty_reward_id` redemption. Matches the existing INVENTORY_NOT_ENABLED
 * / ADVANCED_ANALYTICS_NOT_ENABLED detection pattern used elsewhere in this
 * app.
 *
 * Unlike Advanced Analytics (a section *within* the always-visible Analytics
 * page, so it needs its own proactive `isEntitled` + `useBusinessSettings`
 * check to decide what to render), Loyalty is its own dedicated route whose
 * visibility is already proactively gated at the nav level (see
 * nav-items.ts's `requiresLoyalty`). This detector exists purely for the
 * fallback case nav-hiding doesn't cover — hidden navigation is a
 * convenience only, not the enforcement, so a user can still land on
 * LoyaltyPage (deep link, stale tab, or a race right after an admin flips
 * the flag off) and get a real 409 from the backend, same as
 * IngredientsPage.tsx's `INVENTORY_NOT_ENABLED` handling. LoyaltyPage.tsx
 * uses this to show the same friendly "not enabled" empty state instead of
 * a raw error.
 */
export function isLoyaltyNotEnabledError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && code === 'LOYALTY_NOT_ENABLED') return true;

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('LOYALTY_NOT_ENABLED') || message.toLowerCase().includes('not enabled');
}
