import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildAccountBanner,
  isBannerDismissed,
  isDismissedToday,
  dismissToday,
} from './account-alerts';
import type { AccountStatus } from '@/types/api';

function status(overrides: Partial<AccountStatus>): AccountStatus {
  return {
    status: 'TRIAL',
    plan: 'STARTER',
    billing_status: 'TRIAL',
    trial_started_at: '2026-09-01T00:00:00Z',
    trial_ends_at: '2026-09-30T00:00:00Z',
    trial_days_remaining: 7,
    alerts: [],
    ...overrides,
  };
}

describe('buildAccountBanner — alert -> severity/copy mapping', () => {
  it('returns null when there are no alerts', () => {
    expect(buildAccountBanner(status({ alerts: [] }))).toBeNull();
  });

  it('TRIAL_ENDS_7D -> calm info, dismissible', () => {
    const banner = buildAccountBanner(status({ alerts: ['TRIAL_ENDS_7D'], trial_days_remaining: 7 }));
    expect(banner?.severity).toBe('info');
    expect(banner?.dismissible).toBe(true);
    expect(banner?.message).toContain('7 days');
  });

  it('TRIAL_ENDS_3D -> amber, dismissible', () => {
    const banner = buildAccountBanner(status({ alerts: ['TRIAL_ENDS_3D'], trial_days_remaining: 3 }));
    expect(banner?.severity).toBe('amber');
    expect(banner?.dismissible).toBe(true);
    expect(banner?.message).toContain('3 days');
  });

  it('TRIAL_ENDS_1D -> amber, dismissible, stronger copy ("tomorrow")', () => {
    const banner = buildAccountBanner(status({ alerts: ['TRIAL_ENDS_1D'], trial_days_remaining: 1 }));
    expect(banner?.severity).toBe('amber');
    expect(banner?.dismissible).toBe(true);
    expect(banner?.message.toLowerCase()).toContain('tomorrow');
  });

  it('TRIAL_ENDS_1D with 0 days remaining says "today" instead of "tomorrow"', () => {
    const banner = buildAccountBanner(status({ alerts: ['TRIAL_ENDS_1D'], trial_days_remaining: 0 }));
    expect(banner?.message.toLowerCase()).toContain('today');
  });

  it('TRIAL_EXPIRED -> red, NOT dismissible, plain-English copy naming the consultant', () => {
    const banner = buildAccountBanner(status({ status: 'EXPIRED', alerts: ['TRIAL_EXPIRED'], trial_days_remaining: 0 }));
    expect(banner?.severity).toBe('red');
    expect(banner?.dismissible).toBe(false);
    expect(banner?.message).toContain('NextGen consultant');
  });

  it('INVOICE_OVERDUE -> red, NOT dismissible', () => {
    const banner = buildAccountBanner(status({ status: 'OVERDUE', alerts: ['INVOICE_OVERDUE'] }));
    expect(banner?.severity).toBe('red');
    expect(banner?.dismissible).toBe(false);
  });

  it('PAYMENT_AWAITING -> info, dismissible, mentions EFT and the invoice reference', () => {
    const banner = buildAccountBanner(status({ status: 'PAYMENT_DUE', alerts: ['PAYMENT_AWAITING'] }));
    expect(banner?.severity).toBe('info');
    expect(banner?.dismissible).toBe(true);
    expect(banner?.message).toContain('EFT');
    expect(banner?.message).toContain('invoice');
  });

  it('SUSPENDED never produces a banner — deferred to the existing BUSINESS_SUSPENDED flow', () => {
    const banner = buildAccountBanner(status({ status: 'SUSPENDED', alerts: ['SUSPENDED'] }));
    expect(banner).toBeNull();
  });

  it('most urgent wins when multiple alerts are present (defensive — backend never actually sends more than one)', () => {
    const banner = buildAccountBanner(
      status({ alerts: ['TRIAL_ENDS_7D', 'TRIAL_ENDS_1D'], trial_days_remaining: 1 })
    );
    expect(banner?.severity).toBe('amber');
    expect(banner?.message.toLowerCase()).toContain('tomorrow');

    const banner2 = buildAccountBanner(status({ alerts: ['TRIAL_ENDS_1D', 'INVOICE_OVERDUE'] }));
    expect(banner2?.dismissible).toBe(false); // INVOICE_OVERDUE outranks TRIAL_ENDS_1D

    const banner3 = buildAccountBanner(status({ alerts: ['INVOICE_OVERDUE', 'TRIAL_EXPIRED'] }));
    expect(banner3?.message).toContain('trial'); // TRIAL_EXPIRED outranks INVOICE_OVERDUE
  });
});

describe('dismissal rules', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('a dismissible alert is not dismissed until dismissToday() is called for that code/day', () => {
    expect(isDismissedToday('TRIAL_ENDS_7D')).toBe(false);
    dismissToday('TRIAL_ENDS_7D');
    expect(isDismissedToday('TRIAL_ENDS_7D')).toBe(true);
  });

  it('dismissal is per calendar day — a different day is not dismissed', () => {
    const day1 = new Date('2026-09-10T12:00:00');
    const day2 = new Date('2026-09-11T12:00:00');
    dismissToday('TRIAL_ENDS_3D', day1);
    expect(isDismissedToday('TRIAL_ENDS_3D', day1)).toBe(true);
    expect(isDismissedToday('TRIAL_ENDS_3D', day2)).toBe(false);
  });

  it('a broken localStorage never throws — treated as "not dismissed" on read, best-effort on write', () => {
    const original = window.localStorage.getItem;
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked (private mode)');
    });
    expect(() => isDismissedToday('TRIAL_ENDS_7D')).not.toThrow();
    expect(isDismissedToday('TRIAL_ENDS_7D')).toBe(false);
    window.localStorage.getItem = original;

    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => dismissToday('TRIAL_ENDS_7D')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('isBannerDismissed: dismissible alert honours dismissedToday', () => {
    const banner = buildAccountBanner(status({ alerts: ['TRIAL_ENDS_7D'] }))!;
    expect(isBannerDismissed(banner, false)).toBe(false);
    expect(isBannerDismissed(banner, true)).toBe(true);
  });

  it('isBannerDismissed: non-dismissible EXPIRED/OVERDUE banners stay visible even if "dismissedToday" is somehow true', () => {
    const expired = buildAccountBanner(status({ status: 'EXPIRED', alerts: ['TRIAL_EXPIRED'] }))!;
    expect(isBannerDismissed(expired, true)).toBe(false);

    const overdue = buildAccountBanner(status({ status: 'OVERDUE', alerts: ['INVOICE_OVERDUE'] }))!;
    expect(isBannerDismissed(overdue, true)).toBe(false);
  });
});
