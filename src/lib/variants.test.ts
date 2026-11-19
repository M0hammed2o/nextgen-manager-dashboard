import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { MAX_MATRIX, buildMatrixPreview, buildSku, normaliseChips, variantErrorMessage } from './variants';

describe('matrix preview SKU generation (mirrors the backend rule)', () => {
  it('builds PREFIX-SIZE-COLOUR, upper-cased, with spaces removed', () => {
    const p = buildMatrixPreview('tee', ['S', 'Extra Large'], ['Black', 'Navy Blue']);
    expect(p.rows.map((r) => r.sku)).toEqual([
      'TEE-S-BLACK', 'TEE-S-NAVYBLUE', 'TEE-EXTRALARGE-BLACK', 'TEE-EXTRALARGE-NAVYBLUE',
    ]);
    expect(p.count).toBe(4);
    expect(p.rows[0].attributes).toEqual({ size: 'S', colour: 'Black' });
  });

  it('skips an empty axis and removes spaces from the prefix too', () => {
    expect(buildMatrixPreview('my tee', ['m', 'l'], []).rows.map((r) => r.sku)).toEqual(['MYTEE-M', 'MYTEE-L']);
    expect(buildMatrixPreview('TEE', [], ['red']).rows.map((r) => r.sku)).toEqual(['TEE-RED']);
    expect(buildSku('a', undefined, 'b')).toBe('A-B');
  });

  it('truncates to 64 characters like the backend', () => {
    expect(buildSku('x'.repeat(60), 'LARGE', 'BLACK')).toHaveLength(64);
  });

  it('is empty without a prefix or without any size/colour', () => {
    expect(buildMatrixPreview('', ['S'], []).empty).toBe(true);
    expect(buildMatrixPreview('TEE', [], []).empty).toBe(true);
  });

  it('normalises chips: trims and drops blanks and case-insensitive duplicates', () => {
    expect(normaliseChips([' S ', 's', '', 'M'])).toEqual(['S', 'M']);
  });

  it('flags SKU collisions that only appear after spaces are removed', () => {
    const p = buildMatrixPreview('T', ['A B', 'AB'], ['Red']);
    expect(p.collisions).toEqual(['T-AB-RED']);
  });
});

describe('the 200-combination block', () => {
  const many = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`);

  it('allows exactly 200 and blocks 201+', () => {
    const ok = buildMatrixPreview('T', many(20, 's'), many(10, 'c'));
    expect(ok.count).toBe(MAX_MATRIX);
    expect(ok.overLimit).toBe(false);
    const bad = buildMatrixPreview('T', many(21, 's'), many(10, 'c'));
    expect(bad.count).toBe(210);
    expect(bad.overLimit).toBe(true);
    expect(bad.rows).toEqual([]);
    expect(buildMatrixPreview('T', many(201, 's'), []).overLimit).toBe(true);
  });
});

describe('variant error-code mapping', () => {
  it.each([
    ['SKU_TAKEN', /SKU is already used/],
    ['BARCODE_TAKEN', /barcode is already used/],
    ['VARIANT_CONFLICT', /Nothing was saved/],
    ['SKU_PATTERN_COLLISION', /same SKU/],
  ])('maps %s to a clear message', (code, re) => {
    expect(variantErrorMessage(new ApiError('raw server text', 409, code))).toMatch(re);
  });

  it('handles 404, 403, unknown codes and plain errors', () => {
    expect(variantErrorMessage(new ApiError('nf', 404))).toMatch(/no longer exists/);
    expect(variantErrorMessage(new ApiError('no', 403))).toMatch(/owner or manager/);
    expect(variantErrorMessage(new ApiError('Custom server text', 422, 'OTHER'))).toBe('Custom server text');
    expect(variantErrorMessage(new Error('boom'))).toBe('boom');
    expect(variantErrorMessage('x')).toMatch(/Something went wrong/);
  });
});
