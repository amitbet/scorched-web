import { describe, expect, it } from 'vitest';
import { activateShieldFromInventory, autoActivateShieldAtRoundStart, degradeShield } from './Shield';
import { STARTER_WEAPON_ID } from './WeaponCatalog';
import type { PlayerState } from '../types/game';

const basePlayer: PlayerState = {
  config: { id: 'p1', name: 'P1', kind: 'human', aiLevel: 'easy', colorIndex: 0, enabled: true },
  cash: 1000,
  armor: 100,
  shield: 0,
  shieldType: 'none',
  fuel: 100,
  inventory: { [STARTER_WEAPON_ID]: 999 },
  alive: true,
  score: 0,
  hp: 100,
  maxPower: 1000,
  x: 0,
  y: 0,
  fallDistance: 0,
  angle: 45,
  power: 500,
  selectedWeaponId: STARTER_WEAPON_ID,
};

describe('Shield', () => {
  it('activates shield from inventory and consumes one item', () => {
    const p = { ...basePlayer, inventory: { ...basePlayer.inventory, 'regular-shield': 2 } };
    const next = activateShieldFromInventory(p, 'regular-shield');
    expect(next.shield).toBe(1000);
    expect(next.shieldType).toBe('regular');
    expect(next.inventory['regular-shield']).toBe(1);
  });

  it('auto-defense uses strongest available shield at round start', () => {
    const p = {
      ...basePlayer,
      inventory: { ...basePlayer.inventory, 'auto-defense': 1, 'regular-shield': 1, 'heavy-shield': 1 },
    };
    const next = autoActivateShieldAtRoundStart(p);
    expect(next.shield).toBe(1000);
    expect(next.shieldType).toBe('heavy');
    expect(next.inventory['heavy-shield']).toBe(0);
    expect(next.inventory['regular-shield']).toBe(1);
  });

  it('degrades shield and clears type at zero', () => {
    const p = { ...basePlayer, shield: 200, shieldType: 'regular' as const };
    const next = degradeShield(p);
    expect(next.shield).toBe(0);
    expect(next.shieldType).toBe('none');
  });

  it('degrades heavy shield less per hit', () => {
    const p = { ...basePlayer, shield: 1000, shieldType: 'heavy' as const };
    const next = degradeShield(p);
    expect(next.shield).toBe(900);
    expect(next.shieldType).toBe('heavy');
  });
});
