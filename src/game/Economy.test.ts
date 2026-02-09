import { describe, expect, it } from 'vitest';
import { buyWeapon, sellWeapon } from './Economy';
import { STARTER_WEAPON_ID, getWeaponById } from './WeaponCatalog';
import type { PlayerState } from '../types/game';

const basePlayer: PlayerState = {
  config: { id: 'p1', name: 'P1', kind: 'human', aiLevel: 'easy', colorIndex: 0, enabled: true },
  cash: 30000,
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

describe('Economy', () => {
  it('buys weapon when enough cash', () => {
    const next = buyWeapon(basePlayer, 'baby-digger');
    const weapon = getWeaponById('baby-digger');
    expect(next.cash).toBeLessThan(basePlayer.cash);
    expect(next.inventory['baby-digger']).toBe(weapon.packQty);
  });

  it('sells owned weapon and increases cash', () => {
    const withWeapon = { ...basePlayer, inventory: { ...basePlayer.inventory, nuke: 2 } };
    const next = sellWeapon(withWeapon, 'nuke');
    expect(next.cash).toBeGreaterThan(withWeapon.cash);
    expect(next.inventory.nuke).toBe(1);
  });
});
