import type { TerrainPreset, TerrainState } from '../../types/game';

function fractalHeight(x: number, width: number, base: number, preset: TerrainPreset): number {
  const t = x / width;
  const hills = Math.sin(t * Math.PI * 2) * 0.15 + Math.sin(t * Math.PI * 7.2 + 0.3) * 0.08;
  const crinkles = Math.sin(t * Math.PI * 22 + 2.3) * 0.02;
  const noise = (Math.sin(t * 130.13) + Math.sin(t * 53.7) + Math.sin(t * 11.9)) * 0.01;

  if (preset === 'canyon') {
    const canyon = Math.exp(-Math.pow((t - 0.5) * 5.5, 2)) * 0.25;
    return base + hills + crinkles + noise - canyon;
  }
  if (preset === 'islands') {
    const islandMask = Math.max(0, Math.sin(t * Math.PI * 3.8 - 0.7)) * 0.22;
    return base + hills * 0.4 + islandMask - 0.06;
  }
  return base + hills + crinkles + noise;
}

export function generateTerrain(width: number, height: number, preset: TerrainPreset): TerrainState {
  const selected = preset === 'random' ? (['rolling', 'canyon', 'islands'] as TerrainPreset[])[Math.floor(Math.random() * 3)] : preset;
  const heights = new Array<number>(width).fill(0);
  const mask = new Uint8Array(width * height);

  for (let x = 0; x < width; x += 1) {
    const normalized = fractalHeight(x, width, 0.6, selected);
    const h = Math.max(Math.floor(height * 0.28), Math.min(Math.floor(height * 0.9), Math.floor(height * normalized)));
    heights[x] = h;

    for (let y = h; y < height; y += 1) {
      mask[y * width + x] = 1;
    }
  }

  return { width, height, revision: 0, heights, mask };
}
