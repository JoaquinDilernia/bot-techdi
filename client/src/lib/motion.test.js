import { describe, it, expect } from 'vitest';
import { countValue } from './motion.js';

describe('countValue', () => {
  it('cuenta de 0 a to con ease-out', () => {
    expect(countValue(42, 0)).toBe(0);
    expect(countValue(42, 1100)).toBe(42);
    expect(countValue(42, 5000)).toBe(42);
    expect(countValue(42, 550)).toBeGreaterThan(21);
    expect(countValue(0, 500)).toBe(0);
  });
});
