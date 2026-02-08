import { useCallback, useEffect, useRef, useState } from 'react';
import { TitleScreen } from './screens/TitleScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PlayersScreen } from './screens/PlayersScreen';
import { ShopScreen } from './screens/ShopScreen';
import { BattleScreen, type BattleInputState } from './screens/BattleScreen';
import { DEFAULT_SETTINGS, type GameSettings, type MatchState, type PlayerConfig, type PlayerState, type ProjectileState, type TerrainState } from './types/game';
import { loadProfile, saveProfile } from './utils/storage';
import { buyWeapon, sellWeapon } from './game/Economy';
import { STARTER_WEAPON_ID, WEAPONS, getWeaponById } from './game/WeaponCatalog';
import { FIXED_DT, spreadAngles, stepProjectile, toVelocity } from './engine/physics/Ballistics';
import { applyRoundEnd, initMatch, nextActivePlayer, updatePlayer } from './game/MatchController';
import { addDirt, addDirtDisk, addLiquidDirt, carveCrater, settleTerrain } from './engine/terrain/TerrainDeform';
import { computeAIShot } from './engine/ai/AimAI';
import { generateTerrain } from './engine/terrain/TerrainGenerator';
import { pickRandomMtn, preloadMtnTerrains } from './engine/terrain/MtnTerrain';
import { computeExplosionDamage } from './game/Combat';
import { getWeaponRuntimeSpec } from './game/weapons/runtimeSpecs';
import { SHIELD_ITEMS, activateShieldFromInventory, autoActivateShieldAtRoundStart } from './game/Shield';

type Screen = 'title' | 'settings' | 'players' | 'shop' | 'battle' | 'matchEnd';

interface RuntimeState {
  projectiles: ProjectileState[];
  explosions: {
    id: number;
    x: number;
    y: number;
    radius: number;
    life: number;
    maxLife?: number;
    color?: string;
    kind?: 'burst' | 'simple' | 'fire' | 'laser' | 'sand' | 'funky' | 'nuke' | 'mirv' | 'funky-side' | 'fuel-pool';
    beamHeight?: number;
    seed?: number;
    paused?: boolean;
    tag?: string;
  }[];
  trails: { x1: number; y1: number; x2: number; y2: number; ownerId: string; life: number; color?: string }[];
  terrainEdits: Array<{
    mode: 'crater' | 'tunnel' | 'addDirt' | 'addDisk';
    x: number;
    y: number;
    radius: number;
    length?: number;
    amount?: number;
    deferSettle?: boolean;
    duration: number;
    elapsed: number;
    appliedSteps: number;
  }>;
  deferredSettlePending: boolean;
  funkySequence: null | {
    stage: 'collecting' | 'side-animate' | 'central';
    expectedSides: number;
    resolvedSides: number;
    sideTag: string;
    centralX: number;
    centralY: number;
    ownerId: string;
    splitDepth: number;
    effectRadius: number;
    effectDamage: number;
  };
  mirvSequence: null | {
    stage: 'collecting' | 'animating';
    expected: number;
    resolved: number;
    tag: string;
    weaponId: string;
  };
}

function makeDefaultPlayers(): PlayerConfig[] {
  return Array.from({ length: 8 }).map((_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    kind: idx < 2 ? 'human' : 'ai',
    aiLevel: 'normal',
    colorIndex: idx,
    enabled: idx < 2,
  }));
}

function pickNextWeapon(player: PlayerState, delta: number, freeFireMode = false): string {
  const available = freeFireMode
    ? WEAPONS.filter((w) => w.projectileCount > 0)
    : WEAPONS.filter((w) => w.projectileCount > 0 && (player.inventory[w.id] ?? 0) > 0);
  if (available.length === 0) {
    return player.selectedWeaponId;
  }
  const selectedIndex = available.findIndex((w) => w.id === player.selectedWeaponId);
  const index = selectedIndex >= 0 ? selectedIndex : 0;
  const next = (index + delta + available.length) % available.length;
  return available[next].id;
}

function isSolid(terrain: TerrainState, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= terrain.width || ty < 0 || ty >= terrain.height) {
    return false;
  }
  return terrain.mask[ty * terrain.width + tx] === 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const paletteScorchCache = new WeakMap<Array<[number, number, number]>, Uint8Array>();

function luminance(rgb: [number, number, number]): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function getScorchMap(palette: Array<[number, number, number]>): Uint8Array {
  const cached = paletteScorchCache.get(palette);
  if (cached) {
    return cached;
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    const current = palette[i] ?? palette[0] ?? [0, 0, 0];
    const currentLum = luminance(current);
    let best = i;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let j = 0; j < Math.min(16, palette.length); j += 1) {
      const candidate = palette[j];
      if (!candidate) {
        continue;
      }
      const lum = luminance(candidate);
      if (lum >= currentLum * 0.92) {
        continue;
      }
      const score = Math.abs(lum - currentLum * 0.65);
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    out[i] = best;
  }
  paletteScorchCache.set(palette, out);
  return out;
}

function scorchTerrain(
  terrain: TerrainState,
  cx: number,
  cy: number,
  radius: number,
  strength = 1,
): TerrainState {
  if (!terrain.colorIndices || !terrain.colorPalette || terrain.colorPalette.length === 0) {
    return terrain;
  }
  const colorIndices = new Uint8Array(terrain.colorIndices);
  const scorchMap = getScorchMap(terrain.colorPalette);
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(terrain.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(terrain.height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) {
        continue;
      }
      const idx = y * terrain.width + x;
      if (terrain.mask[idx] !== 1) {
        continue;
      }
      const influence = 1 - d2 / Math.max(1, r2);
      if (Math.random() > influence * 0.9 * strength) {
        continue;
      }
      const current = colorIndices[idx] & 0x0f;
      colorIndices[idx] = scorchMap[current];
    }
  }

  return {
    ...terrain,
    revision: terrain.revision + 1,
    colorIndices,
  };
}

function effectiveBlastRadius(weaponId: string, baseRadius: number): number {
  if (weaponId === 'baby-nuke' || weaponId === 'nuke' || weaponId === 'funky-nuke') {
    return Math.round(baseRadius * 1.12);
  }
  return baseRadius;
}

function normalizeSettings(input: GameSettings): GameSettings {
  return {
    ...input,
    gravity: clamp(Number.isFinite(input.gravity) ? input.gravity : DEFAULT_SETTINGS.gravity, 160, 420),
    roundsToWin: clamp(Number.isFinite(input.roundsToWin) ? input.roundsToWin : DEFAULT_SETTINGS.roundsToWin, 1, 9),
    cashStart: clamp(Number.isFinite(input.cashStart) ? input.cashStart : DEFAULT_SETTINGS.cashStart, 0, 500000),
    powerAdjustHz: clamp(Number.isFinite(input.powerAdjustHz) ? input.powerAdjustHz : DEFAULT_SETTINGS.powerAdjustHz, 2, 40),
    freeFireMode: Boolean(input.freeFireMode),
    tankColorTrails: input.tankColorTrails !== false,
    shotTraces: Boolean(input.shotTraces),
  };
}

function maxPowerForHp(hp: number): number {
  return clamp(Math.round(hp * 10), 0, 1000);
}

function boostShield(player: PlayerState, shieldId: 'shield' | 'medium-shield' | 'heavy-shield'): PlayerState {
  const item = SHIELD_ITEMS.find((entry) => entry.id === shieldId);
  if (!item) {
    return player;
  }
  return {
    ...player,
    shield: clamp(player.shield + item.boost, 0, 1000),
  };
}

function pushFx(
  runtime: RuntimeState,
  nextFxId: () => number,
  fx: Omit<RuntimeState['explosions'][number], 'id'>,
): void {
  runtime.explosions.push({ id: nextFxId(), ...fx });
}

function enqueueTankDeathFx(runtime: RuntimeState, player: PlayerState, nextFxId: () => number): void {
  const deathStyle = Math.floor(Math.random() * 7);

  if (deathStyle === 0) {
    pushFx(runtime, nextFxId, {
      x: player.x,
      y: player.y + 8,
      radius: 24,
      life: 1.05,
      maxLife: 1.05,
      kind: 'fire',
    });
    return;
  }

  if (deathStyle === 1) {
    pushFx(runtime, nextFxId, {
      x: player.x,
      y: player.y - 2,
      radius: 12,
      life: 0.34,
      maxLife: 0.34,
      color: '#ff9b2f',
      kind: 'simple',
      seed: Math.floor(Math.random() * 1000000),
    });
    return;
  }

  if (deathStyle === 2) {
    pushFx(runtime, nextFxId, {
      x: player.x,
      y: player.y - 2,
      radius: 60,
      life: 0.72,
      maxLife: 0.72,
      color: '#ff8c22',
      kind: 'simple',
      seed: Math.floor(Math.random() * 1000000),
    });
    return;
  }

  if (deathStyle === 3) {
    pushFx(runtime, nextFxId, {
      x: player.x,
      y: player.y - 2,
      radius: 100,
      life: 1.04,
      maxLife: 1.04,
      color: '#ff7f1a',
      kind: 'simple',
      seed: Math.floor(Math.random() * 1000000),
    });
    return;
  }

  if (deathStyle === 4) {
    pushFx(runtime, nextFxId, {
      x: player.x,
      y: player.y + 4,
      radius: 44,
      life: 0.86,
      maxLife: 0.86,
      kind: 'sand',
    });
    return;
  }

  if (deathStyle === 5) {
    pushFx(runtime, nextFxId, {
      x: player.x,
      y: player.y + 8,
      radius: 12,
      beamHeight: 200,
      life: 0.95,
      maxLife: 0.95,
      kind: 'laser',
    });
    return;
  }

  pushFx(runtime, nextFxId, {
    x: player.x,
    y: player.y - 2,
    radius: 34,
    life: 0.8,
    maxLife: 0.8,
    kind: 'funky',
  });
}

