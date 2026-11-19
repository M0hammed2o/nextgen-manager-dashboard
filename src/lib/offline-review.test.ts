import { describe, it, expect } from 'vitest';
import {
  OFFLINE_REASON_FILTERS, acknowledgePath, buildFlaggedPath, reasonChipLabel, reasonExplanation,
} from './offline-review';

describe('reason chip text', () => {
  it('has a readable chip for every reason the API can filter on', () => {
    expect(reasonChipLabel('shortfall')).toBe('Stock below zero');
    expect(reasonChipLabel('variance')).toBe('Price differed');
    expect(reasonChipLabel('unattributed')).toBe('No till open');
    expect(reasonChipLabel('late_till')).toBe('Till already closed');
    expect(reasonChipLabel('capture_day_unpaid_at_sync')).toBe('Unpaid day at sync');
    expect(reasonChipLabel('late_sync')).toBe('Synced late');
    expect(reasonChipLabel('cashier_differs_from_syncer')).toBe('Cashier differs');
    for (const r of OFFLINE_REASON_FILTERS) expect(reasonChipLabel(r)).not.toMatch(/_/);
  });

  it('humanises a reason it has never seen instead of showing the raw code', () => {
    expect(reasonChipLabel('some_new_reason')).toBe('Some new reason');
    expect(reasonExplanation('some_new_reason')).toContain('Some new reason');
  });

  it('explains each reason in plain language', () => {
    expect(reasonExplanation('capture_day_unpaid_at_sync')).toBe('Synced on a day this stall had not paid for.');
    expect(reasonExplanation('cashier_differs_from_syncer')).toBe('Cashier differs from the person who synced.');
    expect(reasonExplanation('unattributed')).toBe('No till session was open at the time of sale.');
    expect(reasonExplanation('shortfall')).toBe('Stock went below zero.');
  });

  it('puts the rand amount in the price explanation, whichever way the variance went', () => {
    const over = reasonExplanation('variance', { offline_price_variance_cents: 1500 });
    const under = reasonExplanation('variance', { offline_price_variance_cents: -1500 });
    expect(over).toMatch(/differed from the system price by .*15[.,]00/);
    expect(under).toBe(over);
    expect(over).not.toContain('-');
  });
});

describe('buildFlaggedPath', () => {
  const base = '/v1/business/pos/offline-orders/flagged';
  it('leaves defaults off the query string', () => {
    expect(buildFlaggedPath()).toBe(base);
    expect(buildFlaggedPath({ reason: '', includeAcknowledged: false })).toBe(base);
  });
  it('sends reason, include_acknowledged, since and limit when set', () => {
    expect(buildFlaggedPath({ reason: 'late_sync', includeAcknowledged: true, limit: 100 }))
      .toBe(`${base}?reason=late_sync&include_acknowledged=true&limit=100`);
    expect(buildFlaggedPath({ since: '2026-11-01T00:00:00+02:00' }))
      .toBe(`${base}?since=2026-11-01T00%3A00%3A00%2B02%3A00`);
  });
  it('builds the acknowledge endpoint', () => {
    expect(acknowledgePath('abc-123')).toBe('/v1/business/pos/offline-orders/abc-123/acknowledge');
  });
});
