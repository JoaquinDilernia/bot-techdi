import { describe, it, expect } from 'vitest';
import { normalizeHex, brandVars } from './brand.js';

describe('brand', () => {
  it('normalizeHex', () => {
    expect(normalizeHex('#0F766E')).toBe('#0f766e');
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('verde')).toBe('#0f766e');
    expect(normalizeHex('')).toBe('#0f766e');
    expect(normalizeHex(null)).toBe('#0f766e');
  });
  it('brandVars', () => {
    expect(brandVars('#0f766e')['--brand']).toBe('#0f766e');
    expect(brandVars('#000000')['--brand-soft']).toMatch(/^#[0-9a-f]{6}$/);
    expect(brandVars('#000000')['--brand-ink']).toMatch(/^#[0-9a-f]{6}$/);
  });
});
