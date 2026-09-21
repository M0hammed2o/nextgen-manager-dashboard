import { describe, it, expect } from 'vitest';
import { parseRandsToCents, centsToRandsInput } from './mappers';

describe('parseRandsToCents', () => {
  it('parses a whole-rand amount', () => {
    expect(parseRandsToCents('150')).toBe(15000);
  });

  it('parses a two-decimal amount exactly, without float drift', () => {
    // 19.99 * 100 in plain JS float math lands on 1998.9999999999998 —
    // this must never happen here.
    expect(parseRandsToCents('19.99')).toBe(1999);
  });

  it('pads a single decimal digit', () => {
    expect(parseRandsToCents('10.5')).toBe(1050);
  });

  it('is exact for every two-decimal cent value from 0.00 to 9.99', () => {
    for (let cents = 0; cents <= 999; cents++) {
      const rands = (cents / 100).toFixed(2);
      expect(parseRandsToCents(rands)).toBe(cents === 0 ? 0 : cents);
    }
  });

  it('accepts surrounding whitespace', () => {
    expect(parseRandsToCents('  42.50  ')).toBe(4250);
  });

  it('rejects a negative amount', () => {
    expect(parseRandsToCents('-5')).toBeNull();
  });

  it('rejects more than two decimal places', () => {
    expect(parseRandsToCents('10.123')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseRandsToCents('abc')).toBeNull();
    expect(parseRandsToCents('')).toBeNull();
    expect(parseRandsToCents('12.')).toBeNull();
    expect(parseRandsToCents('.50')).toBeNull();
  });
});

describe('centsToRandsInput', () => {
  it('round-trips through parseRandsToCents exactly', () => {
    for (const cents of [0, 1, 50, 100, 1999, 15000, 123456]) {
      expect(parseRandsToCents(centsToRandsInput(cents))).toBe(cents);
    }
  });

  it('formats sub-rand amounts with a leading zero', () => {
    expect(centsToRandsInput(5)).toBe('0.05');
  });

  it('clamps a negative input to zero rather than producing a signed string', () => {
    expect(centsToRandsInput(-100)).toBe('0.00');
  });
});
