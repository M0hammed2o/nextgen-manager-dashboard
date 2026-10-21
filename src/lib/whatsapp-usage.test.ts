import { describe, it, expect } from 'vitest';
import { getUsageTierDisplay, hasConfiguredAllowance, clampPct } from './whatsapp-usage';
import type { WhatsAppOrderUsage } from '@/types/api';

describe('getUsageTierDisplay', () => {
  it('returns a distinct label/colour for each tier', () => {
    expect(getUsageTierDisplay('ok').label).toBe('On track');
    expect(getUsageTierDisplay('warning_80').label).toBe('80% used');
    expect(getUsageTierDisplay('warning_90').label).toBe('90% used');
    expect(getUsageTierDisplay('exceeded').label).toBe('Allowance exceeded');
  });

  it('exceeded uses the destructive palette, ok uses the success palette (never colour-only — label always present too)', () => {
    expect(getUsageTierDisplay('exceeded').pillClassName).toContain('destructive');
    expect(getUsageTierDisplay('ok').pillClassName).toContain('success');
  });

  it('falls back to "ok" styling for an unrecognised tier rather than throwing', () => {
    expect(getUsageTierDisplay('unknown_future_tier' as never)).toEqual(getUsageTierDisplay('ok'));
  });
});

describe('hasConfiguredAllowance', () => {
  const base: WhatsAppOrderUsage = {
    period_start: '2026-10-01',
    orders_used: 10,
    orders_allowance: null,
    orders_remaining: null,
    pct_used: null,
    tier: 'ok',
  };

  it('is false when the tenant has no configured allowance (orders_allowance is null) — the majority case', () => {
    expect(hasConfiguredAllowance(base)).toBe(false);
  });

  it('is false while the usage query has not resolved yet (undefined/null)', () => {
    expect(hasConfiguredAllowance(undefined)).toBe(false);
    expect(hasConfiguredAllowance(null)).toBe(false);
  });

  it('is true once a real allowance is configured', () => {
    expect(hasConfiguredAllowance({ ...base, orders_allowance: 500 })).toBe(true);
  });

  it('is true even when the allowance is exactly 0 (a real, deliberate zero-allowance config, distinct from "unconfigured")', () => {
    expect(hasConfiguredAllowance({ ...base, orders_allowance: 0 })).toBe(true);
  });
});

describe('clampPct', () => {
  it('passes a normal percentage through unchanged', () => {
    expect(clampPct(42)).toBe(42);
  });

  it('clamps a value over 100 down to 100', () => {
    expect(clampPct(104)).toBe(100);
  });

  it('clamps a negative value up to 0', () => {
    expect(clampPct(-5)).toBe(0);
  });

  it('treats null/undefined/NaN as 0', () => {
    expect(clampPct(null)).toBe(0);
    expect(clampPct(undefined)).toBe(0);
    expect(clampPct(NaN)).toBe(0);
  });
});
