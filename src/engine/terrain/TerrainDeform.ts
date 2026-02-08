import type { TerrainState } from '../../types/game';

function rebuildHeights(mask: Uint8Array, width: number, height: number): number[] {
  const heights = new Array<number>(width);
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height && mask[y * width + x] === 0) {
      y += 1;
    }
    heights[x] = y;
  }
  return heights;
}

function settleMask(mask: Uint8Array, width: number, height: number): void {
  const settled = new Uint8Array(mask);
  for (let x = 0; x < width; x += 1) {
    let solids = 0;
    for (let y = 0; y < height; y += 1) {
      solids += settled[y * width + x];
    }
    const top = height - solids;
    for (let y = 0; y < height; y += 1) {
      settled[y * width + x] = y >= top ? 1 : 0;
    }
  }
  mask.set(settled);
}

export function settleTerrain(terrain: TerrainState): TerrainState {
  const mask = new Uint8Array(terrain.mask);
  settleMask(mask, terrain.width, terrain.height);
  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: mask as Uint8Array,
    heights: rebuildHeights(mask, terrain.width, terrain.height),
  };
}

export function carveCrater(terrain: TerrainState, cx: number, cy: number, radius: number, settle = true): TerrainState {
  let next = new Uint8Array(terrain.mask);
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(terrain.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(terrain.height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        next[y * terrain.width + x] = 0;
      }
    }
  }

  if (settle) {
    settleMask(next, terrain.width, terrain.height);
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: next as Uint8Array,
    heights: rebuildHeights(next, terrain.width, terrain.height),
  };
}

export function carveTunnel(terrain: TerrainState, x: number, y: number, length: number, radius: number, settle = true): TerrainState {
  let current = terrain;
  for (let i = 0; i < length; i += 1) {
    current = carveCrater(current, x, y + i * 2, radius, false);
  }
  return settle ? settleTerrain(current) : current;
}

export function addDirt(terrain: TerrainState, cx: number, cy: number, radius: number, amount = 1, settle = true): TerrainState {
  let next = new Uint8Array(terrain.mask);
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(terrain.width - 1, Math.ceil(cx + radius));

  for (let x = minX; x <= maxX; x += 1) {
    const dx = Math.abs(x - cx);
    const influence = Math.max(0, 1 - dx / Math.max(1, radius));
    const raiseBy = Math.max(0, Math.round(influence * amount));
    if (raiseBy <= 0) {
      continue;
    }

    let top = terrain.heights[x];
    for (let i = 0; i < raiseBy; i += 1) {
      const y = top - 1 - i;
      if (y >= 0) {
        next[y * terrain.width + x] = 1;
      }
    }

    // Also drop a little loose dirt around the impact center.
    if (Math.random() < influence * 0.5) {
      const scatterY = Math.max(0, Math.floor(cy - Math.random() * radius * 0.8));
      next[scatterY * terrain.width + x] = 1;
    }
  }

  if (settle) {
    settleMask(next, terrain.width, terrain.height);
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: next as Uint8Array,
    heights: rebuildHeights(next, terrain.width, terrain.height),
  };
}
