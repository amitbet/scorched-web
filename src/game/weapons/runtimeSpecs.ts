import type { ProjectileState } from '../../types/game';

export type ImpactMode = 'default' | 'mirv' | 'roller' | 'digger' | 'sandhog' | 'funky' | 'napalm' | 'sand' | 'dirt' | 'liquid';

export interface WeaponRuntimeSpec {
  id: string;
  launchProjectileType: ProjectileState['projectileType'];
  impactMode: ImpactMode;
  mirvChildCount?: number;
  rollerTtl?: number;
  diggerDuration?: number;
  sandhogDuration?: number;
  funkyChildCount?: number;
  napalmDrops?: number;
  napalmTtl?: number;
  napalmRadius?: number;
  napalmDamage?: number;
}

const DEFAULT_SPEC: WeaponRuntimeSpec = {
  id: 'default',
  launchProjectileType: 'ballistic',
  impactMode: 'default',
};

const WEAPON_RUNTIME_SPECS: Record<string, WeaponRuntimeSpec> = {
  missile: { id: 'missile', launchProjectileType: 'ballistic', impactMode: 'default' },
  'baby-nuke': { id: 'baby-nuke', launchProjectileType: 'ballistic', impactMode: 'default' },
  nuke: { id: 'nuke', launchProjectileType: 'ballistic', impactMode: 'default' },
  'sand-bomb': { id: 'sand-bomb', launchProjectileType: 'ballistic', impactMode: 'sand' },
  'ton-of-dirt': { id: 'ton-of-dirt', launchProjectileType: 'ballistic', impactMode: 'dirt' },
  'liquid-dirt': { id: 'liquid-dirt', launchProjectileType: 'ballistic', impactMode: 'liquid' },

  'baby-roller': { id: 'baby-roller', launchProjectileType: 'ballistic', impactMode: 'roller', rollerTtl: 2.7 },
  roller: { id: 'roller', launchProjectileType: 'ballistic', impactMode: 'roller', rollerTtl: 3.1 },
  'heavy-roller': { id: 'heavy-roller', launchProjectileType: 'ballistic', impactMode: 'roller', rollerTtl: 3.6 },

  'baby-digger': { id: 'baby-digger', launchProjectileType: 'ballistic', impactMode: 'digger', diggerDuration: 0.45 },
  digger: { id: 'digger', launchProjectileType: 'ballistic', impactMode: 'digger', diggerDuration: 0.7 },
  'heavy-digger': { id: 'heavy-digger', launchProjectileType: 'ballistic', impactMode: 'digger', diggerDuration: 0.85 },
  'baby-sandhog': { id: 'baby-sandhog', launchProjectileType: 'ballistic', impactMode: 'sandhog', sandhogDuration: 0.6 },
  sandhog: { id: 'sandhog', launchProjectileType: 'ballistic', impactMode: 'sandhog', sandhogDuration: 1.05 },
  'heavy-sandhog': { id: 'heavy-sandhog', launchProjectileType: 'ballistic', impactMode: 'sandhog', sandhogDuration: 1.9 },

  'funky-bomb': { id: 'funky-bomb', launchProjectileType: 'ballistic', impactMode: 'funky', funkyChildCount: 6 },
  'funky-nuke': { id: 'funky-nuke', launchProjectileType: 'ballistic', impactMode: 'funky', funkyChildCount: 10 },

  napalm: {
    id: 'napalm',
    launchProjectileType: 'ballistic',
    impactMode: 'napalm',
    napalmDrops: 12,
    napalmTtl: 2.8,
    napalmRadius: 14,
    napalmDamage: 7,
  },
  'hot-napalm': {
    id: 'hot-napalm',
    launchProjectileType: 'ballistic',
    impactMode: 'napalm',
    napalmDrops: 18,
    napalmTtl: 3.7,
    napalmRadius: 20,
    napalmDamage: 11,
  },

  mirv: { id: 'mirv', launchProjectileType: 'mirv-carrier', impactMode: 'mirv', mirvChildCount: 5 },
  'death-head': { id: 'death-head', launchProjectileType: 'mirv-carrier', impactMode: 'mirv', mirvChildCount: 9 },
};

export function getWeaponRuntimeSpec(weaponId: string): WeaponRuntimeSpec {
  return WEAPON_RUNTIME_SPECS[weaponId] ?? DEFAULT_SPEC;
}
