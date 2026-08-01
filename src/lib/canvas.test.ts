import { describe, expect, it } from 'vitest';
import { cappedRasterScale } from './canvas';

describe('cappedRasterScale', () => {
  it('keeps ordinary renders at their requested resolution', () => {
    expect(cappedRasterScale(1000, 800, 2)).toBe(2);
  });

  it('caps deep zoom before canvas dimensions or memory become unsafe', () => {
    const scale = cappedRasterScale(2400, 1800, 16);
    expect(scale).toBeLessThan(2);
    expect(2400 * scale).toBeLessThanOrEqual(8192);
    expect(Math.floor(2400 * scale) * Math.floor(1800 * scale)).toBeLessThanOrEqual(16_777_216);
  });
});
