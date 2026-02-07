import type { ProjectileState } from '../types/game';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface DamageInput {
  dist: number;
  blastRadius: number;
  weaponDamage: number;
  secondaryDamage: number;
  shield: number;
  armor: number;
}

export interface DamageResult {
  hpLoss: number;
  nextShield: number;
  nextArmor: number;
}

export function computeExplosionDamage(input: DamageInput): DamageResult {
  if (input.dist > input.blastRadius || input.blastRadius <= 0) {
    return { hpLoss: 0, nextShield: input.shield, nextArmor: input.armor };
  }

  const normalized = (input.blastRadius - input.dist) / input.blastRadius;
  const scaledBase = normalized * input.weaponDamage * 2.2;
  let blast = scaledBase + input.secondaryDamage * 1.35;

  if (input.dist <= 5) {
    blast += Math.max(12, input.weaponDamage * 1.05);
  } else if (input.dist <= input.blastRadius * 0.18) {
    blast += input.weaponDamage * 0.35;
  }

  let remaining = Math.max(0, blast);
  const shieldAbsorb = Math.min(input.shield, remaining);
  remaining -= shieldAbsorb;
  const nextShield = Math.max(0, input.shield - shieldAbsorb);

  const armorMitigation = clamp(input.armor / 500, 0, 0.35);
  const hpLoss = Math.max(0, remaining * (1 - armorMitigation));
  const nextArmor = Math.max(0, input.armor - remaining * 1.15);

  return {
    hpLoss,
    nextShield,
    nextArmor,
  };
}

const FUNKEY_COLORS = ['#ff4747', '#ff932f', '#ffe94d', '#6ee1ff', '#9e8dff', '#ff69d4'];
const FUNKEY_ANGLE_OFFSETS = [-58, -34, -12, 12, 34, 58];

export function spawnFunkeyBomblets(
  x: number,
  y: number,
  ownerId: string,
  parentVx: number,
  parentVy: number,
): ProjectileState[] {
  const direction = parentVx >= 0 ? 1 : -1;
  return FUNKEY_ANGLE_OFFSETS.map((offset, idx) => {
    const angleDeg = 90 + offset * direction;
    const radians = (angleDeg * Math.PI) / 180;
    const speed = 220 + (idx % 3) * 28;
    return {
      x,
      y,
      vx: Math.cos(radians) * speed + parentVx * 0.18,
      vy: -Math.sin(radians) * speed + Math.min(0, parentVy) * 0.1,
      ownerId,
      weaponId: 'funkey-bomb',
      ttl: 4.4,
      splitDepth: 1,
      color: FUNKEY_COLORS[idx % FUNKEY_COLORS.length],
    };
  });
}
