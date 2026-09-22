import { describe, it, expect } from 'vitest';
import { getConnectionStatusMeta, getDeadlineUrgency, MR_D_CARD_TITLE } from './delivery';
import type { DeliveryConnectionStatus } from '@/types/api';

const ALL_STATUSES: DeliveryConnectionStatus[] = [
  'NOT_CONNECTED', 'SANDBOX', 'AWAITING_APPROVAL', 'CONNECTED', 'ATTENTION_REQUIRED', 'DISABLED',
];

describe('getConnectionStatusMeta — honesty contract', () => {
  it('CONNECTED is the ONLY Uber Eats status that renders isLive: true', () => {
    for (const status of ALL_STATUSES) {
      const meta = getConnectionStatusMeta({ provider: 'UBER_EATS', status });
      if (status === 'CONNECTED') {
        expect(meta.isLive).toBe(true);
      } else {
        expect(meta.isLive).toBe(false);
      }
    }
  });

  it('SANDBOX never renders as connected/live in label or description', () => {
    const meta = getConnectionStatusMeta({ provider: 'UBER_EATS', status: 'SANDBOX' });
    expect(meta.isLive).toBe(false);
    expect(meta.badgeLabel.toLowerCase()).not.toContain('connected');
    expect(meta.badgeLabel.toLowerCase()).toContain('not live');
    expect(meta.description.toLowerCase()).toContain('not live');
    expect(meta.description.toLowerCase()).toContain('no real customer orders');
  });

  it('AWAITING_APPROVAL never renders as connected/live in label or description', () => {
    const meta = getConnectionStatusMeta({ provider: 'UBER_EATS', status: 'AWAITING_APPROVAL' });
    expect(meta.isLive).toBe(false);
    expect(meta.badgeLabel.toLowerCase()).not.toContain('connected');
    expect(meta.badgeLabel.toLowerCase()).toContain('not live');
    expect(meta.description.toLowerCase()).toContain('not yet approved');
  });

  it('SANDBOX and AWAITING_APPROVAL are visually distinct badge variants from CONNECTED', () => {
    const connected = getConnectionStatusMeta({ provider: 'UBER_EATS', status: 'CONNECTED' });
    const sandbox = getConnectionStatusMeta({ provider: 'UBER_EATS', status: 'SANDBOX' });
    const awaiting = getConnectionStatusMeta({ provider: 'UBER_EATS', status: 'AWAITING_APPROVAL' });
    expect(sandbox.badgeVariant).not.toBe(connected.badgeVariant);
    expect(awaiting.badgeVariant).not.toBe(connected.badgeVariant);
  });

  it('Mr D NEVER renders as live/connected, for every possible status value', () => {
    for (const status of ALL_STATUSES) {
      const meta = getConnectionStatusMeta({ provider: 'MR_D', status });
      expect(meta.isLive).toBe(false);
      expect(meta.badgeLabel.toLowerCase()).not.toContain('connected');
      expect(meta.badgeLabel.toLowerCase()).not.toContain('live');
    }
  });

  it('Mr D always describes itself as file-reconciliation-only, never as a live integration', () => {
    const meta = getConnectionStatusMeta({ provider: 'MR_D', status: 'CONNECTED' });
    expect(meta.description.toLowerCase()).toContain('no live mr d');
    expect(meta.description.toLowerCase()).toContain('csv');
  });

  it('exposes the fixed Mr D card title required by the product brief', () => {
    expect(MR_D_CARD_TITLE).toBe('Mr D File Reconciliation');
  });
});

describe('getDeadlineUrgency', () => {
  const now = new Date('2026-09-22T12:00:00Z').getTime();

  it('returns null when there is no deadline', () => {
    expect(getDeadlineUrgency(null, now)).toBeNull();
  });

  it('reports minutes/seconds remaining and not urgent when far from the deadline', () => {
    const deadline = new Date(now + 8 * 60 * 1000).toISOString();
    const urgency = getDeadlineUrgency(deadline, now)!;
    expect(urgency.isPastDeadline).toBe(false);
    expect(urgency.isUrgent).toBe(false);
    expect(urgency.label).toContain('8m 00s left');
  });

  it('flags urgent inside the last 2 minutes', () => {
    const deadline = new Date(now + 90 * 1000).toISOString();
    const urgency = getDeadlineUrgency(deadline, now)!;
    expect(urgency.isPastDeadline).toBe(false);
    expect(urgency.isUrgent).toBe(true);
    expect(urgency.label).toContain('1m 30s left');
  });

  it('flags past-deadline with a plain-language auto-decline message, not a negative countdown', () => {
    const deadline = new Date(now - 5000).toISOString();
    const urgency = getDeadlineUrgency(deadline, now)!;
    expect(urgency.isPastDeadline).toBe(true);
    expect(urgency.isUrgent).toBe(false);
    expect(urgency.label).toContain('automatically declined');
  });
});
