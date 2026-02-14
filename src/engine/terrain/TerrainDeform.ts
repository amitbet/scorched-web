import type { TerrainState } from '../../types/game';

/** Indestructible solid floor at the very bottom of the battlefield (pixels). */
export const FLOOR_THICKNESS = 1;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function effectiveFloorThickness(height: number): number {
  void height;
  return FLOOR_THICKNESS;
}

export function getFloorTop(height: number): number {
  return height - effectiveFloorThickness(height);
}

/** Stamp an indestructible floor into the bottom rows of the mask. */
export function stampFloor(mask: Uint8Array, width: number, height: number): void {
  const floorTop = getFloorTop(height);
  for (let y = floorTop; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = 1;
    }
  }
}

function rebuildHeights(mask: Uint8Array, width: number, height: number): number[] {
  // Always enforce the indestructible floor before scanning.
  stampFloor(mask, width, height);
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

export function ensureFloorIntegrity(terrain: TerrainState): TerrainState {
  const mask = new Uint8Array(terrain.mask);
  const floorTop = getFloorTop(terrain.height);
  let changed = false;
  for (let y = floorTop; y < terrain.height; y += 1) {
    for (let x = 0; x < terrain.width; x += 1) {
      const idx = y * terrain.width + x;
      if (mask[idx] !== 1) {
        mask[idx] = 1;
        changed = true;
      }
    }
  }
  if (!changed) {
    return terrain;
  }
  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: mask as Uint8Array,
    heights: rebuildHeights(mask, terrain.width, terrain.height),
  };
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
  stampFloor(mask, width, height);
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
  } else {
    stampFloor(next, terrain.width, terrain.height);
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

export function addDirtDisk(terrain: TerrainState, cx: number, cy: number, radius: number, settle = true): TerrainState {
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
        next[y * terrain.width + x] = 1;
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

export function addLiquidDirt(
  terrain: TerrainState,
  cx: number,
  cy: number,
  range = 220,
  maxCells = 18000,
  settle = true,
): TerrainState {
  const width = terrain.width;
  const height = terrain.height;
  const source = terrain.mask;
  const mask = new Uint8Array(source);
  const startX = clamp(Math.floor(cx), 0, width - 1);
  let startY = clamp(Math.floor(cy) - 1, 0, height - 1);
  while (startY > 0 && source[startY * width + startX] === 1) {
    startY -= 1;
  }
  const minX = Math.max(0, startX - range);
  const maxX = Math.min(width - 1, startX + range);
  const queue: Array<[number, number]> = [[startX, startY]];
  const visited = new Uint8Array(width * height);
  const basin: Array<{ x: number; y: number }> = [];

  while (queue.length > 0) {
    const [x, y] = queue.pop() as [number, number];
    if (x < minX || x > maxX || y < 0 || y >= height) {
      continue;
    }
    const idx = y * width + x;
    if (visited[idx] === 1 || source[idx] === 1) {
      continue;
    }
    visited[idx] = 1;
    basin.push({ x, y });
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  if (basin.length === 0) {
    return terrain;
  }

  // Fixed-volume liquid: fill lowest reachable air first.
  basin.sort((a, b) => (b.y - a.y) || (Math.abs(a.x - startX) - Math.abs(b.x - startX)));
  const budget = Math.max(1, Math.min(maxCells, basin.length));
  for (let i = 0; i < budget; i += 1) {
    const cell = basin[i];
    mask[cell.y * width + cell.x] = 1;
  }

  if (settle) {
    settleMask(mask, width, height);
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: mask as Uint8Array,
    heights: rebuildHeights(mask, width, height),
  };
}

export function flattenBaseForTank(
  terrain: TerrainState,
  cx: number,
  halfWidth = 7,
  drop = 3,
): TerrainState {
  const minX = Math.max(0, Math.floor(cx - halfWidth));
  const maxX = Math.min(terrain.width - 1, Math.ceil(cx + halfWidth));
  const mask = new Uint8Array(terrain.mask);
  const highest = Math.min(...terrain.heights.slice(minX, maxX + 1));
  const targetTop = clamp(highest + drop, 0, terrain.height - 2);

  for (let x = minX; x <= maxX; x += 1) {
    const top = terrain.heights[x];
    if (top < targetTop) {
      for (let y = top; y < targetTop; y += 1) {
        mask[y * terrain.width + x] = 0;
      }
    } else if (top > targetTop) {
      for (let y = targetTop; y < top; y += 1) {
        mask[y * terrain.width + x] = 1;
      }
    }
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: mask as Uint8Array,
    heights: rebuildHeights(mask, terrain.width, terrain.height),
  };
}

export function carveTankBase(
  terrain: TerrainState,
  cx: number,
  tankY: number,
  halfWidth = 7,
  depth = 2,
): TerrainState {
  const minX = Math.max(0, Math.floor(cx - halfWidth));
  const maxX = Math.min(terrain.width - 1, Math.ceil(cx + halfWidth));
  const baseTop = clamp(Math.floor(tankY + 4), 0, terrain.height - 1);
  const baseBottom = clamp(baseTop + Math.max(0, depth - 1), 0, terrain.height - 1);
  const mask = new Uint8Array(terrain.mask);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = baseTop; y <= baseBottom; y += 1) {
      mask[y * terrain.width + x] = 0;
    }
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: mask as Uint8Array,
    heights: rebuildHeights(mask, terrain.width, terrain.height),
  };
}

export function clearRect(
  terrain: TerrainState,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): TerrainState {
  const clampedMinX = clamp(Math.floor(minX), 0, terrain.width - 1);
  const clampedMaxX = clamp(Math.floor(maxX), 0, terrain.width - 1);
  const clampedMinY = clamp(Math.floor(minY), 0, terrain.height - 1);
  const clampedMaxY = clamp(Math.floor(maxY), 0, terrain.height - 1);
  if (clampedMaxX < clampedMinX || clampedMaxY < clampedMinY) {
    return terrain;
  }

  const mask = new Uint8Array(terrain.mask);
  for (let x = clampedMinX; x <= clampedMaxX; x += 1) {
    for (let y = clampedMinY; y <= clampedMaxY; y += 1) {
      mask[y * terrain.width + x] = 0;
    }
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    mask: mask as Uint8Array,
    heights: rebuildHeights(mask, terrain.width, terrain.height),
  };
}

export function carveFlatPad(
  terrain: TerrainState,
  cx: number,
  halfWidth = 7,
  sink = 2,
): { terrain: TerrainState; topY: number } {
  const minX = Math.max(0, Math.floor(cx - halfWidth));
  const maxX = Math.min(terrain.width - 1, Math.ceil(cx + halfWidth));
  let targetTop = 0;
  for (let x = minX; x <= maxX; x += 1) {
    targetTop = Math.max(targetTop, terrain.heights[x]);
  }
  targetTop = clamp(targetTop + Math.max(0, sink), 0, terrain.height - 2);
  const mask = new Uint8Array(terrain.mask);

  for (let x = minX; x <= maxX; x += 1) {
    const top = terrain.heights[x];
    if (top < targetTop) {
      for (let y = top; y < targetTop; y += 1) {
        mask[y * terrain.width + x] = 0;
      }
    }
  }

  return {
    terrain: {
      ...terrain,
      revision: terrain.revision + 1,
      mask: mask as Uint8Array,
      heights: rebuildHeights(mask, terrain.width, terrain.height),
    },
    topY: targetTop,
  };
}
