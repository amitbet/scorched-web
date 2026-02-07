import type { WeaponDef } from '../types/game';

function w(def: Omit<WeaponDef, 'price'>): WeaponDef {
  return {
    ...def,
    price: Math.max(1, Math.floor(def.packPrice / def.packQty)),
  };
}

export const WEAPONS: WeaponDef[] = [
  w({ id: 'baby', name: 'Baby Missile', packPrice: 400, packQty: 10, category: 'weapons', damage: 16, blastRadius: 14, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'missile', name: 'Missile', packPrice: 976, packQty: 5, category: 'weapons', damage: 30, blastRadius: 24, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 0 }),
  w({ id: 'baby-nuke', name: 'Baby Nuke', packPrice: 6646, packQty: 3, category: 'weapons', damage: 76, blastRadius: 54, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'nuke', name: 'Nuke', packPrice: 15061, packQty: 1, category: 'weapons', damage: 130, blastRadius: 86, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 3 }),
  w({ id: 'leapfrog', name: 'LeapFrog', packPrice: 1217, packQty: 2, category: 'weapons', damage: 42, blastRadius: 30, projectileCount: 2, spreadDeg: 4, special: 'cluster', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'funkey-bomb', name: 'Funkey Bomb', packPrice: 742, packQty: 2, category: 'weapons', damage: 26, blastRadius: 20, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'mirv', name: 'MIRV', packPrice: 1217, packQty: 3, category: 'weapons', damage: 24, blastRadius: 18, projectileCount: 3, spreadDeg: 5.5, special: 'cluster', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'deaths-head', name: "Death's Head", packPrice: 2555, packQty: 1, category: 'weapons', damage: 88, blastRadius: 58, projectileCount: 1, spreadDeg: 0, special: 'nuke', terrainEffect: 'crater', unlockTier: 3 }),
  w({ id: 'napalm', name: 'Napalm', packPrice: 1217, packQty: 10, category: 'weapons', damage: 9, blastRadius: 12, projectileCount: 8, spreadDeg: 8.5, special: 'napalm', terrainEffect: 'burn', unlockTier: 1 }),
  w({ id: 'hot-napalm', name: 'Hot Napalm', packPrice: 2555, packQty: 2, category: 'weapons', damage: 18, blastRadius: 18, projectileCount: 10, spreadDeg: 10, special: 'napalm', terrainEffect: 'burn', unlockTier: 2 }),
  w({ id: 'tracer', name: 'Tracer', packPrice: 10, packQty: 20, category: 'weapons', damage: 5, blastRadius: 6, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),

  w({ id: 'baby-roller', name: 'Baby Roller', packPrice: 5000, packQty: 10, category: 'weapons', damage: 24, blastRadius: 19, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'roller', name: 'Roller', packPrice: 6000, packQty: 5, category: 'weapons', damage: 38, blastRadius: 26, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'heavy-roller', name: 'Heavy Roller', packPrice: 6999, packQty: 2, category: 'weapons', damage: 58, blastRadius: 34, projectileCount: 1, spreadDeg: 0, special: 'roller', terrainEffect: 'crater', unlockTier: 3 }),
  w({ id: 'riot-charge', name: 'Riot Charge', packPrice: 2000, packQty: 10, category: 'weapons', damage: 22, blastRadius: 18, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 1 }),
  w({ id: 'riot-blast', name: 'Riot Blast', packPrice: 5000, packQty: 5, category: 'weapons', damage: 34, blastRadius: 26, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'riot-bomb', name: 'Riot Bomb', packPrice: 5000, packQty: 5, category: 'weapons', damage: 40, blastRadius: 28, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 2 }),
  w({ id: 'heavy-riot-bomb', name: 'Heavy Riot Bomb', packPrice: 4750, packQty: 2, category: 'weapons', damage: 56, blastRadius: 36, projectileCount: 1, spreadDeg: 0, special: 'cluster', terrainEffect: 'crater', unlockTier: 3 }),
  w({ id: 'baby-digger', name: 'Baby Digger', packPrice: 3000, packQty: 10, category: 'weapons', damage: 14, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 1 }),
  w({ id: 'digger', name: 'Digger', packPrice: 2500, packQty: 5, category: 'weapons', damage: 28, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 2 }),
  w({ id: 'heavy-digger', name: 'Heavy Digger', packPrice: 6999, packQty: 2, category: 'weapons', damage: 46, blastRadius: 30, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 3 }),

  w({ id: 'baby-sandhog', name: 'Baby Sandhog', packPrice: 1217, packQty: 10, category: 'earthworks', damage: 18, blastRadius: 14, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 1 }),
  w({ id: 'sandhog', name: 'Sandhog', packPrice: 2138, packQty: 5, category: 'earthworks', damage: 34, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 2 }),
  w({ id: 'heavy-sandhog', name: 'Heavy Sandhog', packPrice: 3294, packQty: 2, category: 'earthworks', damage: 48, blastRadius: 28, projectileCount: 1, spreadDeg: 0, special: 'drill', terrainEffect: 'tunnel', unlockTier: 3 }),
  w({ id: 'dirt-clod', name: 'Dirt Clod', packPrice: 5000, packQty: 10, category: 'earthworks', damage: 0, blastRadius: 10, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'dirt-ball', name: 'Dirt Ball', packPrice: 5000, packQty: 5, category: 'earthworks', damage: 0, blastRadius: 16, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'ton-of-dirt', name: 'Ton of Dirt', packPrice: 6999, packQty: 2, category: 'earthworks', damage: 0, blastRadius: 28, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'liquid-dirt', name: 'Liquid Dirt', packPrice: 5000, packQty: 5, category: 'earthworks', damage: 0, blastRadius: 22, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'dirt-charge', name: 'Dirt Charge', packPrice: 5000, packQty: 10, category: 'earthworks', damage: 0, blastRadius: 18, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'plasma-blast', name: 'Plasma Blast', packPrice: 1064, packQty: 5, category: 'earthworks', damage: 44, blastRadius: 30, projectileCount: 1, spreadDeg: 0, special: 'normal', terrainEffect: 'crater', unlockTier: 2 }),

  w({ id: 'heat-guidance', name: 'Heat Guidance', packPrice: 1217, packQty: 6, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'bal-guidance', name: 'Bal Guidance', packPrice: 1217, packQty: 2, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'horz-guidance', name: 'Horz Guidance', packPrice: 1913, packQty: 5, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'vert-guidance', name: 'Vert Guidance', packPrice: 2555, packQty: 5, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'lazy-boy', name: 'Lazy Boy', packPrice: 2555, packQty: 2, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'parachute', name: 'Parachute', packPrice: 9429, packQty: 8, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'battery', name: 'Battery', packPrice: 5652, packQty: 10, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 0 }),
  w({ id: 'mag-deflector', name: 'Mag Deflector', packPrice: 1217, packQty: 2, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'shield', name: 'Shield', packPrice: 8363, packQty: 3, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'force-shield', name: 'Force Shield', packPrice: 9360, packQty: 3, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'heavy-shield', name: 'Heavy Shield', packPrice: 44927, packQty: 2, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 3 }),
  w({ id: 'auto-defense', name: 'Auto Defense', packPrice: 6694, packQty: 1, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 2 }),
  w({ id: 'fuel-tank', name: 'Fuel Tank', packPrice: 1217, packQty: 10, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
  w({ id: 'contact-trigger', name: 'Contact Trigger', packPrice: 1000, packQty: 25, category: 'misc', damage: 0, blastRadius: 0, projectileCount: 0, spreadDeg: 0, special: 'normal', terrainEffect: 'none', unlockTier: 1 }),
];

export const STARTER_WEAPON_ID = 'baby';

export function getWeaponById(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}
