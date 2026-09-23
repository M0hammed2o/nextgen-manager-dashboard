import { describe, it, expect } from 'vitest';
import { ApiError } from './api-client';
import {
  isAdvancedAnalyticsEntitled,
  isAdvancedAnalyticsNotEnabledError,
  shouldShowAdvancedAnalyticsUpgradePrompt,
  isLoyaltyNotEnabledError,
} from './entitlements';

describe('isAdvancedAnalyticsEntitled', () => {
  it('is false while settings have not loaded yet (undefined)', () => {
    expect(isAdvancedAnalyticsEntitled(undefined)).toBe(false);
  });

  it('is false when the flag is explicitly off', () => {
    expect(isAdvancedAnalyticsEntitled({ advanced_analytics_enabled: false })).toBe(false);
  });

  it('is true only when the flag is explicitly true', () => {
    expect(isAdvancedAnalyticsEntitled({ advanced_analytics_enabled: true })).toBe(true);
  });
});

describe('isAdvancedAnalyticsNotEnabledError', () => {
  it('recognises the real ApiError code the backend sends (409 ADVANCED_ANALYTICS_NOT_ENABLED)', () => {
    const err = new ApiError('Advanced Analytics is not enabled for this business', 409, 'ADVANCED_ANALYTICS_NOT_ENABLED');
    expect(isAdvancedAnalyticsNotEnabledError(err)).toBe(true);
  });

  it('falls back to matching the message text if the code is missing', () => {
    const err = new Error('This feature is not enabled for your plan');
    expect(isAdvancedAnalyticsNotEnabledError(err)).toBe(true);
  });

  it('is false for an unrelated error (e.g. a plain network failure)', () => {
    const err = new ApiError('Request failed (500)', 500);
    expect(isAdvancedAnalyticsNotEnabledError(err)).toBe(false);
  });

  it('is false for null/undefined (no error at all)', () => {
    expect(isAdvancedAnalyticsNotEnabledError(null)).toBe(false);
    expect(isAdvancedAnalyticsNotEnabledError(undefined)).toBe(false);
  });
});

describe('shouldShowAdvancedAnalyticsUpgradePrompt', () => {
  it('shows the upgrade prompt when the tenant is not entitled, even with no error yet', () => {
    expect(shouldShowAdvancedAnalyticsUpgradePrompt({ advanced_analytics_enabled: false })).toBe(true);
    expect(shouldShowAdvancedAnalyticsUpgradePrompt(undefined)).toBe(true);
  });

  it('does not show the upgrade prompt for an entitled tenant with no error', () => {
    expect(shouldShowAdvancedAnalyticsUpgradePrompt({ advanced_analytics_enabled: true })).toBe(false);
  });

  it('does not show the upgrade prompt for an entitled tenant hitting an unrelated error (real ErrorState should show instead)', () => {
    const err = new ApiError('Request failed (500)', 500);
    expect(shouldShowAdvancedAnalyticsUpgradePrompt({ advanced_analytics_enabled: true }, err)).toBe(false);
  });

  it('gracefully shows the upgrade prompt (not a raw error) for an entitled tenant whose query still 409s — the race/flag-flip case', () => {
    const err = new ApiError('Advanced Analytics is not enabled for this business', 409, 'ADVANCED_ANALYTICS_NOT_ENABLED');
    expect(shouldShowAdvancedAnalyticsUpgradePrompt({ advanced_analytics_enabled: true }, err)).toBe(true);
  });
});

// Loyalty entitlement (migration 0051, Business.loyalty_enabled,
// KNOWN_BUGS.md BUG-0107) — see isLoyaltyNotEnabledError's own doc comment
// for why this app only needs the error-detector (not a settings-driven
// isEntitled/shouldShowUpgradePrompt pair like Advanced Analytics): Loyalty
// is a whole dedicated route already proactively gated at the nav level
// (nav-items.ts's requiresLoyalty), unlike Advanced Analytics which is a
// section within an always-visible page.

describe('isLoyaltyNotEnabledError', () => {
  it('recognises the real ApiError code the backend sends (409 LOYALTY_NOT_ENABLED)', () => {
    const err = new ApiError('Loyalty is not enabled for this business', 409, 'LOYALTY_NOT_ENABLED');
    expect(isLoyaltyNotEnabledError(err)).toBe(true);
  });

  it('falls back to matching the message text if the code is missing', () => {
    const err = new Error('This feature is not enabled for your plan');
    expect(isLoyaltyNotEnabledError(err)).toBe(true);
  });

  it('is false for an unrelated error (e.g. a plain network failure)', () => {
    const err = new ApiError('Request failed (500)', 500);
    expect(isLoyaltyNotEnabledError(err)).toBe(false);
  });

  it('is false for null/undefined (no error at all)', () => {
    expect(isLoyaltyNotEnabledError(null)).toBe(false);
    expect(isLoyaltyNotEnabledError(undefined)).toBe(false);
  });
});
