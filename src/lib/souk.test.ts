import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  billableDaysInRange, coveredDays, describeAccessReason, estimateCents, passwordProblem, subscriptionErrorMessage,
} from './souk';

const DAYS = ['2026-12-05', '2026-12-06', '2026-12-09'];

describe('souk helpers', () => {
  it('counts only billable days inside the range, in either direction', () => {
    expect(billableDaysInRange(DAYS, '2026-12-05', '2026-12-09')).toEqual(DAYS);
    expect(billableDaysInRange(DAYS, '2026-12-09', '2026-12-06')).toEqual(['2026-12-06', '2026-12-09']);
  });

  it('estimates day rate x billable days', () => {
    expect(estimateCents(150000, DAYS, '2026-12-05', '2026-12-09')).toBe(450000);
  });

  it('ignores void subscriptions when working out covered days', () => {
    const covered = coveredDays(DAYS, [
      { starts_on: '2026-12-05', ends_on: '2026-12-05', status: 'PAID' },
      { starts_on: '2026-12-06', ends_on: '2026-12-06', status: 'VOID' },
    ]);
    expect([...covered]).toEqual(['2026-12-05']);
  });

  it('validates password length and the 72-byte limit', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem('x'.repeat(129))).toMatch(/at most 128/);
    expect(passwordProblem('é'.repeat(40))).toMatch(/72 bytes/);
    expect(passwordProblem('long-enough-1')).toBeNull();
  });

  it('maps subscription error codes to plain messages', () => {
    expect(subscriptionErrorMessage(new ApiError('x', 409, 'PAYMENT_REFERENCE_USED'), 'f')).toMatch(/already used/);
    expect(subscriptionErrorMessage(new ApiError('x', 409, 'SUBSCRIPTION_NOT_UNPAID'), 'f')).toMatch(/no longer unpaid/);
    expect(subscriptionErrorMessage(new ApiError('x', 429), 'f')).toMatch(/too many/i);
    expect(subscriptionErrorMessage(new Error('boom'), 'f')).toBe('boom');
    expect(subscriptionErrorMessage('weird', 'fallback')).toBe('fallback');
  });

  it('describes known access reasons and falls back for unknown ones', () => {
    expect(describeAccessReason('PREP_WINDOW')).toMatch(/preparation window/);
    expect(describeAccessReason('SOMETHING_NEW')).toBe('something new');
    expect(describeAccessReason(null)).toBe('');
  });
});
