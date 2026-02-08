import Phaser from 'phaser';

export interface NukeExplosionVisual {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife?: number;
  seed?: number;
}

// Dark->bright red palette order (used both for color and dissipation order).
const PALETTE = [
  0x050505,
  0x180000,
  0x330000,
  0x5a0000,
  0x830000,
  0xad0000,
  0xd50000,
  0xff1800,
];

const PATTERN_SIZE = 96;
const PATTERN_SEED = 9137;
const PATTERN: Uint8Array = buildPattern(PATTERN_SIZE, PATTERN_SEED);
const DARK_DIST: Float32Array = buildDarkDistanceMap(PATTERN, PATTERN_SIZE);
const DARK_DIST_MAX = maxOf(DARK_DIST);

function fract(v: number): number {
  return v - Math.floor(v);
}

function hash2(x: number, y: number, seed: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 73.17) * 43758.5453);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;

  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);

  const ux = smoothstep(tx);
  const uy = smoothstep(ty);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.6;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < 5; i += 1) {
    sum += valueNoise2D(x * freq, y * freq, seed + i * 17.0) * amp;
    norm += amp;
    freq *= 2.02;
    amp *= 0.52;
  }
  return sum / Math.max(0.0001, norm);
}

function buildPattern(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const nx = (u - 0.5) * 2;
      const ny = (v - 0.5) * 2;
      const n1 = fbm(nx * 3.4, ny * 3.4, seed);
      const n2 = fbm((nx + 0.37) * 6.2, (ny - 0.21) * 6.2, seed + 91);
      const n = n1 * 0.72 + n2 * 0.28;
      // Quantize to fixed index texture. This is the static "exact pattern" for the game.
      let idx = Math.floor(n * PALETTE.length);
      if (idx < 0) idx = 0;
      if (idx >= PALETTE.length) idx = PALETTE.length - 1;
      out[y * size + x] = idx;
    }
  }
  return out;
}

function getPatternIndex(u: number, v: number): number {
  const px = Math.max(0, Math.min(PATTERN_SIZE - 1, Math.floor(u * (PATTERN_SIZE - 1))));
  const py = Math.max(0, Math.min(PATTERN_SIZE - 1, Math.floor(v * (PATTERN_SIZE - 1))));
  return PATTERN[py * PATTERN_SIZE + px];
}

function getPatternCoord(u: number, v: number): { px: number; py: number } {
  const px = Math.max(0, Math.min(PATTERN_SIZE - 1, Math.floor(u * (PATTERN_SIZE - 1))));
  const py = Math.max(0, Math.min(PATTERN_SIZE - 1, Math.floor(v * (PATTERN_SIZE - 1))));
  return { px, py };
}

function mixPalette(c0: number, c1: number, t: number): number {
  const r0 = (c0 >> 16) & 0xff;
  const g0 = (c0 >> 8) & 0xff;
  const b0 = c0 & 0xff;
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return (r << 16) | (g << 8) | b;
}

function maxOf(arr: Float32Array): number {
  let m = 0;
  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i] > m) m = arr[i];
  }
  return m;
}

function buildDarkDistanceMap(pattern: Uint8Array, size: number): Float32Array {
  const out = new Float32Array(size * size);
  const qx = new Int16Array(size * size);
  const qy = new Int16Array(size * size);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      if (pattern[i] <= 1) {
        out[i] = 0;
        qx[tail] = x;
        qy[tail] = y;
        tail += 1;
      } else {
        out[i] = 1e9;
      }
    }
  }

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    const base = out[y * size + x];
    for (let k = 0; k < dirs.length; k += 1) {
      const nx = x + dirs[k][0];
      const ny = y + dirs[k][1];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const ni = ny * size + nx;
      const nd = base + 1;
      if (nd < out[ni]) {
        out[ni] = nd;
        qx[tail] = nx;
        qy[tail] = ny;
        tail += 1;
      }
    }
  }
  return out;
}

export function drawNukeExplosion(
  graphics: Phaser.GameObjects.Graphics,
  exp: NukeExplosionVisual,
): void {
  const maxLife = Math.max(0.001, exp.maxLife ?? exp.life);
  const elapsed = Math.max(0, maxLife - exp.life);
  const progress = Phaser.Math.Clamp(elapsed / maxLife, 0, 1);

  // Stage timings: grow -> long hold/rotate -> dissipate
  const growT = 0.42;
  const holdT = 0.34;
  const dissT = 1 - growT - holdT;

  let radiusScale = 1;
  if (progress < growT) {
    const t = progress / growT;
    radiusScale = 0.08 + (1 - (1 - t) * (1 - t)) * 0.92;
  }

  const rNow = Math.max(2, exp.radius * 1.12 * radiusScale);

  // Palette rotation runs through whole effect; slightly slower during dissipation.
  const rotationRate = progress < growT + holdT ? 12.5 : 8.0;
  const palettePhase = elapsed * rotationRate;
  const paletteShift = Math.floor(palettePhase) % PALETTE.length;
  const paletteLerp = palettePhase - Math.floor(palettePhase);

  // Dissipation: remove transparent holes that start in dark areas and expand outward.
  let dissipationProgress = -1;
  if (progress > growT + holdT) {
    const d = (progress - (growT + holdT)) / Math.max(0.0001, dissT);
    dissipationProgress = Phaser.Math.Clamp(d, 0, 1);
  }

  const alpha = 1;

  // Pixelated sphere rendering from fixed pattern (no rim).
  const pixel = Math.max(1, Math.floor(rNow / 52));
  const minY = -Math.floor(rNow);
  const maxY = Math.floor(rNow);

  for (let oy = minY; oy <= maxY; oy += pixel) {
    const ny = oy / rNow;
    const insideY = 1 - ny * ny;
    if (insideY <= 0) {
      continue;
    }
    const half = Math.sqrt(insideY) * rNow;
    const minX = -Math.floor(half);
    const maxX = Math.floor(half);

    for (let ox = minX; ox <= maxX; ox += pixel) {
      const nx = ox / rNow;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) {
        continue;
      }

      const u = (nx + 1) * 0.5;
      const v = (ny + 1) * 0.5;
      const { px, py } = getPatternCoord(u, v);
      const baseIdx = getPatternIndex(u, v);
      const rotatedIdx = (baseIdx + paletteShift) % PALETTE.length;
      const nextIdx = (rotatedIdx + 1) % PALETTE.length;

      if (dissipationProgress >= 0) {
        const dist = DARK_DIST[py * PATTERN_SIZE + px] / Math.max(1, DARK_DIST_MAX);
        const paletteOrder = baseIdx / Math.max(1, PALETTE.length - 1); // dark first, bright last
        // Expansion from dark seeds + palette-ordered lag for bright colors.
        const cut = dissipationProgress * 1.22;
        const field = dist + paletteOrder * 0.48;
        if (field <= cut) {
          // Skip draw => transparent hole (shows true scene background).
          continue;
        }
      }

      graphics.fillStyle(mixPalette(PALETTE[rotatedIdx], PALETTE[nextIdx], paletteLerp), alpha);
      graphics.fillRect(exp.x + ox, exp.y + oy, pixel, pixel);
    }
  }
}
