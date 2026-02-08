import { describe, expect, it } from 'vitest';
import { computeExplosionDamage, spawnFunkeyBomblets } from './Combat';

describe('computeExplosionDamage', () => {
  it('makes direct hits significantly lethal', () => {
    const result = computeExplosionDamage({
      dist: 0,
      blastRadius: 14,
      weaponDamage: 16,
      secondaryDamage: 0,
      shield: 0,
      armor: 0,
    });
    expect(result.hpLoss).toBeGreaterThan(20);
  });

  it('applies shield first and preserves hp when fully absorbed', () => {
    const result = computeExplosionDamage({
      dist: 0,
      blastRadius: 20,
      weaponDamage: 20,
      secondaryDamage: 0,
      shield: 120,
      armor: 50,
    });
    expect(result.hpLoss).toBe(0);
    expect(result.nextShield).toBeLessThan(120);
  });
});

describe('spawnFunkeyBomblets', () => {
  it('spawns colorful bomblets with split depth marker', () => {
    const bomblets = spawnFunkeyBomblets(100, 80, 'p1', 40, -20);
    expect(bomblets).toHaveLength(6);
    expect(new Set(bomblets.map((b) => b.color)).size).toBeGreaterThan(3);
    expect(bomblets.every((b) => b.weaponId === 'funky-bomb')).toBe(true);
    expect(bomblets.every((b) => b.splitDepth === 1)).toBe(true);
  });
});
