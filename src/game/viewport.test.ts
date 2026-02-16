import { describe, expect, it } from 'vitest';
import {
  MAX_DYNAMIC_ASPECT,
  MIN_BATTLEFIELD_WIDTH,
  MIN_DYNAMIC_ASPECT,
  deriveBattlefieldSize,
} from './viewport';

describe('deriveBattlefieldSize', () => {
  it('clamps compressed viewports to the 15:9 floor', () => {
    const size = deriveBattlefieldSize(1000, 2200);
    expect(size.width).toBe(MIN_BATTLEFIELD_WIDTH);
    expect(size.width / size.height).toBeCloseTo(MIN_DYNAMIC_ASPECT, 3);
  });

  it('clamps stretched viewports to the 20:9 ceiling', () => {
    const size = deriveBattlefieldSize(2600, 980);
    expect(size.width).toBe(2600);
    expect(size.width / size.height).toBeCloseTo(MAX_DYNAMIC_ASPECT, 3);
  });

  it('keeps in-range viewports unchanged', () => {
    const size = deriveBattlefieldSize(2400, 1320);
    const expectedAspect = 2400 / (1320 - 40);
    expect(size.width).toBe(2400);
    expect(size.width / size.height).toBeCloseTo(expectedAspect, 3);
  });
});