function emitWeaponImpactFx(
  runtime: RuntimeState,
  nextFxId: () => number,
  weaponId: string,
  x: number,
  y: number,
  radius: number,
  color?: string,
): void {
  if (weaponId === 'sand-bomb') {
    pushFx(runtime, nextFxId, {
      x,
      y,
      radius: Math.max(40, radius),
      life: 0.95,
      maxLife: 0.95,
      kind: 'sand',
      color: '#d8c386',
    });
    return;
  }

  if (weaponId === 'napalm' || weaponId === 'hot-napalm') {
    const blobs = weaponId === 'hot-napalm' ? 10 : 7;
    for (let i = 0; i < blobs; i += 1) {
      const a = (Math.PI * 2 * i) / blobs;
      const dist = 6 + i * (weaponId === 'hot-napalm' ? 2.4 : 1.8);
      pushFx(runtime, nextFxId, {
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * (dist * 0.45),
        radius: weaponId === 'hot-napalm' ? 18 : 14,
        life: weaponId === 'hot-napalm' ? 1.35 : 1.05,
        maxLife: weaponId === 'hot-napalm' ? 1.35 : 1.05,
        kind: 'fire',
      });
    }
    return;
  }

  if (weaponId === 'mirv' || weaponId === 'death-head') {
    pushFx(runtime, nextFxId, {
      x,
      y,
      radius: weaponId === 'death-head' ? Math.max(34, radius * 0.9) : Math.max(28, radius * 0.82),
      life: weaponId === 'death-head' ? 0.52 : 0.46,
      maxLife: weaponId === 'death-head' ? 0.52 : 0.46,
      kind: 'mirv',
      seed: Math.floor(Math.random() * 1000000),
    });
    return;
  }

  const simple = weaponId === 'missile';
  const nukeLike = weaponId === 'baby-nuke' || weaponId === 'nuke';
  pushFx(runtime, nextFxId, {
    x,
    y,
    radius,
    life: weaponId === 'nuke' ? 2.2 : weaponId === 'baby-nuke' ? 1.7 : 0.45,
    maxLife: weaponId === 'nuke' ? 2.2 : weaponId === 'baby-nuke' ? 1.7 : 0.45,
    color,
    kind: simple ? 'simple' : nukeLike ? 'nuke' : 'burst',
    seed: simple || nukeLike ? Math.floor(Math.random() * 1000000) : undefined,
  });
}

function spawnMirvChildren(parent: ProjectileState, count: number): ProjectileState[] {
  const offset = parent.weaponId === 'death-head' ? 8.5 : 6.5;
  const colors = ['#d9ff5a', '#9eff4b', '#74ff61', '#89ffbe', '#83ffd8', '#b2ff6f'];
  let speed = parent.vx - (offset * count) / 2;
  const out: ProjectileState[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: parent.x,
      y: parent.y,
      vx: speed,
      vy: -74 + Math.random() * 14 - i * 0.7,
      ownerId: parent.ownerId,
      weaponId: parent.weaponId,
      ttl: 5.6,
      projectileType: 'mirv-child',
      splitDepth: (parent.splitDepth ?? 0) + 1,
      color: colors[i % colors.length],
    });
    speed += offset;
  }
  return out;
}

