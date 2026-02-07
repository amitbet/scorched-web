import type { TerrainState } from '../../types/game';

export function carveCrater(terrain: TerrainState, cx: number, cy: number, radius: number): TerrainState {
  const next = new Uint8Array(terrain.mask);
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

  // Collapse each column after carving so dirt settles downward.
  // This keeps terrain consistent with heightfield-style rendering and collision.
  for (let x = minX; x <= maxX; x += 1) {
    let solids = 0;
    for (let y = 0; y < terrain.height; y += 1) {
      solids += next[y * terrain.width + x];
    }
    const top = terrain.height - solids;
    for (let y = 0; y < terrain.height; y += 1) {
      next[y * terrain.width + x] = y >= top ? 1 : 0;
    }
  }

  const heights = new Array<number>(terrain.width);
  for (let x = 0; x < terrain.width; x += 1) {
    let y = 0;
    while (y < terrain.height && next[y * terrain.width + x] === 0) {
      y += 1;
    }
    heights[x] = y;
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: next,
    heights,
  };
}

export function carveTunnel(terrain: TerrainState, x: number, y: number, length: number, radius: number): TerrainState {
  let current = terrain;
  for (let i = 0; i < length; i += 1) {
    current = carveCrater(current, x, y + i * 2, radius);
  }
  return current;
}
