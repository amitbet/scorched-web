import type { PlayerState } from '../types/game';

export interface ShieldItemDef {
  id: 'shield' | 'force-shield' | 'heavy-shield';
  name: string;
  boost: number;
}

export const SHIELD_ITEMS: ShieldItemDef[] = [
  { id: 'shield', name: 'Shield', boost: 35 },
  { id: 'force-shield', name: 'Force Shield', boost: 55 },
  { id: 'heavy-shield', name: 'Heavy Shield', boost: 85 },
];

const AUTO_DEFENSE_PRIORITY: ShieldItemDef['id'][] = ['heavy-shield', 'force-shield', 'shield'];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function activateShieldFromInventory(player: PlayerState, shieldId: ShieldItemDef['id']): PlayerState {
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
    shield: clamp(player.shield + def.boost, 0, 160),
  };
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
