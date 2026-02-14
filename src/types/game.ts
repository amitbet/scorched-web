export type WindMode = 'off' | 'constant' | 'changing';
export type TerrainPreset = 'rolling' | 'canyon' | 'islands' | 'random' | 'mtn';
export type AILevel = 'easy' | 'normal' | 'hard';
export type PlayerKind = 'human' | 'ai';
export type WeaponSpecial = 'normal' | 'drill' | 'roller' | 'cluster' | 'napalm' | 'nuke';
export type TerrainEffect = 'crater' | 'tunnel' | 'burn' | 'none';
export type ShieldType = 'none' | 'regular' | 'heavy' | 'bouncy' | 'mag-deflector';
export type WeaponCategory = 'weapons' | 'earthworks' | 'misc';

export interface GameSettings {
  roundsToWin: number;
  gravity: number;
  windMode: WindMode;
  terrainPreset: TerrainPreset;
  cashStart: number;
  turnTimeLimitSec: number | null;
  retroPalette: boolean;
  powerAdjustHz: number;
  freeFireMode: boolean;
  tankColorTrails: boolean;
  shotTraces: boolean;
}

export interface PlayerConfig {
  id: string;
  name: string;
  kind: PlayerKind;
  aiLevel: AILevel;
  colorIndex: number;
  enabled: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  price: number;
  packPrice: number;
  packQty: number;
  category: WeaponCategory;
  damage: number;
  blastRadius: number;
  projectileCount: number;
  spreadDeg: number;
  special: WeaponSpecial;
  terrainEffect: TerrainEffect;
  unlockTier: number;
}

export type InventoryMap = Record<string, number>;

export interface PlayerState {
  config: PlayerConfig;
  cash: number;
  armor: number;
  shield: number;
  shieldType: ShieldType;
  fuel: number;
  parachutes: number;
  inventory: InventoryMap;
  alive: boolean;
  score: number;
  hp: number;
  maxPower: number;
  x: number;
  y: number;
  fallDistance: number;
  angle: number;
  power: number;
  selectedWeaponId: string;
}

export type MatchPhase = 'aim' | 'projectile' | 'resolve' | 'roundEnd' | 'matchEnd';

export interface MatchState {
  settings: GameSettings;
  players: PlayerState[];
  roundIndex: number;
  wind: number;
  activePlayerId: string;
  phase: MatchPhase;
  width: number;
  height: number;
}

export interface TerrainState {
  width: number;
  height: number;
  revision: number;
  heights: number[];
  mask: Uint8Array;
  colorIndices?: Uint8Array;
  colorPalette?: Array<[number, number, number]>;
}

export interface ProjectileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  weaponId: string;
  ttl: number;
  splitDepth?: number;
  color?: string;
  projectileType?: 'ballistic' | 'mirv-carrier' | 'mirv-child' | 'roller' | 'digger' | 'sandhog' | 'funky-child' | 'delayed-blast' | 'napalm-burn';
  effectRadius?: number;
  effectDamage?: number;
  direction?: number;
  state?: number;
  timer?: number;
  seed?: number;
}

export interface ExplosionEvent {
  x: number;
  y: number;
  radius: number;
  damage: number;
  ownerId: string;
}

export interface TurnInput {
  angleDelta: number;
  powerDelta: number;
  fire: boolean;
  weaponDelta: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  roundsToWin: 5,
  gravity: 260,
  windMode: 'off',
  terrainPreset: 'random',
  cashStart: 200000,
  turnTimeLimitSec: null,
  retroPalette: true,
  powerAdjustHz: 15,
  freeFireMode: false,
  tankColorTrails: true,
  shotTraces: false,
};

export const TANK_COLORS = [
  '#ff2f41',
  '#ffb100',
  '#00e1ff',
  '#9cff00',
  '#ff4cf7',
  '#ffffff',
  '#9f73ff',
  '#56ff8b',
];
