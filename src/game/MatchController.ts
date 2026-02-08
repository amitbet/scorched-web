import type { GameSettings, MatchState, PlayerConfig, PlayerState, TerrainState } from '../types/game';
import { STARTER_WEAPON_ID } from './WeaponCatalog';
import { generateTerrain } from '../engine/terrain/TerrainGenerator';

function randomWind(settings: GameSettings): number {
  if (settings.windMode === 'off') {
    return 0;
  }
  const max = 10;
  return (Math.random() * 2 - 1) * max;
}

function createPlayerState(config: PlayerConfig, settings: GameSettings): PlayerState {
  return {
    config,
    cash: settings.cashStart,
    armor: 100,
    shield: 0,
    fuel: 0,
    parachutes: 0,
    inventory: { [STARTER_WEAPON_ID]: 999 },
    alive: true,
    score: 0,
    hp: 100,
    maxPower: 1000,
    x: 0,
    y: 0,
    fallDistance: 0,
    angle: 30,
    power: 300,
    selectedWeaponId: STARTER_WEAPON_ID,
  };
}

export function initMatch(settings: GameSettings, playerConfigs: PlayerConfig[], width: number, height: number): { match: MatchState; terrain: TerrainState } {
  const players = playerConfigs.filter((p) => p.enabled).map((config) => createPlayerState(config, settings));
  const terrain = generateTerrain(width, height, settings.terrainPreset);
  const spacing = width / (players.length + 1);

  const seededPlayers = players.map((p, i) => {
    const x = Math.floor(spacing * (i + 1));
    const y = terrain.heights[x] - 8;
    return { ...p, x, y };
  });

  const match: MatchState = {
    settings,
    players: seededPlayers,
    roundIndex: 1,
    wind: randomWind(settings),
    activePlayerId: seededPlayers[0]?.config.id ?? '',
    phase: 'aim',
    width,
    height,
  };

  return { match, terrain };
}

export function getActivePlayer(match: MatchState): PlayerState | undefined {
  return match.players.find((p) => p.config.id === match.activePlayerId);
}

export function updatePlayer(match: MatchState, player: PlayerState): MatchState {
  return {
    ...match,
    players: match.players.map((p) => (p.config.id === player.config.id ? player : p)),
  };
}

export function nextActivePlayer(match: MatchState): MatchState {
  const alive = match.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    return { ...match, phase: alive.length === 1 ? 'roundEnd' : 'matchEnd' };
  }

  const index = alive.findIndex((p) => p.config.id === match.activePlayerId);
  const next = alive[(index + 1) % alive.length];
  return {
    ...match,
    activePlayerId: next.config.id,
    phase: 'aim',
    wind: match.settings.windMode === 'changing' ? randomWind(match.settings) : match.wind,
  };
}

export function applyRoundEnd(match: MatchState): MatchState {
  const winner = match.players.find((p) => p.alive);
  const players = match.players.map((p) => ({
    ...p,
    alive: true,
    hp: 100,
    maxPower: 1000,
    power: Math.min(p.power, 1000),
    shield: 0,
    fallDistance: 0,
  }));
  const updated = winner
    ? players.map((p) => (p.config.id === winner.config.id ? { ...p, score: p.score + 1 } : p))
    : players;

  const matchWinner = updated.find((p) => p.score >= match.settings.roundsToWin);
  if (matchWinner) {
    return {
      ...match,
      players: updated,
      phase: 'matchEnd',
    };
  }

  return {
    ...match,
    players: updated,
    roundIndex: match.roundIndex + 1,
    phase: 'aim',
    activePlayerId: updated[0].config.id,
    wind: randomWind(match.settings),
  };
}
