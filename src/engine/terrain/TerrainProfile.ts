import type { TerrainState } from '../../types/game';
import { getFloorTop, stampFloor } from './TerrainDeform';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function movingAverage(values: number[], radius: number): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = i + dx;
      if (x < 0 || x >= values.length) {
        continue;
      }
      sum += values[x];
      count += 1;
    }
    out[i] = sum / Math.max(1, count);
  }
  return out;
}

function applySlopeLimit(values: number[], maxDelta: number): void {
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    values[i] = clamp(values[i], prev - maxDelta, prev + maxDelta);
  }
  for (let i = values.length - 2; i >= 0; i -= 1) {
    const next = values[i + 1];
    values[i] = clamp(values[i], next - maxDelta, next + maxDelta);
  }
}

interface SmoothTerrainOptions {
  minTopRatio?: number;
  maxTopRatio?: number;
  maxSlopeDelta?: number;
  breakPlateaus?: boolean;
}

export function smoothTerrainHeights(
  rawHeights: number[],
  terrainHeight: number,
  options: SmoothTerrainOptions = {},
): number[] {
  const source = rawHeights.map((v) => Number.isFinite(v) ? v : terrainHeight - 1);
  const avgWide = movingAverage(source, 4);
  const avgTight = movingAverage(source, 2);
  const blended = source.map((v, i) => v * 0.5 + avgTight[i] * 0.33 + avgWide[i] * 0.17);

  const minTop = Math.floor(terrainHeight * (options.minTopRatio ?? 0.3));
  const maxTop = Math.floor(terrainHeight * (options.maxTopRatio ?? 0.86));
  const limited = blended.map((v) => clamp(v, minTop, maxTop));
  applySlopeLimit(limited, options.maxSlopeDelta ?? 5);

  const out = limited.map((v) => Math.round(clamp(v, minTop, maxTop)));
  if (options.breakPlateaus !== false) {
    const runThreshold = 6;
    let i = 0;
    while (i < out.length) {
      let j = i + 1;
      while (j < out.length && out[j] === out[i]) {
        j += 1;
      }
      const runLen = j - i;
      if (runLen >= runThreshold) {
        for (let k = i + 1; k < j - 1; k += 1) {
          const step = (k - i) % 4;
          const delta = step === 0 ? -1 : step === 2 ? 1 : 0;
          out[k] = clamp(out[k] + delta, minTop, maxTop);
        }
      }
      i = j;
    }
  }

  return out;
}

export function addSpawnPads(heights: number[], playerCount: number, terrainHeight: number): number[] {
  if (playerCount <= 0 || heights.length === 0) {
    return [...heights];
  }

  const out = [...heights];
  const width = out.length;
  const spacing = width / (playerCount + 1);
  const minTop = Math.floor(terrainHeight * 0.34);
  const maxTop = Math.floor(terrainHeight * 0.84);

  for (let i = 0; i < playerCount; i += 1) {
    const center = Math.floor(spacing * (i + 1));
    const sampleRadius = 16;
    let sum = 0;
    let count = 0;
    for (let dx = -sampleRadius; dx <= sampleRadius; dx += 1) {
      const x = center + dx;
      if (x < 0 || x >= width) {
        continue;
      }
      sum += out[x];
      count += 1;
    }
    const mean = sum / Math.max(1, count);
    const target = clamp(Math.round(mean + 6), minTop, maxTop);
    const padRadius = 20;

    for (let dx = -padRadius; dx <= padRadius; dx += 1) {
      const x = center + dx;
      if (x < 0 || x >= width) {
        continue;
      }
      const t = 1 - Math.abs(dx) / (padRadius + 1);
      out[x] = Math.round(out[x] * (1 - t) + target * t);
    }
  }

  applySlopeLimit(out, 3);
  return out.map((v) => clamp(v, minTop, maxTop));
}

export function terrainFromHeights(width: number, height: number, heights: number[]): TerrainState {
  const mask = new Uint8Array(width * height);

  for (let x = 0; x < width; x += 1) {
    const top = clamp(Math.round(heights[x] ?? (height - 1)), 0, height - 1);
    for (let y = top; y < height; y += 1) {
      mask[y * width + x] = 1;
    }
  }

  // Ensure the indestructible floor is always present.
  stampFloor(mask, width, height);

  // Clamp heights so no column reports a surface inside the floor.
  const floorTop = getFloorTop(height);
  const clampedHeights = heights.map((v) => {
    const h = clamp(Math.round(v), 0, height - 1);
    return Math.min(h, floorTop);
  });

  return {
    width,
    height,
    revision: 0,
    heights: clampedHeights,
    mask,
  };
}
