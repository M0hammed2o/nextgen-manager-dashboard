/**
 * Souk (event vendor) self-service — types, wire shapes and small pure
 * helpers shared by the public registration page, the event-vendor home
 * checklist and the event days & payment page.
 *
 * Contract: backend/app/api/v1/routes_event_public.py, routes_event_vendor.py
 * and GET /v1/business/event-access (routes_business.py). Money is VAT-
 * inclusive integer cents; prices ALWAYS come from the API. The only
 * client-side price is `estimateCents`, which the UI must label an estimate.
 */
import { ApiError } from '@/lib/api-client';

export type EventCategory = 'FOOD' | 'CLOTHING';
export type AccessLevel = 'NONE' | 'CONFIGURE' | 'TRADE';
export type SubscriptionStatus = 'UNPAID' | 'PAID' | 'VOID';

/**
 * PLACEHOLDER — NextGen's EFT instructions for event-day payments. No real
 * bank details are baked into the app: replace this text (or wire it to a
 * server-provided value) before go-live.
 */
export const EFT_INSTRUCTIONS_PLACEHOLDER =
  'EFT details are shared by the NextGen events team. [PLACEHOLDER: bank name, account number, branch code and payment instructions to be supplied before launch.]';

// ---- public registration ---------------------------------------------------

export interface PublicEventDay {
  day: string;
  is_billable: boolean;
}

export interface PublicEvent {
  name: string;
  slug: string;
  venue: string | null;
  timezone: string;
  status: 'OPEN' | 'CLOSED';
  prep_days: number;
  days: PublicEventDay[];
  food_day_rate_cents: number;
  clothing_day_rate_cents: number;
  registration_open: boolean;
}

export interface RegisterRequest {
  registration_code: string;
  business_name: string;
  category: EventCategory;
  owner_full_name: string;
  owner_email: string;
  password: string;
  accept_terms: true;
}

export interface RegisterResponse {
  business_code: string;
  next: 'login';
  access_level: AccessLevel;
  login_opens_on: string | null;
}

// ---- vendor plane ------------------------------------------------------------

export interface AccessSubscription {
  starts_on: string;
  ends_on: string;
  billable_days: number;
  amount_cents: number;
  status: SubscriptionStatus;
  paid_at: string | null;
}

export interface EventAccessEvent {
  event_id: string;
  event_name: string;
  venue: string | null;
  timezone: string;
  event_status: string;
  prep_days: number;
  days: string[];
  first_day: string | null;
  last_day: string | null;
  calendar_published: boolean;
  stall_code: string | null;
  category: EventCategory;
  vendor_status: string;
  subscriptions: AccessSubscription[];
}

export interface EventAccess {
  is_event_vendor: boolean;
  access_level: AccessLevel | null;
  reason: string | null;
  events: EventAccessEvent[];
}

export interface EventSubscription {
  id: string;
  starts_on: string;
  ends_on: string;
  billable_days: number;
  day_rate_cents: number;
  amount_cents: number;
  status: SubscriptionStatus;
  paid_at: string | null;
  payment_claim_reference: string | null;
  payment_claimed_at: string | null;
}

export interface EventSubscriptionsEvent {
  event_id: string;
  event_name: string;
  venue: string | null;
  timezone: string;
  event_status: string;
  vendor_status: string;
  category: EventCategory;
  can_subscribe: boolean;
  quote_options: { day_rate_cents: number; billable_days: string[]; billable_day_count: number };
  subscriptions: EventSubscription[];
}

export interface EventSubscriptionsResponse {
  events: EventSubscriptionsEvent[];
}

// ---- helpers -------------------------------------------------------------------

/** Parse a YYYY-MM-DD date at local noon so no timezone can shift the day. */
export function parseIsoDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function formatDay(iso: string | null | undefined, opts?: { weekday?: boolean }): string {
  if (!iso) return '-';
  return parseIsoDay(iso).toLocaleDateString('en-ZA', {
    weekday: opts?.weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRange(startsOn: string, endsOn: string): string {
  return startsOn === endsOn ? formatDay(startsOn) : `${formatDay(startsOn)} to ${formatDay(endsOn)}`;
}

/** Billable days from `days` inside the inclusive range (ISO dates sort lexically). */
export function billableDaysInRange(days: string[], start: string, end: string): string[] {
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return days.filter((d) => d >= lo && d <= hi);
}

/** UI-only estimate (day rate x billable days). Never a source of truth: the API quote replaces it. */
export function estimateCents(dayRateCents: number, days: string[], start: string, end: string): number {
  return dayRateCents * billableDaysInRange(days, start, end).length;
}

/** Days already covered by a live (non-void) subscription cannot be quoted again. */
export function coveredDays(
  days: string[],
  subs: Pick<EventSubscription, 'starts_on' | 'ends_on' | 'status'>[],
): Set<string> {
  const covered = new Set<string>();
  for (const s of subs) {
    if (s.status === 'VOID') continue;
    for (const d of billableDaysInRange(days, s.starts_on, s.ends_on)) covered.add(d);
  }
  return covered;
}

/** Plain-English text for the backend's machine-readable access reason. */
export function describeAccessReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'CANCELLED':
      return 'This event has been cancelled.';
    case 'CALENDAR_NOT_PUBLISHED':
      return 'The event calendar has not been published yet.';
    case 'BEFORE_PREP_WINDOW':
      return 'Set-up opens closer to the event.';
    case 'PREP_WINDOW':
      return 'The event has not started yet; you are in the preparation window.';
    case 'EVENT_ENDED':
      return 'The event has ended.';
    case 'NOT_AN_EVENT_DAY':
      return 'Today is not a trading day for this event.';
    case 'PAID_DAY':
      return 'Today is covered by a paid subscription.';
    case 'NO_PAID_COVER_TODAY':
      return 'Today is an event day, but you have no paid subscription covering it.';
    case 'NO_EVENT':
      return 'This business is not registered for an event.';
    default:
      return reason ? reason.replace(/_/g, ' ').toLowerCase() : '';
  }
}

/** Friendly messages for the subscription endpoints' error codes. */
export function subscriptionErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'OVERLAPS_EXISTING':
        return 'These dates overlap a subscription you already have. Pick days that are not already covered.';
      case 'EVENT_CANCELLED':
        return 'This event has been cancelled, so days can no longer be added.';
      case 'INVALID_SUBSCRIPTION_RANGE':
        return 'That range has no billable event day. Pick at least one event day.';
      case 'PAYMENT_REFERENCE_USED':
        return 'That payment reference is already used on another paid subscription. Check the reference on your bank statement.';
      case 'SUBSCRIPTION_NOT_UNPAID':
        return 'This subscription is no longer unpaid, so it cannot be changed here. Refresh to see its current state.';
      default:
        if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
        return err.message || fallback;
    }
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Password limits mirrored from the backend: 8..128 chars and at most 72 UTF-8 bytes. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Password is too long (72 bytes at most).';
  return null;
}

/** Generic, non-revealing text for a failed public registration (see EventRegisterPage). */
export function registrationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (err.status === 403) {
      return 'We could not register you with these details. Check your registration code and try again.';
    }
    if (err.status === 409) {
      return 'We could not complete your registration with these details. If you have already registered, go to login instead.';
    }
    if (err.status === 422) {
      return 'Some of the details look invalid. Please check every field and try again.';
    }
  }
  return 'Something went wrong while registering. Check your connection and try again.';
}
