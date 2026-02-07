import type { ProjectileState } from '../../types/game';

export const FIXED_DT = 1 / 60;

export function toVelocity(angleDeg: number, power: number): { vx: number; vy: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    vx: Math.cos(radians) * power,
    vy: -Math.sin(radians) * power,
  };
}

export function stepProjectile(projectile: ProjectileState, dt: number, gravity: number, wind: number): ProjectileState {
  const vx = projectile.vx + wind * dt;
  const vy = projectile.vy + gravity * dt;
  const x = projectile.x + vx * dt;
  const y = projectile.y + vy * dt;
  return {
    ...projectile,
    x,
    y,
    vx,
    vy,
    ttl: projectile.ttl - dt,
  };
}

export function spreadAngles(base: number, count: number, spread: number): number[] {
  if (count <= 1) {
    return [base];
  }
  const mid = (count - 1) / 2;
  return new Array(count).fill(0).map((_, idx) => base + (idx - mid) * spread);
}
