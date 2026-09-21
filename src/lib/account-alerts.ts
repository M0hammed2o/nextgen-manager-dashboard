import type { AccountAlertCode, AccountStatus } from '@/types/api';

/**
 * Pure alert -> banner-copy mapping for the app-shell trial/invoice banner
 * (`AccountStatusBanner.tsx`). Kept dependency-free (no React, no fetch) so
 * every rule here — severity, copy, "most urgent wins", dismissal — is unit
 * testable without rendering anything.
 *
 * `AccountStatus.alerts` (backend/app/billing/account_status.py) never
 * actually contains more than one code today (each branch of
 * `compute_account_status` returns a single-element list), but this picks
 * the single most urgent one defensively in case that ever changes.
 *
 * ALERT_SUSPENDED is deliberately NOT mapped to a banner here — see
 * `SUSPENDED_ALERT_CODE` below for why.
 */

export type BannerSeverity = 'info' | 'amber' | 'red';

export interface BannerAlert {
  code: AccountAlertCode;
  severity: BannerSeverity;
  message: string;
  /** false = must stay visible (trial expired / invoice overdue). */
  dismissible: boolean;
}

// Alerts a suspended business's `GET /billing/account` call would report if
// it ever succeeded. In practice it never does: `get_current_user` rejects
// EVERY business-plane request (including this one) with a 403
// BUSINESS_SUSPENDED once `Business.is_active` is false (see
// backend/app/core/rbac.py). So a suspended tenant's account-status query
// simply fails, the banner renders nothing per its own "endpoint failure ->
// render nothing" rule, and the *existing* BUSINESS_SUSPENDED flow already
// shows one clear message: every other page's own failed query surfaces
// the backend's exact "This business account has been suspended." text via
// PageComponents.tsx's `ErrorState`/`InlineErrorBanner`. Mapping SUSPENDED
// to a second, differently-worded banner here would just be a second,
// possibly-inconsistent message for the same fact — so it's excluded from
// `ALERT_PRIORITY` on purpose, not by oversight.
const SUSPENDED_ALERT_CODE: AccountAlertCode = 'SUSPENDED';

// Most urgent first. Only entries here can ever produce a banner.
const ALERT_PRIORITY: AccountAlertCode[] = [
  'TRIAL_EXPIRED',
  'INVOICE_OVERDUE',
  'TRIAL_ENDS_1D',
  'TRIAL_ENDS_3D',
  'PAYMENT_AWAITING',
  'TRIAL_ENDS_7D',
];

function trialEndsCopy(alert: AccountAlertCode, daysRemaining: number | null): { severity: BannerSeverity; message: string } {
  const days = daysRemaining ?? 0;
  if (alert === 'TRIAL_ENDS_1D') {
    return {
      severity: 'amber',
      message:
        days <= 0
          ? 'Your free trial ends today. Contact your NextGen consultant now to avoid any interruption to your service.'
          : 'Your free trial ends tomorrow. Contact your NextGen consultant today to avoid any interruption to your service.',
    };
  }
  if (alert === 'TRIAL_ENDS_3D') {
    return {
      severity: 'amber',
      message: `Only ${days} days left on your free trial. Contact your NextGen consultant or add payment details to avoid any interruption.`,
    };
  }
  // TRIAL_ENDS_7D
  return {
    severity: 'info',
    message: `Your free trial ends in ${days} days. Add payment details before it ends to keep using NextGen without interruption.`,
  };
}

/**
 * Picks the single most urgent alert (if any) from `status.alerts` and
 * returns its severity/copy/dismissibility, or `null` if there is nothing
 * to show.
 */
export function buildAccountBanner(status: AccountStatus): BannerAlert | null {
  const present = new Set(status.alerts);
  const code = ALERT_PRIORITY.find((c) => present.has(c));
  if (!code) return null;

  switch (code) {
    case 'TRIAL_EXPIRED':
      return {
        code,
        severity: 'red',
        dismissible: false,
        message:
          'Your free trial has ended. Your account will be paused unless payment is received — ' +
          'contact your NextGen consultant to continue service.',
      };
    case 'INVOICE_OVERDUE':
      return {
        code,
        severity: 'red',
        dismissible: false,
        message:
          'Your invoice payment is overdue. Please pay via EFT using your invoice number as reference ' +
          '(see Billing for the invoice details) to avoid your account being paused.',
      };
    case 'PAYMENT_AWAITING':
      return {
        code,
        severity: 'info',
        dismissible: true,
        message:
          'An invoice has been issued for your account. Please pay by the due date via EFT, using your ' +
          'invoice number as the payment reference — see Billing for the invoice details.',
      };
    case 'TRIAL_ENDS_1D':
    case 'TRIAL_ENDS_3D':
    case 'TRIAL_ENDS_7D': {
      const { severity, message } = trialEndsCopy(code, status.trial_days_remaining);
      return { code, severity, dismissible: true, message };
    }
    default:
      return null;
  }
}

/**
 * Whether a banner should stay hidden given today's dismissal state.
 * Non-dismissible alerts (`banner.dismissible === false`, i.e. trial
 * expired / invoice overdue) ignore `dismissedToday` entirely — they must
 * stay visible no matter what a stale localStorage entry says.
 */
export function isBannerDismissed(banner: BannerAlert, dismissedToday: boolean): boolean {
  return banner.dismissible && dismissedToday;
}

// ── Per-day dismissal (localStorage) ────────────────────────────────────────

const DISMISS_KEY_PREFIX = 'nextgen_account_banner_dismissed_';

function todayKey(date: Date = new Date()): string {
  // Local calendar date, not UTC — "today" should match what the owner sees
  // on their own clock, same reasoning as the backend's local-date trial
  // maths (account_status.py).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Never throws — a broken/unavailable localStorage just means "not dismissed". */
export function isDismissedToday(code: string, date: Date = new Date()): boolean {
  try {
    return localStorage.getItem(`${DISMISS_KEY_PREFIX}${code}_${todayKey(date)}`) === '1';
  } catch {
    return false;
  }
}

/** Never throws — a broken/unavailable localStorage just means dismissal doesn't persist. */
export function dismissToday(code: string, date: Date = new Date()): void {
  try {
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${code}_${todayKey(date)}`, '1');
  } catch {
    // best-effort only
  }
}
