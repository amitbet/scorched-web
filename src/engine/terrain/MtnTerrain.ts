import type { TerrainState } from '../../types/game';
import { parseMtn } from '../../utils/mtn.js';
import { smoothTerrainHeights, terrainFromHeights } from './TerrainProfile';
import ice001Url from '../../assets/mtn/ICE001.MTN?url';
import ice002Url from '../../assets/mtn/ICE002.MTN?url';
import ice003Url from '../../assets/mtn/ICE003.MTN?url';
import rock001Url from '../../assets/mtn/ROCK001.MTN?url';
import rock002Url from '../../assets/mtn/ROCK002.MTN?url';
import rock003Url from '../../assets/mtn/ROCK003.MTN?url';
import rock004Url from '../../assets/mtn/ROCK004.MTN?url';
import rock005Url from '../../assets/mtn/ROCK005.MTN?url';
import rock006Url from '../../assets/mtn/ROCK006.MTN?url';
import snow001Url from '../../assets/mtn/SNOW001.MTN?url';

interface ParsedMtn {
  width: number;
  height: number;
  palette: Array<[number, number, number]>;
  columns: number[][];
  pixels: number[][];
}

interface MtnAssetRef {
  name: string;
  url: string;
}

interface LoadedMtn {
  name: string;
  parsed: ParsedMtn;
}

const MTN_ASSETS: readonly MtnAssetRef[] = [
  { name: 'ICE001', url: ice001Url },
  { name: 'ICE002', url: ice002Url },
  { name: 'ICE003', url: ice003Url },
  { name: 'ROCK001', url: rock001Url },
  { name: 'ROCK002', url: rock002Url },
  { name: 'ROCK003', url: rock003Url },
  { name: 'ROCK004', url: rock004Url },
  { name: 'ROCK005', url: rock005Url },
  { name: 'ROCK006', url: rock006Url },
  { name: 'SNOW001', url: snow001Url },
] as const;

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let loadedMtns: LoadedMtn[] | null = null;
let preloadPromise: Promise<LoadedMtn[]> | null = null;
let mtnPickBag: number[] = [];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAverageHeightToBand(sourceHeights: number[], terrainHeight: number, rng: () => number): number[] {
  if (sourceHeights.length === 0) {
    return sourceHeights;
  }

  const currentAvg = sourceHeights.reduce((sum, value) => sum + value, 0) / sourceHeights.length;
  const targetMin = Math.round(terrainHeight * 0.4);
  const targetMax = Math.round(terrainHeight * 0.65);
  const targetAvg = Math.round(targetMin + (targetMax - targetMin) * rng());
  const delta = targetAvg - currentAvg;

  return sourceHeights.map((value) => clamp(Math.round(value + delta), 0, terrainHeight - 1));
}

export function pickMtnCropForTarget(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  rng: () => number,
): CropRect {
  const aspect = targetW / Math.max(1, targetH);
  const minAspectWidth = Math.round(sourceH * aspect);
  const minCropW = clamp(Math.max(minAspectWidth, Math.round(sourceW * 0.58)), Math.min(sourceW, 64), sourceW);
  const cropW = clamp(Math.round(minCropW + (sourceW - minCropW) * rng()), Math.min(sourceW, 64), sourceW);
  const cropH = sourceH;

  const maxX = Math.max(0, sourceW - cropW);

  return {
    x: maxX === 0 ? 0 : Math.floor(rng() * (maxX + 1)),
    y: 0,
    width: cropW,
    height: cropH,
  };
}

export function terrainFromParsedMtn(parsed: ParsedMtn, width: number, height: number, rng: () => number = Math.random): TerrainState {
  const projectedHeights = new Array<number>(width).fill(height - 1);
  const crop = pickMtnCropForTarget(parsed.width, parsed.height, width, height, rng);
  const sourceHeights = parsed.columns.map((col) => parsed.height - col.length);
  const sourceMax = Math.max(1, parsed.height - 1);
  const targetMax = Math.max(1, height - 1);

  for (let x = 0; x < width; x += 1) {
    const sx = crop.x + Math.floor((x * crop.width) / width);
    const sourceTop = sourceHeights[sx] ?? sourceMax;
    projectedHeights[x] = Math.round((sourceTop / sourceMax) * targetMax);
  }

  const shiftedHeights = normalizeAverageHeightToBand(projectedHeights, height, rng);
  const heights = smoothTerrainHeights(shiftedHeights, height, {
    minTopRatio: 0,
    maxTopRatio: 1,
    maxSlopeDelta: 5,
    breakPlateaus: false,
  });
  const terrain = terrainFromHeights(width, height, heights);
  const colorIndices = new Uint8Array(width * height);

  for (let x = 0; x < width; x += 1) {
    const sx = crop.x + Math.floor((x * crop.width) / width);
    const sourceTop = sourceHeights[sx] ?? sourceMax;
    const targetTop = terrain.heights[x];
    const targetDepth = Math.max(1, height - 1 - targetTop);
    const sourceDepth = Math.max(1, parsed.height - 1 - sourceTop);

    for (let y = targetTop; y < height; y += 1) {
      const rel = y - targetTop;
      const sy = Math.min(parsed.height - 1, sourceTop + Math.floor((rel * sourceDepth) / targetDepth));
      let idx = parsed.pixels[sy]?.[sx] ?? 0;
      if (idx === 0) {
        const fallbackY = Math.min(parsed.height - 1, sourceTop + 1);
        idx = parsed.pixels[fallbackY]?.[sx] ?? 2;
      }
      colorIndices[y * width + x] = idx & 0x0f;
    }
  }

  return {
    ...terrain,
    colorIndices,
    colorPalette: parsed.palette,
  };
}

export async function preloadMtnTerrains(): Promise<LoadedMtn[]> {
  if (loadedMtns) {
    return loadedMtns;
  }
  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = Promise.all(
    MTN_ASSETS.map(async (asset) => {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to load MTN asset ${asset.name}: HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return { name: asset.name, parsed: parseMtn(new Uint8Array(buffer)) as ParsedMtn };
    }),
  );

  const parsed = await preloadPromise;
  loadedMtns = parsed;
  return parsed;
}

export async function generateRandomMtnTerrain(width: number, height: number, rng: () => number = Math.random): Promise<TerrainState> {
  const picked = await pickRandomMtn(width, height, rng);
  return picked.terrain;
}

export async function pickRandomMtn(
  width: number,
  height: number,
  rng: () => number = Math.random,
): Promise<{ terrain: TerrainState; sourceName: string }> {
  const parsed = await preloadMtnTerrains();
  if (mtnPickBag.length === 0) {
    mtnPickBag = Array.from({ length: parsed.length }, (_, i) => i);
    for (let i = mtnPickBag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = mtnPickBag[i];
      mtnPickBag[i] = mtnPickBag[j];
      mtnPickBag[j] = tmp;
    }
  }
  const nextIndex = mtnPickBag.pop() ?? 0;
  const picked = parsed[nextIndex] ?? parsed[0];
  return {
    terrain: terrainFromParsedMtn(picked.parsed, width, height, rng),
    sourceName: picked.name,
  };
}
