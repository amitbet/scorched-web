import type { WeaponDef } from '../types/game';

function w(def: Omit<WeaponDef, 'price'>): WeaponDef {
  return {
    ...def,
    price: Math.max(1, Math.floor(def.packPrice / def.packQty)),
  };
}

export const WEAPONS: WeaponDef[] = [
  w({ id: 'baby-missile', name: 'Baby Missile', packPrice: 0, packQty: 1, category: 'weapons', damage: 24, blastRadius: 10, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'missile', name: 'Missile', packPrice: 1200, packQty: 10, category: 'weapons', damage: 32, blastRadius: 14, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'riot-charge', name: 'Riot Charge', packPrice: 1851, packQty: 10, category: 'weapons', damage: 16, blastRadius: 8, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'riot-blast', name: 'Riot Blast', packPrice: 3606, packQty: 5, category: 'weapons', damage: 24, blastRadius: 12, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'riot-bomb', name: 'Riot Bomb', packPrice: 3662, packQty: 5, category: 'weapons', damage: 30, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'heavy-riot-bomb', name: 'Heavy Riot Bomb', packPrice: 3179, packQty: 2, category: 'weapons', damage: 42, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'baby-nuke', name: 'Baby Nuke', packPrice: 20000, packQty: 3, category: 'weapons', damage: 90, blastRadius: 60, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'nuke', name: 'Nuke', packPrice: 40000, packQty: 1, category: 'weapons', damage: 130, blastRadius: 100, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'leapfrog', name: 'LeapFrog', packPrice: 8022, packQty: 2, category: 'weapons', damage: 30, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'sand-bomb', name: 'Sand Bomb', packPrice: 5000, packQty: 1, category: 'earthworks', damage: 0, blastRadius: 0, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'ton-of-dirt', name: 'Ton of Dirt', packPrice: 4847, packQty: 2, category: 'earthworks', damage: 0, blastRadius: 0, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'liquid-dirt', name: 'Liquid Dirt', packPrice: 3467, packQty: 5, category: 'earthworks', damage: 0, blastRadius: 0, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'baby-roller', name: 'Baby Roller', packPrice: 7000, packQty: 10, category: 'weapons', damage: 26, blastRadius: 15, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'roller', name: 'Roller', packPrice: 13000, packQty: 5, category: 'weapons', damage: 42, blastRadius: 30, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'heavy-roller', name: 'Heavy Roller', packPrice: 20000, packQty: 2, category: 'weapons', damage: 66, blastRadius: 55, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'baby-digger', name: 'Baby Digger', packPrice: 2000, packQty: 10, category: 'earthworks', damage: 0, blastRadius: 10, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 0 }),
  w({ id: 'digger', name: 'Digger', packPrice: 4000, packQty: 5, category: 'earthworks', damage: 0, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 0 }),
  w({ id: 'heavy-digger', name: 'Heavy Digger', packPrice: 6000, packQty: 2, category: 'earthworks', damage: 0, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 1 }),
  w({ id: 'baby-sandhog', name: 'Baby Sandhog', packPrice: 6899, packQty: 10, category: 'earthworks', damage: 0, blastRadius: 10, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 1 }),
  w({ id: 'sandhog', name: 'Sandhog', packPrice: 11830, packQty: 5, category: 'earthworks', damage: 0, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 1 }),
  w({ id: 'heavy-sandhog', name: 'Heavy Sandhog', packPrice: 16822, packQty: 2, category: 'earthworks', damage: 0, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 2 }),
  w({ id: 'funky-bomb', name: 'Funky Bomb', packPrice: 30000, packQty: 1, category: 'weapons', damage: 55, blastRadius: 60, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'napalm', name: 'Napalm', packPrice: 10000, packQty: 1, category: 'weapons', damage: 24, blastRadius: 24, projectileCount: 1, spreadDeg: 0, special: 'napalm', terrainEffect: 'burn', unlockTier: 1 }),
  w({ id: 'hot-napalm', name: 'Hot Napalm', packPrice: 20000, packQty: 1, category: 'weapons', damage: 35, blastRadius: 34, projectileCount: 1, spreadDeg: 0, special: 'napalm', terrainEffect: 'burn', unlockTier: 2 }),
  w({ id: 'tracer', name: 'Tracer', packPrice: 7, packQty: 20, category: 'weapons', damage: 0, blastRadius: 0, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'smoke-tracer', name: 'Smoke Tracer', packPrice: 475, packQty: 10, category: 'weapons', damage: 0, blastRadius: 0, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'mirv', name: 'MIRV', packPrice: 35000, packQty: 1, category: 'weapons', damage: 50, blastRadius: 25, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'death-head', name: "Death's Head", packPrice: 90000, packQty: 1, category: 'weapons', damage: 90, blastRadius: 55, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 3 }),

  w({ id: 'regular-shield', name: 'Regular Shield', packPrice: 20000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'heavy-shield', name: 'Heavy Shield', packPrice: 35000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'bouncy-shield', name: 'Bouncy Shield', packPrice: 30000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'mag-deflector', name: 'Mag Deflector', packPrice: 40000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'parachute', name: 'Parachute', packPrice: 2000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'battery', name: 'Battery', packPrice: 4500, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'auto-defense', name: 'Auto Defense', packPrice: 5000, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'fuel', name: 'Fuel', packPrice: 10000, packQty: 100, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
];

export const STARTER_WEAPON_ID = 'baby-missile';

export function getWeaponById(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}