function spawnFunkyChildren(parent: ProjectileState, count: number): ProjectileState[] {
  const colors = ['#ff0000', '#ff9f1a', '#ffe64d', '#00ff5a', '#00b2ff', '#354dff'];
  const out: ProjectileState[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = 20 + Math.random() * 140;
    const radians = (angle * Math.PI) / 180;
    const speed = 95 + Math.random() * 170;
    out.push({
      x: parent.x + Math.cos(radians) * 5,
      y: parent.y - Math.sin(radians) * 5,
      vx: Math.cos(radians) * speed,
      vy: -Math.sin(radians) * speed,
      ownerId: parent.ownerId,
      weaponId: parent.weaponId,
      ttl: 3.6,
      splitDepth: (parent.splitDepth ?? 0) + 1,
      projectileType: 'funky-child',
      color: colors[i % colors.length],
    });
  }
  return out;
}

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('title');
  const [settings, setSettings] = useState(normalizeSettings(DEFAULT_SETTINGS));
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(makeDefaultPlayers);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [terrain, setTerrain] = useState<TerrainState | null>(null);
  const [shopIndex, setShopIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [shieldMenuOpen, setShieldMenuOpen] = useState(false);

  const runtimeRef = useRef<RuntimeState>({
    projectiles: [],
    explosions: [],
    trails: [],
    terrainEdits: [],
    deferredSettlePending: false,
    funkySequence: null,
    mirvSequence: null,
  });
  const aiFireTimeout = useRef<number | null>(null);
  const matchRef = useRef<MatchState | null>(null);
  const terrainRef = useRef<TerrainState | null>(null);
  const nextFxIdRef = useRef(1);
  const simulationAccumulatorRef = useRef(0);
  const uiSyncAccumulatorRef = useRef(0);
  const powerTickAccumulatorRef = useRef(0);
  const angleTickAccumulatorRef = useRef(0);
  const movementTickAccumulatorRef = useRef(0);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    terrainRef.current = terrain;
  }, [terrain]);

  useEffect(() => {
    void preloadMtnTerrains().catch(() => {
      // Fallback to procedural terrain if MTN assets fail to load.
    });
  }, []);

  useEffect(() => {
    if (screen !== 'battle' || !match || match.phase !== 'aim') {
      setShieldMenuOpen(false);
      return;
    }
    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (!active || active.config.kind !== 'human') {
      setShieldMenuOpen(false);
    }
  }, [match, screen]);

  useEffect(() => {
    if (screen !== 'shop' || !match) {
      return;
    }
    if (match.players.length === 0) {
      return;
    }
    setShopIndex((idx) => clamp(idx, 0, match.players.length - 1));
  }, [screen, match]);

  const makeTerrainForRound = useCallback(async (
    width: number,
    height: number,
    preset: GameSettings['terrainPreset'],
    _playerCount: number,
  ): Promise<{ terrain: TerrainState; source: string }> => {
    if (preset === 'mtn') {
      try {
        const picked = await pickRandomMtn(width, height);
        return {
          terrain: picked.terrain,
          source: `MTN ${picked.sourceName}`,
        };
      } catch (error) {
        console.warn('MTN terrain load failed, using procedural fallback.', error);
        return {
          terrain: generateTerrain(width, height, 'rolling'),
          source: 'Procedural fallback',
        };
      }
    }
    if (preset === 'random') {
      const proceduralChoices: Array<Exclude<GameSettings['terrainPreset'], 'random' | 'mtn'>> = ['rolling', 'canyon', 'islands'];
      const useMtn = Math.random() < 0.5;
      if (useMtn) {
        try {
          const picked = await pickRandomMtn(width, height);
          return {
            terrain: picked.terrain,
            source: `MTN ${picked.sourceName}`,
          };
        } catch {
          // Fall through to procedural random selection below.
        }
      }
      const chosen = proceduralChoices[Math.floor(Math.random() * proceduralChoices.length)] ?? 'rolling';
      return {
        terrain: generateTerrain(width, height, chosen),
        source: `Procedural ${chosen}`,
      };
    }
    return {
      terrain: generateTerrain(width, height, preset),
      source: `Procedural ${preset}`,
    };
  }, []);

  const placePlayersOnTerrain = useCallback((matchIn: MatchState, terrainIn: TerrainState): { match: MatchState; terrain: TerrainState } => {
    const players = matchIn.players;
    if (players.length === 0) {
      return { match: matchIn, terrain: terrainIn };
    }

    let terrainOut = terrainIn;
    const margin = Math.max(22, Math.floor(terrainIn.width * 0.08));
    const minSep = Math.max(20, Math.floor((terrainIn.width - 2 * margin) / Math.max(2, players.length * 1.2)));
    const minX = margin;
    const maxX = Math.max(minX + 1, terrainIn.width - margin - 1);
    const isStableSpawnX = (x: number, terrainState: TerrainState): boolean => {
      const left = Math.max(0, x - 7);
      const right = Math.min(terrainState.width - 1, x + 7);
      let low = terrainState.height;
      let high = 0;
      for (let sx = left; sx <= right; sx += 1) {
        const h = terrainState.heights[sx];
        if (h < low) {
          low = h;
        }
        if (h > high) {
          high = h;
        }
      }
      if (high - low > 5) {
        return false;
      }
      const leftH = terrainState.heights[Math.max(0, x - 5)];
      const rightH = terrainState.heights[Math.min(terrainState.width - 1, x + 5)];
      return Math.abs(leftH - rightH) <= 3;
    };
    const supportCountAt = (terrainState: TerrainState, x: number, y: number): number => {
      const footY = Math.floor(y + 5);
      let count = 0;
      for (let sx = Math.max(0, x - 6); sx <= Math.min(terrainState.width - 1, x + 6); sx += 1) {
        if (isSolid(terrainState, sx, footY) || isSolid(terrainState, sx, footY + 1)) {
          count += 1;
        }
      }
      return count;
    };
    const bodyOverlapCountAt = (terrainState: TerrainState, x: number, y: number): number => {
      let count = 0;
      const minXBody = Math.max(0, x - 6);
      const maxXBody = Math.min(terrainState.width - 1, x + 6);
      const minYBody = Math.max(0, Math.floor(y - 4));
      const maxYBody = Math.min(terrainState.height - 1, Math.floor(y + 1));
      for (let sx = minXBody; sx <= maxXBody; sx += 1) {
        for (let sy = minYBody; sy <= maxYBody; sy += 1) {
          if (isSolid(terrainState, sx, sy)) {
            count += 1;
          }
        }
      }
      return count;
    };
    const solveSeatedY = (terrainState: TerrainState, x: number): number => {
      let y = terrainState.heights[x] - 4;
      for (let i = 0; i < 8; i += 1) {
        if (bodyOverlapCountAt(terrainState, x, y) <= 6) {
          break;
        }
        y -= 1;
      }
      for (let i = 0; i < 12; i += 1) {
        if (supportCountAt(terrainState, x, y) >= 4) {
          break;
        }
        y += 1;
      }
      return y;
    };

    const picks: number[] = [];
    for (let i = 0; i < players.length; i += 1) {
      let best = clamp(Math.floor(minX + Math.random() * (maxX - minX + 1)), minX, maxX);
      let found = false;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const candidate = clamp(Math.floor(minX + Math.random() * (maxX - minX + 1)), minX, maxX);
        if (!isStableSpawnX(candidate, terrainOut)) {
          continue;
        }
        if (picks.every((x) => Math.abs(x - candidate) >= minSep)) {
          best = candidate;
          found = true;
          break;
        }
        if (picks.every((x) => Math.abs(x - candidate) >= Math.max(10, Math.floor(minSep * 0.6)))) {
          best = candidate;
        }
      }
      picks.push(found ? best : best);
    }

    const nextPlayers = players.map((player, i) => {
      const x = picks[i];
      const y = solveSeatedY(terrainOut, x);
      return {
        ...player,
        x,
        y,
        fallDistance: 0,
      };
    });

    return {
      match: { ...matchIn, players: nextPlayers },
      terrain: terrainOut,
    };
  }, []);

  const fireWeapon = useCallback((sourceMatch: MatchState, shooter: PlayerState) => {
    const weapon = getWeaponById(shooter.selectedWeaponId);
    const ammo = shooter.inventory[weapon.id] ?? 0;
    const unlimitedAmmo = sourceMatch.settings.freeFireMode;
    if (!unlimitedAmmo && ammo <= 0) {
      const fallbackToBaby = (shooter.inventory[STARTER_WEAPON_ID] ?? 0) > 0
        ? STARTER_WEAPON_ID
        : pickNextWeapon(shooter, 1, sourceMatch.settings.freeFireMode);
      if (fallbackToBaby !== shooter.selectedWeaponId) {
        const updatedShooter = { ...shooter, selectedWeaponId: fallbackToBaby };
        const updatedMatch = updatePlayer(sourceMatch, updatedShooter);
        matchRef.current = updatedMatch;
        setMatch(updatedMatch);
      }
      setMessage(`${shooter.config.name} is out of ${weapon.name}`);
      return;
    }
    const consumedInventory = unlimitedAmmo ? shooter.inventory : { ...shooter.inventory, [weapon.id]: Math.max(0, ammo - 1) };
    const weaponDepleted = !unlimitedAmmo && consumedInventory[weapon.id] <= 0;
    const nextSelectedWeaponId =
      weaponDepleted && (consumedInventory[STARTER_WEAPON_ID] ?? 0) > 0 ? STARTER_WEAPON_ID : shooter.selectedWeaponId;
    const armedShooter = { ...shooter, inventory: consumedInventory, selectedWeaponId: nextSelectedWeaponId };

    if (weapon.projectileCount <= 0) {
      const batteryHeal = weapon.id === 'battery' ? 32 : 0;
      const shieldBoost =
        weapon.id === 'shield' ? 35 :
        weapon.id === 'medium-shield' ? 55 :
        weapon.id === 'heavy-shield' ? 85 : 0;
      const fuelBoost = weapon.id === 'fuel' ? 100 : 0;
      const parachuteBoost = weapon.id === 'parachute' ? 1 : 0;
      const updated = {
        ...armedShooter,
        hp: clamp(armedShooter.hp + batteryHeal, 0, 100),
        shield: clamp(armedShooter.shield + shieldBoost * 8, 0, 1000),
        fuel: clamp(armedShooter.fuel + fuelBoost, 0, 1000),
        parachutes: clamp(armedShooter.parachutes + parachuteBoost, 0, 9),
      };
      const nextMatch = nextActivePlayer(updatePlayer(sourceMatch, updated));
      matchRef.current = nextMatch;
      setMatch(nextMatch);
      setMessage(`${armedShooter.config.name} used ${weapon.name}`);
      return;
    }

    const angles = spreadAngles(armedShooter.angle, weapon.projectileCount, weapon.spreadDeg);
    const weaponSpec = getWeaponRuntimeSpec(weapon.id);
    for (const angle of angles) {
      const { vx, vy } = toVelocity(angle, armedShooter.power);
      const projectileType = weaponSpec.launchProjectileType;
      const color =
        (weapon.id === 'ton-of-dirt' || weapon.id === 'liquid-dirt') ? '#ff5b5b' :
        projectileType === 'mirv-carrier' ? '#ffe95a' :
        projectileType === 'mirv-child' ? '#8cff5a' :
        undefined;
      runtimeRef.current.projectiles.push({
        x: armedShooter.x,
        y: armedShooter.y - 4,
        vx,
        vy,
        ownerId: armedShooter.config.id,
        weaponId: weapon.id,
        ttl: 9,
        splitDepth: 0,
        projectileType,
        color,
      });
    }

    const armedMatch = { ...updatePlayer(sourceMatch, armedShooter), phase: 'projectile' as const };
    matchRef.current = armedMatch;
    setMatch(armedMatch);
    setMessage(`${armedShooter.config.name} fired ${weapon.name}`);
  }, []);

  const applyHeldAimInput = useCallback((
    currentMatch: MatchState,
    currentTerrain: TerrainState,
    input: Pick<BattleInputState, 'moveLeft' | 'moveRight' | 'alt' | 'left' | 'right' | 'up' | 'down' | 'fastUp' | 'fastDown' | 'powerSet'>,
    deltaSeconds: number,
  ): MatchState => {
    if (currentMatch.phase !== 'aim') {
      powerTickAccumulatorRef.current = 0;
      angleTickAccumulatorRef.current = 0;
      movementTickAccumulatorRef.current = 0;
      return currentMatch;
    }
    const active = currentMatch.players.find((p) => p.config.id === currentMatch.activePlayerId);
    if (!active || active.config.kind !== 'human') {
      powerTickAccumulatorRef.current = 0;
      angleTickAccumulatorRef.current = 0;
      movementTickAccumulatorRef.current = 0;
      return currentMatch;
    }

    const moveDirection = (input.moveRight ? 1 : 0) - (input.moveLeft ? 1 : 0);
    let updatedX = active.x;
    let updatedY = active.y;
    let updatedFuel = active.fuel;
    if (moveDirection !== 0 && updatedFuel > 0) {
      movementTickAccumulatorRef.current += deltaSeconds * Math.max(6, currentMatch.settings.powerAdjustHz * 0.85);
      while (movementTickAccumulatorRef.current >= 1 && updatedFuel > 0) {
        const nextX = clamp(Math.round(updatedX + moveDirection), 4, currentTerrain.width - 5);
        if (nextX === updatedX) {
          break;
        }
        updatedX = nextX;
        updatedY = currentTerrain.heights[nextX] - 4;
        updatedFuel = Math.max(0, updatedFuel - 1);
        movementTickAccumulatorRef.current -= 1;
      }
    } else {
      movementTickAccumulatorRef.current = 0;
    }

    const angleDirection = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const angleStep = input.alt && angleDirection !== 0 ? 10 : 1;
    let updatedAngle = active.angle;
    if (angleDirection !== 0) {
      angleTickAccumulatorRef.current += deltaSeconds * currentMatch.settings.powerAdjustHz;
      while (angleTickAccumulatorRef.current >= 1) {
        updatedAngle = clamp(updatedAngle + angleDirection * angleStep, 2, 178);
        angleTickAccumulatorRef.current -= 1;
      }
    } else {
      angleTickAccumulatorRef.current = 0;
    }
    if (typeof input.powerSet === 'number') {
      const setPower = clamp(input.powerSet, 0, active.maxPower);
      if (
        setPower === active.power &&
        updatedAngle === active.angle &&
        updatedX === active.x &&
        updatedY === active.y &&
        updatedFuel === active.fuel
      ) {
        return currentMatch;
      }
      return updatePlayer(currentMatch, {
        ...active,
        x: updatedX,
        y: updatedY,
        fuel: updatedFuel,
        inventory: { ...active.inventory, fuel: Math.floor(updatedFuel) },
        fallDistance: 0,
        angle: updatedAngle,
        power: setPower,
      });
    }

    const pageFastDirection = (input.fastUp ? 1 : 0) - (input.fastDown ? 1 : 0);
    const arrowDirection = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const altFastDirection = input.alt ? arrowDirection : 0;
    const powerDirection = pageFastDirection !== 0 ? pageFastDirection : (altFastDirection !== 0 ? altFastDirection : arrowDirection);
    const powerStep = pageFastDirection !== 0 || altFastDirection !== 0 ? 10 : 1;
    let updatedPower = active.power;
    if (powerDirection !== 0) {
      powerTickAccumulatorRef.current += deltaSeconds * currentMatch.settings.powerAdjustHz;
      while (powerTickAccumulatorRef.current >= 1) {
        updatedPower = clamp(updatedPower + powerDirection * powerStep, 0, active.maxPower);
        powerTickAccumulatorRef.current -= 1;
      }
    } else {
      powerTickAccumulatorRef.current = 0;
    }

    if (
      updatedAngle === active.angle &&
      updatedPower === active.power &&
      updatedX === active.x &&
      updatedY === active.y &&
      updatedFuel === active.fuel
    ) {
      return currentMatch;
    }

    const updated: PlayerState = {
      ...active,
      x: updatedX,
      y: updatedY,
      fuel: updatedFuel,
      inventory: { ...active.inventory, fuel: Math.floor(updatedFuel) },
      fallDistance: 0,
      angle: updatedAngle,
      power: updatedPower,
    };
    return updatePlayer(currentMatch, updated);
  }, []);

  const stepSimulation = useCallback((currentMatch: MatchState, currentTerrain: TerrainState) => {
    const runtime = runtimeRef.current;
    let nextTerrain = currentTerrain;
    let nextMatch = currentMatch;
    let terrainNeedsSettle = false;

    const groundPlayersToTerrain = (matchState: MatchState, terrainState: TerrainState): MatchState => ({
      ...matchState,
      players: matchState.players.map((player) => {
        if (!player.alive) {
          return player;
        }
        const x = clamp(Math.floor(player.x), 0, terrainState.width - 1);
        const groundY = terrainState.heights[x] - 4;
        // Only snap tanks downward (gravity/fall). Do not push them upward when dirt is added,
        // so ton/liquid dirt can bury a tank instead of lifting it.
        if (player.y >= groundY - 0.5) {
          return player;
        }
        return {
          ...player,
          y: groundY,
          fallDistance: 0,
        };
      }),
    });

    const enqueueTerrainEdit = (
      mode: 'crater' | 'tunnel' | 'addDirt' | 'addDisk',
      x: number,
      y: number,
      radius: number,
      duration: number,
      length?: number,
      amount?: number,
      deferSettle = false,
    ): void => {
      runtime.terrainEdits.push({
        mode,
        x,
        y,
        radius,
        length,
        amount,
        deferSettle,
        duration,
        elapsed: 0,
        appliedSteps: 0,
      });
    };

    if (runtime.terrainEdits.length > 0) {
      const nextEdits: RuntimeState['terrainEdits'] = [];
      let touchedDeferredSettle = false;
      for (const edit of runtime.terrainEdits) {
        const elapsed = edit.elapsed + FIXED_DT;
        const duration = Math.max(0.05, edit.duration);
        const progress = clamp(elapsed / duration, 0, 1);
        const totalSteps = Math.max(1, Math.round((edit.length ?? edit.radius) * 1.6));
        const targetSteps = Math.min(totalSteps, Math.max(edit.appliedSteps, Math.floor(progress * totalSteps)));
        let appliedSteps = edit.appliedSteps;

        while (appliedSteps < targetSteps) {
          const stepN = appliedSteps + 1;
          if (edit.mode === 'crater') {
            const r = Math.max(1, (edit.radius * stepN) / totalSteps);
            nextTerrain = carveCrater(nextTerrain, edit.x, edit.y, r, false);
            terrainNeedsSettle = true;
            if (edit.deferSettle) {
              touchedDeferredSettle = true;
            }
          } else if (edit.mode === 'addDirt') {
            const amt = Math.max(1, Math.round((edit.amount ?? 1) / totalSteps));
            nextTerrain = addDirt(nextTerrain, edit.x, edit.y, edit.radius, amt, false);
            terrainNeedsSettle = true;
            if (edit.deferSettle) {
              touchedDeferredSettle = true;
            }
          } else if (edit.mode === 'addDisk') {
            const r = Math.max(1, (edit.radius * stepN) / totalSteps);
            nextTerrain = addDirtDisk(nextTerrain, edit.x, edit.y, r, false);
            terrainNeedsSettle = true;
            if (edit.deferSettle) {
              touchedDeferredSettle = true;
            }
          } else {
            const len = Math.max(1, edit.length ?? 1);
            const seg = Math.floor((len * stepN) / totalSteps);
            const prevSeg = Math.floor((len * appliedSteps) / totalSteps);
            for (let i = prevSeg; i < seg; i += 1) {
              nextTerrain = carveCrater(nextTerrain, edit.x, edit.y + i * 2, edit.radius, false);
              terrainNeedsSettle = true;
              if (edit.deferSettle) {
                touchedDeferredSettle = true;
              }
            }
          }
          appliedSteps += 1;
        }

        if (progress < 1) {
          nextEdits.push({ ...edit, elapsed, appliedSteps });
        }
      }
      runtime.terrainEdits = nextEdits;
      if (touchedDeferredSettle) {
        runtime.deferredSettlePending = true;
      }
      if (runtime.terrainEdits.length === 0 && terrainNeedsSettle) {
        const hasActiveDeferredTerrainProjectile = runtime.projectiles.some(
          (p) => p.projectileType === 'digger' || p.projectileType === 'sandhog' || p.projectileType === 'mirv-child',
        );
        const waitingClusterSequence = Boolean(runtime.funkySequence || runtime.mirvSequence);
        const hasActiveNukeExplosion = runtime.explosions.some((e) => e.kind === 'nuke');
        if (runtime.deferredSettlePending) {
          if (!hasActiveDeferredTerrainProjectile && !waitingClusterSequence && !hasActiveNukeExplosion) {
            nextTerrain = settleTerrain(nextTerrain);
            runtime.deferredSettlePending = false;
          }
        } else {
          nextTerrain = settleTerrain(nextTerrain);
        }
      }

      nextMatch = groundPlayersToTerrain(nextMatch, nextTerrain);

      runtime.explosions = runtime.explosions
        .map((e) => (e.paused ? { ...e, maxLife: e.maxLife ?? e.life } : { ...e, maxLife: e.maxLife ?? e.life, life: e.life - FIXED_DT }))
        .filter((e) => e.life > 0);
      if (!currentMatch.settings.shotTraces) {
        runtime.trails = runtime.trails
          .map((t) => ({ ...t, life: t.life - FIXED_DT * 1.6 }))
          .filter((t) => t.life > 0)
          .slice(-2400);
      }

      matchRef.current = nextMatch;
      terrainRef.current = nextTerrain;
      return;
    }

    const survivors: ProjectileState[] = [];
    const spawnedProjectiles: ProjectileState[] = [];

    const applyDamageAt = (
      impactX: number,
      impactY: number,
      blastRadius: number,
      weaponDamage: number,
      splitDepth = 0,
    ): void => {
      nextMatch = {
        ...nextMatch,
        players: nextMatch.players.map((player) => {
          if (!player.alive) {
            return player;
          }
          const dist = Math.hypot(player.x - impactX, player.y - impactY);
          const secondary = runtime.explosions.slice(-12).reduce((acc, e) => {
            const d = Math.hypot(player.x - e.x, player.y - e.y);
            if (d > e.radius) {
              return acc;
            }
            return acc + ((e.radius - d) / Math.max(1, e.radius)) * 8;
          }, 0);
          const damage = computeExplosionDamage({
            dist,
            blastRadius,
            weaponDamage: splitDepth > 0 ? weaponDamage * 0.8 : weaponDamage,
            secondaryDamage: secondary,
            shield: player.shield,
            armor: player.armor,
          });
          if (damage.hpLoss <= 0) {
            return player;
          }

          const nextHp = clamp(player.hp - damage.hpLoss, 0, 100);
          if (player.alive && nextHp <= 0) {
            enqueueTankDeathFx(runtime, player, () => nextFxIdRef.current++);
          }
          return {
            ...player,
            shield: damage.nextShield,
            armor: damage.nextArmor,
            hp: nextHp,
            maxPower: maxPowerForHp(nextHp),
            power: clamp(player.power, 0, maxPowerForHp(nextHp)),
            alive: nextHp > 0,
          };
        }),
      };
    };

    for (const projectile of runtime.projectiles) {
      if (projectile.projectileType === 'delayed-blast') {
        const nextTtl = projectile.ttl - FIXED_DT;
        if (nextTtl <= 0) {
          const blastRadius = projectile.effectRadius ?? 35;
          const blastDamage = (projectile.effectDamage ?? 40) * 10;
          emitWeaponImpactFx(runtime, () => nextFxIdRef.current++, projectile.weaponId, projectile.x, projectile.y, blastRadius, projectile.color);
          enqueueTerrainEdit('crater', projectile.x, projectile.y, blastRadius, 0.35);
          applyDamageAt(projectile.x, projectile.y, blastRadius, blastDamage, projectile.splitDepth ?? 0);
        } else {
          survivors.push({ ...projectile, ttl: nextTtl });
        }
        continue;
      }

      if (projectile.projectileType === 'napalm-burn') {
        const nextTtl = projectile.ttl - FIXED_DT;
        let timer = (projectile.timer ?? 0) + FIXED_DT;
        while (timer >= 0.18) {
          applyDamageAt(
            projectile.x,
            projectile.y,
            projectile.effectRadius ?? 14,
            (projectile.effectDamage ?? 7) * 10,
            projectile.splitDepth ?? 0,
          );
          const isHotNapalm = projectile.weaponId === 'hot-napalm';
          nextTerrain = scorchTerrain(
            nextTerrain,
            projectile.x,
            projectile.y + 1,
            isHotNapalm ? 8 : 6,
            isHotNapalm ? 1.25 : 1,
          );
          timer -= 0.18;
        }
        if (Math.random() > 0.3) {
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: projectile.x + (Math.random() * 2 - 1) * 4,
            y: projectile.y - Math.random() * 6,
            radius: Math.max(7, (projectile.effectRadius ?? 14) * 0.55),
            life: 0.16,
            maxLife: 0.16,
            kind: 'fire',
          });
        }
        if (nextTtl > 0) {
          survivors.push({ ...projectile, ttl: nextTtl, timer });
        }
        continue;
      }

      if (projectile.projectileType === 'digger') {
        let x = projectile.x;
        let y = projectile.y;
        let dirX = projectile.vx;
        let dirY = projectile.vy;
        const tier =
          projectile.weaponId === 'heavy-digger' ? 'heavy' :
          projectile.weaponId === 'baby-digger' ? 'baby' : 'normal';
        const coreRadius = tier === 'heavy' ? 3.1 : tier === 'baby' ? 1.5 : 2.35;
        const sideRadius = tier === 'heavy' ? 2.2 : tier === 'baby' ? 1.1 : 1.65;
        const lateralStep = tier === 'heavy' ? 7 : tier === 'baby' ? 3 : 6;
        const lateralAltStep = tier === 'heavy' ? 5 : tier === 'baby' ? 2 : 4;
        const verticalStep = tier === 'heavy' ? 1 : tier === 'baby' ? 1 : 2;
        const loopSteps = tier === 'heavy' ? 9 : tier === 'baby' ? 4 : 7;
        const jitterX = tier === 'heavy' ? 0.2 : tier === 'baby' ? 0.42 : 0.3;
        const jitterY = tier === 'heavy' ? 0.1 : tier === 'baby' ? 0.24 : 0.18;
        if (Math.abs(dirX) + Math.abs(dirY) < 0.001) {
          const seed = projectile.seed ?? 0;
          const a = (seed * 0.73) % (Math.PI * 2);
          dirX = Math.cos(a) * 1.2;
          dirY = Math.sin(a) * 0.25;
        }
        const sideSign = dirX >= 0 ? 1 : -1;
        const maxDownFromHorizontal = (tier === 'heavy' ? 0.95 : 1.08);
        const sampleDownwardSector = (sign: number): number => (
          sign >= 0
            ? Math.random() * maxDownFromHorizontal
            : Math.PI - Math.random() * maxDownFromHorizontal
        );

        for (let i = 0; i < loopSteps; i += 1) {
          // Randomize heading inside the side-specific downward sector (horizontal -> straight down).
          const targetA = sampleDownwardSector(sideSign);
          const targetX = Math.cos(targetA);
          const targetY = Math.sin(targetA);
          const blend = Math.random() < 0.55 ? 0.7 : 0.5;
          dirX = dirX * blend + targetX * (1.25 - blend) + (Math.random() * 2 - 1) * jitterX;
          dirY = dirY * blend + targetY * (1.25 - blend) + (Math.random() * 2 - 1) * jitterY;
          if (dirY < 0) {
            dirY *= -0.35;
          }
          const deepThreshold = nextTerrain.height * 0.7;
          if (y > deepThreshold) {
            dirY *= 0.35;
            dirY -= 0.12 + Math.random() * 0.18;
          }
          const mag = Math.max(0.001, Math.hypot(dirX, dirY));
          const speed = Math.random() < 0.6 ? lateralStep : lateralAltStep;
          let stepX = Math.round((dirX / mag) * speed);
          let stepY = Math.round((dirY / mag) * speed);
          const minDown = tier === 'heavy' ? 1 : 0;
          if (stepY < minDown) {
            stepY = minDown;
          }
          stepY += Math.random() < 0.16 ? verticalStep : 0;
          if (stepX === 0 && stepY === 0) {
            stepX = sideSign;
          }
          x = clamp(x + stepX, 1, nextTerrain.width - 2);
          y = clamp(y + stepY, 1, nextTerrain.height - 2);
          nextTerrain = carveCrater(nextTerrain, x, y, coreRadius, false);
          terrainNeedsSettle = true;
          runtime.deferredSettlePending = true;
          if (i % 2 === 0) {
            nextTerrain = carveCrater(nextTerrain, clamp(x + Math.sign(stepX), 1, nextTerrain.width - 2), y, sideRadius, false);
            terrainNeedsSettle = true;
          }
          runtime.trails.push({
            x1: x,
            y1: y,
            x2: x + (Math.random() * 2 - 1),
            y2: y + (Math.random() * 2 - 1),
            ownerId: projectile.ownerId,
            life: tier === 'heavy' ? 0.16 : tier === 'baby' ? 0.1 : 0.14,
            color: '#d8c38d',
          });
        }
        const nextTtl = projectile.ttl - FIXED_DT;
        const runawayDepthCutoff = nextTerrain.height * 0.86;
        if (nextTtl > 0 && y < runawayDepthCutoff) {
          survivors.push({ ...projectile, x, y, vx: dirX, vy: dirY, ttl: nextTtl });
        }
        continue;
      }

      if (projectile.projectileType === 'sandhog') {
        let x = projectile.x;
        let y = projectile.y;
        let dirX = projectile.vx;
        let dirY = projectile.vy;
        let segmentStepsLeft = projectile.state ?? 0;
        const hogTier =
          projectile.weaponId === 'heavy-sandhog' ? 'heavy' :
          projectile.weaponId === 'baby-sandhog' ? 'baby' : 'normal';
        const loopCount = hogTier === 'heavy' ? 12 : hogTier === 'baby' ? 8 : 10;
        const stepFast = hogTier === 'heavy' ? 7 : hogTier === 'baby' ? 4 : 6;
        const stepSlow = hogTier === 'heavy' ? 5 : hogTier === 'baby' ? 3 : 4;
        const coreRadius = hogTier === 'heavy' ? 2.2 : hogTier === 'baby' ? 1.55 : 1.9;
        const sideBlastRadius = hogTier === 'heavy' ? 5.2 : hogTier === 'baby' ? 3.8 : 4.6;
        if (Math.abs(dirX) + Math.abs(dirY) < 0.001) {
          dirX = Math.random() < 0.5 ? -1 : 1;
          dirY = 0.35;
        }

        const findSolidNear = (sx: number, sy: number): { x: number; y: number } | null => {
          const baseX = clamp(Math.round(sx), 1, nextTerrain.width - 2);
          const baseY = clamp(Math.round(sy), 1, nextTerrain.height - 2);
          if (isSolid(nextTerrain, baseX, baseY)) {
            return { x: baseX, y: baseY };
          }
          for (let dy = 1; dy <= 14; dy += 1) {
            const yy = clamp(baseY + dy, 1, nextTerrain.height - 2);
            if (isSolid(nextTerrain, baseX, yy)) {
              return { x: baseX, y: yy };
            }
            for (let dx = 1; dx <= 5; dx += 1) {
              const xl = clamp(baseX - dx, 1, nextTerrain.width - 2);
              const xr = clamp(baseX + dx, 1, nextTerrain.width - 2);
              if (isSolid(nextTerrain, xl, yy)) {
                return { x: xl, y: yy };
              }
              if (isSolid(nextTerrain, xr, yy)) {
                return { x: xr, y: yy };
              }
            }
          }
          return null;
        };

        for (let i = 0; i < loopCount; i += 1) {
          // Keep straight segments for a while, then turn sharply for boxy/angular tunnels.
          if (segmentStepsLeft <= 0) {
            const turn = Math.random();
            const angle = Math.atan2(dirY, dirX);
            let nextAngle = angle;
            if (turn < 0.45) {
              nextAngle = angle + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 4);
            } else if (turn < 0.78) {
              nextAngle = angle + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
            } else if (turn < 0.9) {
              nextAngle = angle + (Math.random() < 0.5 ? 1 : -1) * ((3 * Math.PI) / 4);
            }
            dirX = Math.cos(nextAngle);
            dirY = Math.sin(nextAngle);
            segmentStepsLeft = 7 + Math.floor(Math.random() * 10);
          }

          const mag = Math.max(0.001, Math.hypot(dirX, dirY));
          const stepX = Math.round((dirX / mag) * (Math.random() < 0.68 ? stepFast : stepSlow));
          const stepY = Math.round((dirY / mag) * (Math.random() < 0.62 ? stepFast - 1 : stepSlow));
          const candidateX = clamp(x + stepX, 1, nextTerrain.width - 2);
          const candidateY = clamp(y + stepY, 1, nextTerrain.height - 2);
          const solidPoint = findSolidNear(candidateX, candidateY);
          if (!solidPoint) {
            dirY = Math.abs(dirY) + 0.35;
            segmentStepsLeft = 0;
            continue;
          }
          x = solidPoint.x;
          y = solidPoint.y;

          // Core tunnel with immediate carving (faster and lower overhead than queued micro-edits).
          nextTerrain = carveCrater(nextTerrain, x, y, coreRadius, false);
          terrainNeedsSettle = true;
          runtime.deferredSettlePending = true;

          if (i % 2 === 0) {
            const nMag = Math.max(0.001, Math.hypot(stepX, stepY));
            const nx = -stepY / nMag;
            const ny = stepX / nMag;
            const side = Math.random() < 0.5 ? -1 : 1;
            const crackLen = 6 + Math.floor(Math.random() * (hogTier === 'heavy' ? 5 : 4));
            for (let k = 1; k <= crackLen; k += 1) {
              const cx = clamp(Math.round(x + nx * side * k), 1, nextTerrain.width - 2);
              const cy = clamp(Math.round(y + ny * side * k), 1, nextTerrain.height - 2);
              if (isSolid(nextTerrain, cx, cy)) {
                nextTerrain = carveCrater(nextTerrain, cx, cy, hogTier === 'baby' ? 1.2 : 1.5, false);
                terrainNeedsSettle = true;
              }
            }
          }

          if (i % 3 === 0 && Math.random() < 0.72) {
            nextTerrain = carveCrater(nextTerrain, x, y, sideBlastRadius, false);
            terrainNeedsSettle = true;
            pushFx(runtime, () => nextFxIdRef.current++, {
              x: x + (Math.random() * 2 - 1) * 2,
              y: y + (Math.random() * 2 - 1) * 2,
              radius: 4,
              life: 0.1,
              maxLife: 0.1,
              kind: 'simple',
              color: '#e6c47a',
            });
          }
          if (i % 2 === 0) {
            runtime.trails.push({
              x1: x,
              y1: y,
              x2: x + (Math.random() * 2 - 1),
              y2: y + (Math.random() * 2 - 1),
              ownerId: projectile.ownerId,
              life: 0.16,
              color: '#f0cf87',
            });
          }
          segmentStepsLeft -= 1;

          // Bounce off borders to keep tunneling through the map.
          if (x <= 2 || x >= nextTerrain.width - 3) {
            dirX *= -1;
            segmentStepsLeft = Math.min(segmentStepsLeft, 2);
          }
          if (y <= 2) {
            dirY = Math.abs(dirY) + 0.35;
            segmentStepsLeft = Math.min(segmentStepsLeft, 1);
          } else if (y >= nextTerrain.height - 3) {
            dirY = -Math.abs(dirY);
            segmentStepsLeft = Math.min(segmentStepsLeft, 2);
          }
        }
        const nextTtl = projectile.ttl - FIXED_DT;
        if (nextTtl > 0) {
          survivors.push({ ...projectile, x, y, vx: dirX, vy: dirY, state: segmentStepsLeft, ttl: nextTtl });
        }
        continue;
      }

      if (projectile.projectileType === 'roller') {
        let dir = projectile.direction ?? (projectile.vx >= 0 ? 1 : -1);
        const currentX = clamp(Math.round(projectile.x), 2, nextTerrain.width - 3);
        const currentY = nextTerrain.heights[currentX] - 3;
        let x = currentX;
        let y = currentY;
        let stable = false;

        const tryRollDirection = (fromX: number, fromY: number, tryDir: number): { ok: boolean; x: number; y: number } => {
          const stepX = clamp(Math.round(fromX + tryDir), 2, nextTerrain.width - 3);
          const stepY = nextTerrain.heights[stepX] - 3;
          const downhillOrFlat = stepY >= fromY - 0.2;
          return { ok: downhillOrFlat, x: stepX, y: stepY };
        };

        const primary = tryRollDirection(currentX, currentY, dir);
        if (primary.ok) {
          x = primary.x;
          y = primary.y;
          stable = true;
        }
        const hitPlayer = nextMatch.players.find(
          (player) =>
            player.alive &&
            player.config.id !== projectile.ownerId &&
            Math.abs(player.x - x) < 7 &&
            Math.abs(player.y - y) < 6,
        );

        runtime.trails.push({
          x1: projectile.x,
          y1: projectile.y,
          x2: x,
          y2: y,
          ownerId: projectile.ownerId,
          life: 0.35,
          color: '#eeeeee',
        });

        const nextTtl = projectile.ttl - FIXED_DT;
        if (!stable || hitPlayer || nextTtl <= 0) {
          const weapon = getWeaponById(projectile.weaponId);
          emitWeaponImpactFx(runtime, () => nextFxIdRef.current++, weapon.id, x, y, weapon.blastRadius, projectile.color);
          enqueueTerrainEdit('crater', x, y, weapon.blastRadius, 0.35);
          applyDamageAt(x, y, weapon.blastRadius, weapon.damage * 10, projectile.splitDepth ?? 0);
        } else {
          survivors.push({ ...projectile, x, y, direction: dir, ttl: nextTtl });
        }
        continue;
      }

      let p = projectile;
      let collided = false;
      const subStepCount = 4;
      const projectileTimeScale = 2.2;
      const subDt = FIXED_DT / subStepCount;

      for (let s = 0; s < subStepCount; s += 1) {
        const before = p;
        p = stepProjectile(p, subDt * projectileTimeScale, currentMatch.settings.gravity, currentMatch.wind);
        runtime.trails.push({
          x1: before.x,
          y1: before.y,
          x2: p.x,
          y2: p.y,
          ownerId: p.ownerId,
          life: 0.85,
          color: p.color,
        });

        if (p.projectileType === 'mirv-carrier' && before.vy < 0 && p.vy >= 0) {
          const spec = getWeaponRuntimeSpec(p.weaponId);
          const expected = spec.mirvChildCount ?? 5;
          runtime.mirvSequence = {
            stage: 'collecting',
            expected,
            resolved: 0,
            tag: `mirv-${nextFxIdRef.current++}`,
            weaponId: p.weaponId,
          };
          runtime.deferredSettlePending = true;
          spawnedProjectiles.push(...spawnMirvChildren(p, spec.mirvChildCount ?? 5));
          collided = true;
          break;
        }

        const skyOverflowLimit = currentTerrain.height * 0.5;
        const outOfBounds = p.x < 0
          || p.x >= currentTerrain.width
          || p.y < -skyOverflowLimit
          || p.y >= currentTerrain.height;
        let forcedBoundaryImpact = false;
        if (outOfBounds) {
          p = {
            ...p,
            x: clamp(p.x, 0, currentTerrain.width - 1),
            y: clamp(p.y, 0, currentTerrain.height - 1),
          };
          forcedBoundaryImpact = true;
        }

        const hitTerrain = forcedBoundaryImpact || isSolid(nextTerrain, p.x, p.y);
        const hitPlayer = nextMatch.players.find(
          (player) =>
            player.alive &&
            player.config.id !== p.ownerId &&
            Math.abs(player.x - p.x) < 6 &&
            Math.abs(player.y - p.y) < 5,
        );
        if (!hitTerrain && !hitPlayer) {
          continue;
        }

        const weapon = getWeaponById(p.weaponId);
        const impactX = clamp(p.x, 0, currentTerrain.width - 1);
        const impactY = clamp(p.y, 0, currentTerrain.height - 1);

        const weaponSpec = getWeaponRuntimeSpec(weapon.id);

        if (weaponSpec.impactMode === 'mirv' && p.projectileType === 'mirv-carrier') {
          const expected = weaponSpec.mirvChildCount ?? 5;
          runtime.mirvSequence = {
            stage: 'collecting',
            expected,
            resolved: 0,
            tag: `mirv-${nextFxIdRef.current++}`,
            weaponId: weapon.id,
          };
          runtime.deferredSettlePending = true;
          spawnedProjectiles.push(...spawnMirvChildren({ ...p, x: impactX, y: impactY }, weaponSpec.mirvChildCount ?? 5));
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'roller') {
          spawnedProjectiles.push({
            x: impactX,
            y: impactY,
            vx: p.vx,
            vy: 0,
            ownerId: p.ownerId,
            weaponId: weapon.id,
            ttl: weaponSpec.rollerTtl ?? 3,
            splitDepth: p.splitDepth,
            projectileType: 'roller',
            direction: p.vx < 0 ? -1 : 1,
            state: 0,
          });
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 7,
            life: 0.14,
            maxLife: 0.14,
            kind: 'burst',
            color: '#d9d9d9',
          });
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'digger') {
          const duration = weaponSpec.diggerDuration ?? 2;
          const diggerCount =
            weapon.id === 'baby-digger' ? 2 :
            weapon.id === 'heavy-digger' ? 4 : 3;
          for (let i = 0; i < diggerCount; i += 1) {
            const spread = (i - (diggerCount - 1) / 2) * 0.18;
            spawnedProjectiles.push({
              x: impactX,
              y: impactY,
              vx: p.vx * (0.9 + i * 0.08) + spread * 18,
              vy: p.vy * (0.34 + i * 0.035) + Math.abs(spread) * 7,
              ownerId: p.ownerId,
              weaponId: weapon.id,
              ttl: duration * (0.8 + (i + 1) / (diggerCount + 1) * 0.65),
              projectileType: 'digger',
              seed: i,
            });
          }
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 10,
            life: 0.2,
            maxLife: 0.2,
            kind: 'sand',
            color: '#cfba88',
          });
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'sandhog') {
          const duration = weaponSpec.sandhogDuration ?? 1.5;
          spawnedProjectiles.push({
            x: impactX,
            y: impactY,
            vx: p.vx * 1.15,
            vy: p.vy * 0.82,
            ownerId: p.ownerId,
            weaponId: weapon.id,
            ttl: duration,
            projectileType: 'sandhog',
            seed: 1,
          });
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 12,
            life: 0.2,
            maxLife: 0.2,
            kind: 'sand',
            color: '#d9bc7c',
          });
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'funky' && (p.splitDepth ?? 0) === 0) {
          const count = weaponSpec.funkyChildCount ?? 6;
          const sideTag = `funky-side-${nextFxIdRef.current++}`;
          spawnedProjectiles.push(...spawnFunkyChildren({ ...p, x: impactX, y: impactY }, count));
          runtime.funkySequence = {
            stage: 'collecting',
            expectedSides: count,
            resolvedSides: 0,
            sideTag,
            centralX: impactX,
            centralY: impactY,
            ownerId: p.ownerId,
            splitDepth: p.splitDepth ?? 0,
            effectRadius: weapon.blastRadius,
            effectDamage: weapon.damage,
          };
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 12,
            life: 0.18,
            maxLife: 0.18,
            kind: 'funky',
            color: '#ff8d3f',
          });
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'sand') {
          enqueueTerrainEdit('addDirt', impactX, impactY, 46, 0.55, undefined, 22);
          emitWeaponImpactFx(runtime, () => nextFxIdRef.current++, weapon.id, impactX, impactY, 45, '#d8c386');
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'dirt') {
          enqueueTerrainEdit('addDisk', impactX, impactY, 112, 0.72, undefined, undefined, true);
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 94,
            life: 0.88,
            maxLife: 0.88,
            kind: 'sand',
            color: '#d8bf86',
          });
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'liquid') {
          nextTerrain = addLiquidDirt(nextTerrain, impactX, impactY, 140, 9000, false);
          runtime.deferredSettlePending = true;
          terrainNeedsSettle = true;
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 84,
            life: 0.78,
            maxLife: 0.78,
            kind: 'sand',
            color: '#d7bb81',
          });
          collided = true;
          break;
        }

        if (weaponSpec.impactMode === 'napalm') {
          const drops = weaponSpec.napalmDrops ?? 12;
          const isHotNapalm = weapon.id === 'hot-napalm';
          const poolPatches = isHotNapalm ? 5 : 3;
          for (let i = 0; i < poolPatches; i += 1) {
            const px = impactX + (Math.random() * 2 - 1) * (8 + i * 10);
            const tx = clamp(Math.round(px), 2, nextTerrain.width - 3);
            const ty = nextTerrain.heights[tx] - 2;
            pushFx(runtime, () => nextFxIdRef.current++, {
              x: tx,
              y: ty,
              radius: isHotNapalm ? 6 + Math.random() * 3 : 4 + Math.random() * 2,
              life: isHotNapalm ? 1.1 : 0.8,
              maxLife: isHotNapalm ? 1.1 : 0.8,
              kind: 'fuel-pool',
              color: isHotNapalm ? '#ff8b2b' : '#ffae4a',
            });
            nextTerrain = scorchTerrain(nextTerrain, tx, ty + 1, isHotNapalm ? 15 : 11, isHotNapalm ? 1.2 : 1);
          }
          for (let i = 0; i < drops; i += 1) {
            const a = (Math.PI * 2 * i) / drops;
            const dx = Math.cos(a) * (8 + i * 1.1);
            const tx = clamp(Math.round(impactX + dx), 2, nextTerrain.width - 3);
            const ty = nextTerrain.heights[tx] - 3;
            spawnedProjectiles.push({
              x: tx,
              y: ty,
              vx: 0,
              vy: 0,
              ownerId: p.ownerId,
              weaponId: weapon.id,
              ttl: weaponSpec.napalmTtl ?? 2.8,
              projectileType: 'napalm-burn',
              effectRadius: weaponSpec.napalmRadius ?? 14,
              effectDamage: weaponSpec.napalmDamage ?? 7,
            });
          }
          emitWeaponImpactFx(runtime, () => nextFxIdRef.current++, weapon.id, impactX, impactY, weapon.blastRadius, '#ffc933');
          nextTerrain = scorchTerrain(nextTerrain, impactX, impactY, Math.max(10, weapon.blastRadius * 0.6), isHotNapalm ? 1.35 : 1.05);
          applyDamageAt(impactX, impactY, Math.max(12, weapon.blastRadius * 0.55), weapon.damage * 6, p.splitDepth ?? 0);
          collided = true;
          break;
        }

        const blastRadius =
          p.projectileType === 'funky-child' ? 30 :
          p.projectileType === 'mirv-child' ? effectiveBlastRadius(weapon.id, weapon.blastRadius) :
          effectiveBlastRadius(weapon.id, weapon.blastRadius);
        const blastDamage = p.projectileType === 'funky-child' ? 260 : weapon.damage * 10;

        if (p.projectileType === 'mirv-child') {
          enqueueTerrainEdit('crater', impactX, impactY, blastRadius, 0.35, undefined, undefined, true);
        } else if (weapon.terrainEffect === 'tunnel') {
          enqueueTerrainEdit('tunnel', impactX, impactY, Math.max(3, blastRadius * 0.2), 0.55, 9);
        } else if (weapon.terrainEffect === 'crater') {
          const deferSettleForNukeFx = weapon.id === 'baby-nuke' || weapon.id === 'nuke';
          enqueueTerrainEdit('crater', impactX, impactY, blastRadius, 0.35, undefined, undefined, deferSettleForNukeFx);
        }
        if (p.projectileType === 'funky-child' && runtime.funkySequence) {
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: 28,
            life: 0.5,
            maxLife: 0.5,
            kind: 'funky-side',
            paused: runtime.funkySequence.stage === 'collecting',
            tag: runtime.funkySequence.sideTag,
          });
        } else if (p.projectileType === 'mirv-child' && runtime.mirvSequence) {
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: impactX,
            y: impactY,
            radius: Math.max(22, blastRadius),
            life: weapon.id === 'death-head' ? 0.62 : 0.48,
            maxLife: weapon.id === 'death-head' ? 0.62 : 0.48,
            kind: 'mirv',
            paused: runtime.mirvSequence.stage === 'collecting',
            tag: runtime.mirvSequence.tag,
            seed: Math.floor(Math.random() * 1000000),
          });
        } else {
          emitWeaponImpactFx(runtime, () => nextFxIdRef.current++, weapon.id, impactX, impactY, blastRadius, p.color);
        }
        applyDamageAt(impactX, impactY, blastRadius, blastDamage, p.splitDepth ?? 0);

        collided = true;
        break;
      }

      if (!collided && p.ttl > 0) {
        survivors.push(p);
      } else if (collided && projectile.projectileType === 'funky-child' && runtime.funkySequence) {
        runtime.funkySequence.resolvedSides += 1;
      } else if (!collided && p.ttl <= 0 && projectile.projectileType === 'funky-child' && runtime.funkySequence) {
        const impactX = clamp(p.x, 0, currentTerrain.width - 1);
        const impactY = clamp(p.y, 0, currentTerrain.height - 1);
        const blastRadius = 30;
        const blastDamage = 260;
        enqueueTerrainEdit('crater', impactX, impactY, blastRadius, 0.35);
        pushFx(runtime, () => nextFxIdRef.current++, {
          x: impactX,
          y: impactY,
          radius: 28,
          life: 0.5,
          maxLife: 0.5,
          kind: 'funky-side',
          paused: runtime.funkySequence.stage === 'collecting',
          tag: runtime.funkySequence.sideTag,
        });
        applyDamageAt(impactX, impactY, blastRadius, blastDamage, p.splitDepth ?? 0);
        runtime.funkySequence.resolvedSides += 1;
      } else if (collided && projectile.projectileType === 'mirv-child' && runtime.mirvSequence) {
        runtime.mirvSequence.resolved += 1;
      } else if (!collided && p.ttl <= 0 && projectile.projectileType === 'mirv-child' && runtime.mirvSequence) {
        const impactX = clamp(p.x, 0, currentTerrain.width - 1);
        const impactY = clamp(p.y, 0, currentTerrain.height - 1);
        const weapon = getWeaponById(p.weaponId);
        const blastRadius = effectiveBlastRadius(weapon.id, weapon.blastRadius);
        enqueueTerrainEdit('crater', impactX, impactY, blastRadius, 0.35, undefined, undefined, true);
        pushFx(runtime, () => nextFxIdRef.current++, {
          x: impactX,
          y: impactY,
          radius: Math.max(22, blastRadius),
          life: weapon.id === 'death-head' ? 0.62 : 0.48,
          maxLife: weapon.id === 'death-head' ? 0.62 : 0.48,
          kind: 'mirv',
          paused: runtime.mirvSequence.stage === 'collecting',
          tag: runtime.mirvSequence.tag,
          seed: Math.floor(Math.random() * 1000000),
        });
        applyDamageAt(impactX, impactY, blastRadius, weapon.damage * 10, p.splitDepth ?? 0);
        runtime.mirvSequence.resolved += 1;
      }
    }

    runtime.projectiles = [...survivors, ...spawnedProjectiles];
    if (terrainNeedsSettle && runtime.projectiles.length === 0 && runtime.terrainEdits.length === 0 && !runtime.deferredSettlePending) {
      nextTerrain = settleTerrain(nextTerrain);
      nextMatch = groundPlayersToTerrain(nextMatch, nextTerrain);
    }
    if (
      runtime.deferredSettlePending
      && runtime.projectiles.every((p) => p.projectileType !== 'digger' && p.projectileType !== 'sandhog' && p.projectileType !== 'mirv-child')
      && !runtime.funkySequence
      && !runtime.mirvSequence
      && !runtime.explosions.some((e) => e.kind === 'nuke')
      && runtime.terrainEdits.length === 0
    ) {
      nextTerrain = settleTerrain(nextTerrain);
      runtime.deferredSettlePending = false;
      nextMatch = groundPlayersToTerrain(nextMatch, nextTerrain);
    }
    runtime.explosions = runtime.explosions
      .map((e) => (e.paused ? { ...e, maxLife: e.maxLife ?? e.life } : { ...e, maxLife: e.maxLife ?? e.life, life: e.life - FIXED_DT }))
      .filter((e) => e.life > 0);
    if (!currentMatch.settings.shotTraces) {
      runtime.trails = runtime.trails
        .map((t) => ({ ...t, life: t.life - FIXED_DT * 1.6 }))
        .filter((t) => t.life > 0)
        .slice(-2400);
    }

    if (runtime.funkySequence) {
      if (runtime.funkySequence.stage === 'collecting') {
        const allResolved = runtime.funkySequence.resolvedSides >= runtime.funkySequence.expectedSides;
        if (allResolved) {
          runtime.funkySequence.stage = 'side-animate';
          runtime.explosions = runtime.explosions.map((e) =>
            e.tag === runtime.funkySequence?.sideTag ? { ...e, paused: false } : e,
          );
        }
      } else if (runtime.funkySequence.stage === 'side-animate') {
        const activeSides = runtime.explosions.some((e) => e.tag === runtime.funkySequence?.sideTag && e.kind === 'funky-side');
        if (!activeSides) {
          const seq = runtime.funkySequence;
          runtime.funkySequence = { ...seq, stage: 'central' };
          const baby = getWeaponById('baby-nuke');
          const centralRadius = effectiveBlastRadius('baby-nuke', baby.blastRadius);
          pushFx(runtime, () => nextFxIdRef.current++, {
            x: seq.centralX,
            y: seq.centralY,
            radius: centralRadius,
            life: 1.7,
            maxLife: 1.7,
            kind: 'nuke',
            seed: Math.floor(Math.random() * 1000000),
            tag: 'funky-central',
          });
          enqueueTerrainEdit('crater', seq.centralX, seq.centralY, centralRadius, 0.62);
          applyDamageAt(seq.centralX, seq.centralY, seq.effectRadius, seq.effectDamage * 10, seq.splitDepth ?? 0);
        }
      } else {
        const hasCentral = runtime.explosions.some((e) => e.tag === 'funky-central');
        if (!hasCentral) {
          if (runtime.terrainEdits.length === 0) {
            nextTerrain = settleTerrain(nextTerrain);
            runtime.deferredSettlePending = false;
            nextMatch = groundPlayersToTerrain(nextMatch, nextTerrain);
          }
          runtime.funkySequence = null;
        }
      }
    }

    if (runtime.mirvSequence) {
      if (runtime.mirvSequence.stage === 'collecting') {
        const allResolved = runtime.mirvSequence.resolved >= runtime.mirvSequence.expected;
        if (allResolved) {
          runtime.mirvSequence.stage = 'animating';
          runtime.explosions = runtime.explosions.map((e) =>
            e.tag === runtime.mirvSequence?.tag ? { ...e, paused: false } : e,
          );
        }
      } else {
        const activeMirvBursts = runtime.explosions.some((e) => e.tag === runtime.mirvSequence?.tag && e.kind === 'mirv');
        if (!activeMirvBursts) {
          if (runtime.terrainEdits.length === 0) {
            nextTerrain = settleTerrain(nextTerrain);
            runtime.deferredSettlePending = false;
            nextMatch = groundPlayersToTerrain(nextMatch, nextTerrain);
          }
          runtime.mirvSequence = null;
        }
      }
    }

    if (runtime.terrainEdits.length > 0) {
      matchRef.current = nextMatch;
      terrainRef.current = nextTerrain;
      return;
    }

    nextMatch = {
      ...nextMatch,
      players: nextMatch.players.map((player) => {
        if (!player.alive) {
          return player;
        }
        const x = clamp(Math.floor(player.x), 0, nextTerrain.width - 1);
        const groundY = nextTerrain.heights[x] - 4;
        const fallDist = groundY - player.y;
        if (fallDist <= 0) {
          if (player.fallDistance === 0) {
            return player;
          }
          const hadChute = player.parachutes > 0;
          const shouldConsumeChute = hadChute && player.fallDistance > 16;
          const effectiveFall = hadChute ? player.fallDistance * 0.25 : player.fallDistance;
          const landingDamage = Math.max(0, effectiveFall - 8) * 0.32;
          const hpAfterLanding = clamp(player.hp - landingDamage, 0, 100);
          if (player.alive && hpAfterLanding <= 0) {
            enqueueTankDeathFx(runtime, player, () => nextFxIdRef.current++);
          }
          return {
            ...player,
            y: groundY,
            hp: hpAfterLanding,
            maxPower: maxPowerForHp(hpAfterLanding),
            power: clamp(player.power, 0, maxPowerForHp(hpAfterLanding)),
            alive: hpAfterLanding > 0,
            parachutes: shouldConsumeChute ? Math.max(0, player.parachutes - 1) : player.parachutes,
            fallDistance: 0,
          };
        }

        const usingParachute = player.parachutes > 0 && player.fallDistance + fallDist > 18;
        const verticalSpeed = usingParachute ? 62 : 260;
        const step = Math.min(fallDist, verticalSpeed * FIXED_DT);
        const nextY = player.y + step;
        const nextFallDistance = player.fallDistance + step;
        if (nextY >= groundY) {
          const shouldConsumeChute = usingParachute;
          const effectiveFall = usingParachute ? nextFallDistance * 0.25 : nextFallDistance;
          const landingDamage = Math.max(0, effectiveFall - 8) * 0.32;
          const hpAfterLanding = clamp(player.hp - landingDamage, 0, 100);
          if (player.alive && hpAfterLanding <= 0) {
            enqueueTankDeathFx(runtime, player, () => nextFxIdRef.current++);
          }
          return {
            ...player,
            y: groundY,
            hp: hpAfterLanding,
            maxPower: maxPowerForHp(hpAfterLanding),
            power: clamp(player.power, 0, maxPowerForHp(hpAfterLanding)),
            alive: hpAfterLanding > 0,
            parachutes: shouldConsumeChute ? Math.max(0, player.parachutes - 1) : player.parachutes,
            fallDistance: 0,
          };
        }
        return {
          ...player,
          y: nextY,
          fallDistance: nextFallDistance,
        };
      }),
    };

    const alive = nextMatch.players.filter((p) => p.alive);
    if (alive.length <= 1) {
      if (alive.length === 1) {
        setMessage(`${alive[0].config.name} wins round ${nextMatch.roundIndex}`);
      } else {
        setMessage('Round draw');
      }
      const postRound = applyRoundEnd({ ...nextMatch, phase: 'roundEnd' });
      if (postRound.phase === 'matchEnd') {
        const winner = postRound.players.reduce((best, p) => (p.score > best.score ? p : best), postRound.players[0]);
        setWinnerName(winner.config.name);
        matchRef.current = postRound;
        terrainRef.current = nextTerrain;
        setMatch(postRound);
        setTerrain(nextTerrain);
        setScreen('matchEnd');
      } else {
        void (async () => {
          const generated = await makeTerrainForRound(
            postRound.width,
            postRound.height,
            postRound.settings.terrainPreset,
            postRound.players.length,
          );
          const regenerated = generated.terrain;
          const placed = placePlayersOnTerrain(postRound, regenerated);
          const reseated = placed.match;
          runtimeRef.current = {
            projectiles: [],
            explosions: [],
            trails: [],
            terrainEdits: [],
            deferredSettlePending: false,
            funkySequence: null,
            mirvSequence: null,
          };
          matchRef.current = reseated;
          terrainRef.current = placed.terrain;
          setMatch(reseated);
          setTerrain(placed.terrain);
          setShopIndex(0);
          setScreen('shop');
        })();
      }
      return;
    }

    const hasAirbornePlayers = nextMatch.players.some((player) => {
      if (!player.alive) {
        return false;
      }
      const x = clamp(Math.floor(player.x), 0, nextTerrain.width - 1);
      const groundY = nextTerrain.heights[x] - 4;
      return groundY - player.y > 0.75;
    });

    if (runtime.projectiles.length === 0 && currentMatch.phase === 'projectile' && !hasAirbornePlayers && !runtime.funkySequence && !runtime.mirvSequence) {
      nextMatch = nextActivePlayer({ ...nextMatch, phase: 'resolve' });
    }

    matchRef.current = nextMatch;
    terrainRef.current = nextTerrain;
  }, [makeTerrainForRound, placePlayersOnTerrain]);

  useEffect(() => {
    if (!match || !terrain || screen !== 'battle') {
      return;
    }
    const active = match.players.find((p) => p.config.id === match.activePlayerId);
    if (!active || active.config.kind !== 'ai' || match.phase !== 'aim') {
      return;
    }

    if (aiFireTimeout.current) {
      window.clearTimeout(aiFireTimeout.current);
    }

    aiFireTimeout.current = window.setTimeout(() => {
      const latestActive = match.players.find((p) => p.config.id === match.activePlayerId);
      if (!latestActive || latestActive.config.kind !== 'ai') {
        return;
      }
      const shot = computeAIShot(match, latestActive, terrain, latestActive.config.aiLevel);
      const weaponId = match.settings.freeFireMode
        ? shot.weaponId
        : (latestActive.inventory[shot.weaponId] ?? 0) > 0
          ? shot.weaponId
          : pickNextWeapon(latestActive, 1, match.settings.freeFireMode);
      const tuned = {
        ...latestActive,
        angle: shot.angle,
        power: clamp(shot.power, 0, latestActive.maxPower),
        selectedWeaponId: weaponId,
      };
      const withTune = updatePlayer(match, tuned);
      setMatch(withTune);
      fireWeapon(withTune, tuned);
    }, 650);

    return () => {
      if (aiFireTimeout.current) {
        window.clearTimeout(aiFireTimeout.current);
      }
    };
  }, [fireWeapon, match, terrain, screen]);

  const onBattleInputFrame = useCallback((input: BattleInputState, deltaMs: number) => {
    if (screen !== 'battle') {
      return;
    }
    const currentTerrain = terrainRef.current;
    let currentMatch = matchRef.current;
    if (!currentMatch || !currentTerrain) {
      return;
    }
    let liveMatch: MatchState = currentMatch;

    if (liveMatch.phase === 'aim') {
      const active = liveMatch.players.find((p) => p.config.id === liveMatch.activePlayerId);
      if (active?.config.kind === 'human') {
        if (input.toggleShieldMenu) {
          setShieldMenuOpen((open) => !open);
        }

        if (shieldMenuOpen) {
          matchRef.current = liveMatch;
          return;
        }

        if (input.weaponCycle !== 0) {
          const updated = { ...active, selectedWeaponId: pickNextWeapon(active, input.weaponCycle, liveMatch.settings.freeFireMode) };
          liveMatch = updatePlayer(liveMatch, updated);
          matchRef.current = liveMatch;
        }

        if (input.firePressed) {
          fireWeapon(liveMatch, active);
          liveMatch = matchRef.current ?? liveMatch;
        } else {
          const aimed = applyHeldAimInput(liveMatch, currentTerrain, input, Math.min(250, deltaMs) / 1000);
          if (aimed !== liveMatch) {
            liveMatch = aimed;
            matchRef.current = aimed;
          }
        }
      }
    }

    const frameSeconds = Math.min(250, deltaMs) / 1000;
    simulationAccumulatorRef.current += frameSeconds;
    while (simulationAccumulatorRef.current >= FIXED_DT) {
      const loopMatch = matchRef.current;
      const loopTerrain = terrainRef.current;
      if (loopMatch && loopTerrain) {
        stepSimulation(loopMatch, loopTerrain);
      }
      simulationAccumulatorRef.current -= FIXED_DT;
    }

    uiSyncAccumulatorRef.current += deltaMs;
    if (uiSyncAccumulatorRef.current >= 80) {
      if (matchRef.current) {
        setMatch(matchRef.current);
      }
      if (terrainRef.current) {
        setTerrain(terrainRef.current);
      }
      uiSyncAccumulatorRef.current = 0;
    }
  }, [applyHeldAimInput, fireWeapon, screen, shieldMenuOpen, stepSimulation]);

  const startShopToBattle = useCallback(async (existingMatch: MatchState) => {
    const generated = await makeTerrainForRound(
      existingMatch.width,
      existingMatch.height,
      existingMatch.settings.terrainPreset,
      existingMatch.players.length,
    );
    const regenerated = generated.terrain;
    const prepared = {
      ...existingMatch,
      players: existingMatch.players.map((p) => ({
        ...p,
        alive: true,
        hp: 100,
        maxPower: 1000,
        power: 200,
        fuel: Math.max(0, p.inventory.fuel ?? 0),
      })),
    };
    const placed = placePlayersOnTerrain(prepared, regenerated);
    const nextPlayers = placed.match.players.map((p) => autoActivateShieldAtRoundStart(p));
    const next = { ...placed.match, players: nextPlayers, phase: 'aim' as const, activePlayerId: nextPlayers[0].config.id };
    terrainRef.current = placed.terrain;
    matchRef.current = next;
    setTerrain(placed.terrain);
    setMatch(next);
    runtimeRef.current = {
      projectiles: [],
      explosions: [],
      trails: [],
      terrainEdits: [],
      deferredSettlePending: false,
      funkySequence: null,
      mirvSequence: null,
    };
    simulationAccumulatorRef.current = 0;
    uiSyncAccumulatorRef.current = 0;
    powerTickAccumulatorRef.current = 0;
    angleTickAccumulatorRef.current = 0;
    movementTickAccumulatorRef.current = 0;
    setScreen('battle');
    setMessage(`Terrain: ${generated.source}`);
  }, [makeTerrainForRound, placePlayersOnTerrain]);

  const useShieldFromPopup = useCallback((shieldId: 'shield' | 'medium-shield' | 'heavy-shield') => {
    const liveMatch = matchRef.current;
    if (!liveMatch || liveMatch.phase !== 'aim') {
      return;
    }
    const active = liveMatch.players.find((p) => p.config.id === liveMatch.activePlayerId);
    if (!active || active.config.kind !== 'human') {
      return;
    }
    const updated = liveMatch.settings.freeFireMode
      ? boostShield(active, shieldId)
      : activateShieldFromInventory(active, shieldId);
    if (updated === active) {
      return;
    }
    const next = updatePlayer(liveMatch, updated);
    matchRef.current = next;
    setMatch(next);
    setMessage(`${active.config.name} activated ${shieldId}`);
  }, []);

  const activeShopPlayer = match?.players[shopIndex] ?? match?.players[0] ?? null;
  const activeBattlePlayer = match?.players.find((p) => p.config.id === match.activePlayerId);
  const shieldMenuItems = activeBattlePlayer
    ? SHIELD_ITEMS.map((item) => ({
      ...item,
      count: match?.settings.freeFireMode ? 999 : (activeBattlePlayer.inventory[item.id] ?? 0),
    }))
    : [];

  return (
    <div className={`app ${screen === 'battle' ? 'battle-mode' : ''}`}>
      {screen === 'title' && (
        <TitleScreen
          onStart={() => setScreen('players')}
          onSettings={() => setScreen('settings')}
          onLoad={() => {
            const profile = loadProfile();
            if (profile) {
              setSettings(normalizeSettings(profile.settings));
              setPlayerConfigs(profile.players);
              setMessage('Loaded profile');
            } else {
              setMessage('No saved profile found');
            }
          }}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(next) => {
            const normalized = normalizeSettings(next);
            setSettings(normalized);
            saveProfile(normalized, playerConfigs);
          }}
          onBack={() => setScreen('title')}
        />
      )}

      {screen === 'players' && (
        <PlayersScreen
          players={playerConfigs}
          onChange={(players) => {
            setPlayerConfigs(players);
            saveProfile(settings, players);
          }}
          onBack={() => setScreen('title')}
          onNext={async () => {
            const enabled = playerConfigs.filter((p) => p.enabled);
            const { match: seededMatch } = initMatch(settings, enabled, window.innerWidth, window.innerHeight);
            const generated = await makeTerrainForRound(
              seededMatch.width,
              seededMatch.height,
              settings.terrainPreset,
              seededMatch.players.length,
            );
            const newTerrain = generated.terrain;
            const placed = placePlayersOnTerrain(seededMatch, newTerrain);
            matchRef.current = placed.match;
            terrainRef.current = placed.terrain;
            setMatch(placed.match);
            setTerrain(placed.terrain);
            setShopIndex(0);
            setScreen('shop');
            setMessage(`Terrain ready: ${generated.source}`);
          }}
        />
      )}

      {screen === 'shop' && match && (
        <ShopScreen
          players={match.players}
          currentIndex={activeShopPlayer ? match.players.findIndex((p) => p.config.id === activeShopPlayer.config.id) : 0}
          onBuy={(playerId, weaponId) => {
            setMatch((current) => {
              if (!current) {
                return null;
              }
              return {
                ...current,
                players: current.players.map((p) => (p.config.id === playerId ? buyWeapon(p, weaponId) : p)),
              };
            });
          }}
          onSell={(playerId, weaponId) => {
            setMatch((current) => {
              if (!current) {
                return null;
              }
              return {
                ...current,
                players: current.players.map((p) => (p.config.id === playerId ? sellWeapon(p, weaponId) : p)),
              };
            });
          }}
          onNext={() => setShopIndex((idx) => clamp(idx + 1, 0, (match?.players.length ?? 1) - 1))}
          onDone={() => {
            if (match) {
              void startShopToBattle(match);
            }
          }}
        />
      )}

      {screen === 'battle' && match && terrain && (
        <BattleScreen
          match={match}
          terrain={terrain}
          message={message}
          shieldMenuOpen={shieldMenuOpen}
          shieldMenuPlayerName={activeBattlePlayer?.config.name ?? ''}
          shieldMenuItems={shieldMenuItems}
          onCloseShieldMenu={() => setShieldMenuOpen(false)}
          onActivateShield={useShieldFromPopup}
          getSnapshot={() => ({
            match: matchRef.current,
            terrain: terrainRef.current,
            runtime: runtimeRef.current,
            message,
          })}
          onInputFrame={onBattleInputFrame}
        />
      )}

      {screen === 'matchEnd' && match && (
        <div className="screen panel end-screen">
          <h2>Match Winner: {winnerName}</h2>
          <ul>
            {match.players
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <li key={p.config.id}>
                  {p.config.name}: {p.score} round wins
                </li>
              ))}
          </ul>
          <div className="row">
            <button onClick={() => setScreen('players')}>New Match</button>
            <button onClick={() => setScreen('title')}>Title</button>
          </div>
        </div>
      )}

      {message && screen !== 'battle' && <div className="toast">{message}</div>}
    </div>
  );
}
