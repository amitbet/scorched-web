import type { WeaponDef } from '../types/game';

function w(def: Omit<WeaponDef, 'price'>): WeaponDef {
  return {
    ...def,
    price: Math.max(1, Math.floor(def.packPrice / def.packQty)),
  };
}

export const WEAPONS: WeaponDef[] = [
  w({ id: 'missile', name: 'Missile', packPrice: 0, packQty: 1, category: 'weapons', damage: 32, blastRadius: 10, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'baby-nuke', name: 'Baby Nuke', packPrice: 20000, packQty: 1, category: 'weapons', damage: 90, blastRadius: 60, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'nuke', name: 'Nuke', packPrice: 40000, packQty: 1, category: 'weapons', damage: 130, blastRadius: 100, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'sand-bomb', name: 'Sand Bomb', packPrice: 5000, packQty: 1, category: 'earthworks', damage: 0, blastRadius: 0, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'baby-roller', name: 'Baby Roller', packPrice: 7000, packQty: 1, category: 'weapons', damage: 26, blastRadius: 15, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'roller', name: 'Roller', packPrice: 13000, packQty: 1, category: 'weapons', damage: 42, blastRadius: 30, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'heavy-roller', name: 'Heavy Roller', packPrice: 20000, packQty: 1, category: 'weapons', damage: 66, blastRadius: 55, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'baby-digger', name: 'Baby Digger', packPrice: 2000, packQty: 1, category: 'earthworks', damage: 0, blastRadius: 10, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 0 }),
  w({ id: 'digger', name: 'Digger', packPrice: 4000, packQty: 1, category: 'earthworks', damage: 0, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 0 }),
  w({ id: 'heavy-digger', name: 'Heavy Digger', packPrice: 6000, packQty: 1, category: 'earthworks', damage: 0, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 1 }),
  w({ id: 'funky-bomb', name: 'Funky Bomb', packPrice: 30000, packQty: 1, category: 'weapons', damage: 55, blastRadius: 60, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'funky-nuke', name: 'Funky Nuke', packPrice: 50000, packQty: 1, category: 'weapons', damage: 85, blastRadius: 100, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 3 }),
  w({ id: 'napalm', name: 'Napalm', packPrice: 10000, packQty: 1, category: 'weapons', damage: 24, blastRadius: 24, projectileCount: 1, spreadDeg: 0, special: 'napalm', terrainEffect: 'burn', unlockTier: 1 }),
  w({ id: 'hot-napalm', name: 'Hot Napalm', packPrice: 20000, packQty: 1, category: 'weapons', damage: 35, blastRadius: 34, projectileCount: 1, spreadDeg: 0, special: 'napalm', terrainEffect: 'burn', unlockTier: 2 }),
  w({ id: 'mirv', name: 'MIRV', packPrice: 35000, packQty: 1, category: 'weapons', damage: 50, blastRadius: 25, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'death-head', name: 'Death Head', packPrice: 90000, packQty: 1, category: 'weapons', damage: 90, blastRadius: 55, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 3 }),

  w({ id: 'shield', name: 'Shield', packPrice: 20000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'medium-shield', name: 'Medium Shield', packPrice: 27000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'heavy-shield', name: 'Heavy Shield', packPrice: 35000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'parachute', name: 'Parachute', packPrice: 2000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'battery', name: 'Battery', packPrice: 4500, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'tracer', name: 'Tracer', packPrice: 100, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'auto-defense', name: 'Auto Defense', packPrice: 5000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'fuel', name: 'Fuel', packPrice: 10000, packQty: 100, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
];

export const STARTER_WEAPON_ID = 'missile';

export function getWeaponById(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}
