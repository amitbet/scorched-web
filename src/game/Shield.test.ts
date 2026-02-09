import { describe, expect, it } from 'vitest';
import { activateShieldFromInventory, autoActivateShieldAtRoundStart } from './Shield';
import { STARTER_WEAPON_ID } from './WeaponCatalog';
import type { PlayerState } from '../types/game';

const basePlayer: PlayerState = {
  config: { id: 'p1', name: 'P1', kind: 'human', aiLevel: 'easy', colorIndex: 0, enabled: true },
  cash: 1000,
  armor: 100,
  shield: 0,
  fuel: 100,
  parachutes: 0,
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
    const p = { ...basePlayer, inventory: { ...basePlayer.inventory, shield: 2 } };
    const next = activateShieldFromInventory(p, 'shield');
    expect(next.shield).toBe(220);
    expect(next.inventory.shield).toBe(1);
  });

  it('auto-defense uses strongest available shield at round start', () => {
    const p = {
      ...basePlayer,
      inventory: { ...basePlayer.inventory, 'auto-defense': 1, shield: 1, 'medium-shield': 1 },
    };
    const next = autoActivateShieldAtRoundStart(p);
    expect(next.shield).toBe(420);
    expect(next.inventory['medium-shield']).toBe(0);
    expect(next.inventory.shield).toBe(1);
  });
});
