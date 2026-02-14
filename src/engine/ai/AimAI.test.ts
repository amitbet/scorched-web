import { describe, expect, it } from 'vitest';
import { computeAIShot } from './AimAI';
import { generateTerrain } from '../terrain/TerrainGenerator';
import type { MatchState } from '../../types/game';
import { STARTER_WEAPON_ID } from '../../game/WeaponCatalog';

function fakeMatch(): MatchState {
  return {
    settings: {
      roundsToWin: 3,
      gravity: 80,
      windMode: 'constant',
      terrainPreset: 'rolling',
      cashStart: 10000,
      turnTimeLimitSec: null,
      retroPalette: true,
      powerAdjustHz: 18,
      freeFireMode: false,
      shotTraces: false,
      tankColorTrails: true,
    },
    players: [
      {
        config: { id: 'a', name: 'A', kind: 'ai', aiLevel: 'hard', colorIndex: 0, enabled: true },
        cash: 0,
        armor: 100,
        shield: 0,
        shieldType: 'none',
        fuel: 100,
        parachutes: 0,
        inventory: { [STARTER_WEAPON_ID]: 999 },
        alive: true,
        score: 0,
        hp: 100,
        maxPower: 1000,
        x: 100,
        y: 220,
        fallDistance: 0,
        angle: 45,
        power: 160,
        selectedWeaponId: STARTER_WEAPON_ID,
      },
      {
        config: { id: 'b', name: 'B', kind: 'human', aiLevel: 'easy', colorIndex: 1, enabled: true },
        cash: 0,
        armor: 100,
        shield: 0,
        shieldType: 'none',
        fuel: 100,
        parachutes: 0,
        inventory: { [STARTER_WEAPON_ID]: 999 },
        alive: true,
        score: 0,
        hp: 100,
        maxPower: 1000,
        x: 380,
        y: 210,
        fallDistance: 0,
        angle: 45,
        power: 160,
        selectedWeaponId: STARTER_WEAPON_ID,
      },
    ],
    roundIndex: 1,
    wind: 8,
    activePlayerId: 'a',
    phase: 'aim',
    width: 600,
    height: 320,
  };
}

describe('AimAI', () => {
  it('produces valid angle/power outputs', () => {
    const match = fakeMatch();
    const terrain = generateTerrain(match.width, match.height, 'rolling');
    const shot = computeAIShot(match, match.players[0], terrain, 'hard');
    expect(shot.angle).toBeGreaterThanOrEqual(2);
    expect(shot.angle).toBeLessThanOrEqual(178);
    expect(shot.power).toBeGreaterThanOrEqual(60);
  });
});
