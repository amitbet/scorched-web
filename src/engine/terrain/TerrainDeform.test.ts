import { describe, expect, it } from 'vitest';
import { generateTerrain } from './TerrainGenerator';
import { carveCrater } from './TerrainDeform';
import type { TerrainState } from '../../types/game';

describe('TerrainDeform', () => {
  it('carves away terrain mask in crater radius', () => {
    const terrain = generateTerrain(200, 120, 'rolling');
    const before = terrain.mask.reduce((a, b) => a + b, 0);
    const next = carveCrater(terrain, 100, 90, 12);
    const after = next.mask.reduce((a, b) => a + b, 0);
    expect(after).toBeLessThan(before);
  });

  it('collapses carved columns so side impacts remove visible dirt', () => {
    const width = 30;
    const height = 24;
    const heights = new Array<number>(width).fill(6);
    const mask = new Uint8Array(width * height);
    for (let y = 6; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        mask[y * width + x] = 1;
      }
    }
    const terrain: TerrainState = { width, height, heights, mask, revision: 0 };
    const next = carveCrater(terrain, 15, 14, 4);
    expect(next.heights[15]).toBeGreaterThan(terrain.heights[15]);
  });
});
