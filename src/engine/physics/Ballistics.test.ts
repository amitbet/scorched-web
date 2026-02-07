import { describe, expect, it } from 'vitest';
import { spreadAngles, stepProjectile, toVelocity } from './Ballistics';

describe('Ballistics', () => {
  it('computes launch velocity for 45 degrees', () => {
    const v = toVelocity(45, 1000);
    expect(Math.round(v.vx)).toBe(707);
    expect(Math.round(v.vy)).toBe(-707);
  });

  it('steps projectile with gravity and wind', () => {
    const p = stepProjectile({ x: 0, y: 0, vx: 100, vy: -100, ownerId: 'a', weaponId: 'baby', ttl: 1 }, 1 / 60, 80, 30);
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.vy).toBeGreaterThan(-100);
  });

  it('spreads angles symmetrically', () => {
    const angles = spreadAngles(45, 3, 2);
    expect(angles).toEqual([43, 45, 47]);
  });
});
