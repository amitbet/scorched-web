import type { PlayerState } from '../types/game';
import { getWeaponById } from './WeaponCatalog';

const SELL_FACTOR = 0.6;

export function canBuy(player: PlayerState, weaponId: string): boolean {
  const weapon = getWeaponById(weaponId);
  return player.cash >= weapon.packPrice;
}

export function buyWeapon(player: PlayerState, weaponId: string): PlayerState {
  const weapon = getWeaponById(weaponId);
  if (player.cash < weapon.packPrice) {
    return player;
  }

  const inventory = { ...player.inventory, [weaponId]: (player.inventory[weaponId] ?? 0) + weapon.packQty };
  return { ...player, cash: player.cash - weapon.packPrice, inventory };
}

export function sellWeapon(player: PlayerState, weaponId: string): PlayerState {
  const quantity = player.inventory[weaponId] ?? 0;
  const weapon = getWeaponById(weaponId);
  if (quantity < weapon.packQty) {
    return player;
  }

  const inventory = { ...player.inventory, [weaponId]: quantity - weapon.packQty };
  return { ...player, cash: player.cash + Math.floor(weapon.packPrice * SELL_FACTOR), inventory };
}

export function awardDamageCash(player: PlayerState, damage: number): PlayerState {
  const reward = Math.max(0, Math.floor(damage * 2.5));
  return { ...player, cash: player.cash + reward };
}

export function awardKillBonus(player: PlayerState): PlayerState {
  return { ...player, cash: player.cash + 350 };
}

export function awardRoundWin(player: PlayerState): PlayerState {
  return { ...player, cash: player.cash + 700, score: player.score + 1 };
}
