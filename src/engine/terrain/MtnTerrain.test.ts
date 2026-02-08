import { describe, expect, it } from 'vitest';
import { pickMtnCropForTarget, terrainFromParsedMtn } from './MtnTerrain';

const parsed = {
  width: 8,
  height: 6,
  palette: Array.from({ length: 16 }, (_, i) => [i * 10, i * 10, i * 10] as [number, number, number]),
  columns: [
    [3, 3],
    [3, 3, 3],
    [2, 2, 2, 2],
    [2, 2, 2, 2],
    [2, 2, 2],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
  ],
  pixels: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 2, 2, 0, 0, 1, 1],
    [0, 3, 3, 2, 2, 0, 1, 1],
    [3, 3, 3, 2, 2, 2, 1, 1],
    [3, 3, 3, 2, 2, 2, 1, 1],
  ],
};

describe('terrainFromParsedMtn', () => {
  it('builds mask/heights terrain from parsed MTN pixels', () => {
    const terrain = terrainFromParsedMtn(parsed, 6, 5, () => 0);

    expect(terrain.width).toBe(6);
    expect(terrain.height).toBe(5);
    expect(terrain.heights).toHaveLength(6);
    expect(terrain.mask).toHaveLength(30);

    for (let x = 0; x < terrain.width; x += 1) {
      const top = terrain.heights[x];
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(terrain.height);
      expect(terrain.mask[top * terrain.width + x]).toBe(1);
    }
  });

  it('uses different MTN crop regions when random source changes', () => {
    const fromSequence = (values: number[]) => {
      let index = 0;
      return () => {
        const value = values[index] ?? values[values.length - 1] ?? 0;
        index += 1;
        return value;
      };
    };

    const a = pickMtnCropForTarget(1200, 300, 900, 500, fromSequence([0.2, 0, 0]));
    const b = pickMtnCropForTarget(1200, 300, 900, 500, fromSequence([0.2, 0.99, 0.99]));

    expect(a.height).toBe(300);
    expect(b.height).toBe(300);
    expect(a.y).toBe(0);
    expect(b.y).toBe(0);
    expect(a.x).not.toBe(b.x);
  });
});
