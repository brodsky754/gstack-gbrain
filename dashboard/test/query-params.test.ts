import { describe, test, expect } from 'bun:test';
import { parseIntParam } from '../lib/query-params';

const opts = { fallback: 50, min: 5, max: 200 };

describe('parseIntParam', () => {
  test('in-range integer is returned as-is', () => {
    expect(parseIntParam('42', opts)).toBe(42);
  });

  test('clamps below min and above max', () => {
    expect(parseIntParam('1', opts)).toBe(5);
    expect(parseIntParam('999', opts)).toBe(200);
    expect(parseIntParam('-7', opts)).toBe(5);
  });

  test('missing, empty, or non-numeric falls back instead of yielding NaN', () => {
    // Regression: /api/graph?limit=abc used to compute NaN via
    // Math.min(Math.max(parseInt('abc'))) and return an empty graph.
    expect(parseIntParam(null, opts)).toBe(50);
    expect(parseIntParam('', opts)).toBe(50);
    expect(parseIntParam('abc', opts)).toBe(50);
    expect(parseIntParam('NaN', opts)).toBe(50);
    expect(parseIntParam('Infinity', opts)).toBe(50);
  });

  test('leading-integer strings keep parseInt semantics', () => {
    expect(parseIntParam('12abc', opts)).toBe(12);
    expect(parseIntParam(' 30 ', opts)).toBe(30);
  });
});
