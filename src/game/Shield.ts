import type { PlayerState, ShieldType } from '../types/game';

export interface ShieldItemDef {
  id: string;
  name: string;
  shieldType: ShieldType;
  initialStrength: number;
  degradationPerHit: number;
}

export const SHIELD_ITEMS: ShieldItemDef[] = [
  { id: 'regular-shield', name: 'Regular Shield', shieldType: 'regular', initialStrength: 1000, degradationPerHit: 200 },
  { id: 'heavy-shield', name: 'Heavy Shield', shieldType: 'heavy', initialStrength: 1000, degradationPerHit: 100 },
  { id: 'bouncy-shield', name: 'Bouncy Shield', shieldType: 'bouncy', initialStrength: 1000, degradationPerHit: 200 },
  { id: 'mag-deflector', name: 'Mag Deflector', shieldType: 'mag-deflector', initialStrength: 1000, degradationPerHit: 200 },
];

const AUTO_DEFENSE_PRIORITY: string[] = ['heavy-shield', 'bouncy-shield', 'mag-deflector', 'regular-shield'];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getShieldDef(shieldType: ShieldType): ShieldItemDef | undefined {
  return SHIELD_ITEMS.find((item) => item.shieldType === shieldType);
}

export function activateShieldFromInventory(player: PlayerState, shieldId: string): PlayerState {
  const has = player.inventory[shieldId] ?? 0;
  if (has <= 0) {
    return player;
  }
  const def = SHIELD_ITEMS.find((item) => item.id === shieldId);
  if (!def) {
    return player;
  }
  return {
    ...player,
    inventory: { ...player.inventory, [shieldId]: has - 1 },
    shield: def.initialStrength,
    shieldType: def.shieldType,
  };
}

export function degradeShield(player: PlayerState): PlayerState {
  const def = getShieldDef(player.shieldType);
  if (!def) {
    return player;
  }
  const newShield = clamp(player.shield - def.degradationPerHit, 0, 1000);
  if (newShield <= 0) {
    return { ...player, shield: 0, shieldType: 'none' };
  }
  return { ...player, shield: newShield };
}

export function autoActivateShieldAtRoundStart(player: PlayerState): PlayerState {
  if ((player.inventory['auto-defense'] ?? 0) <= 0) {
    return player;
  }
  for (const shieldId of AUTO_DEFENSE_PRIORITY) {
    if ((player.inventory[shieldId] ?? 0) > 0) {
      return activateShieldFromInventory(player, shieldId);
    }
  }
  return player;
}
