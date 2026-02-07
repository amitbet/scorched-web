import type { AILevel, MatchState, PlayerState, TerrainState } from '../../types/game';
import { toVelocity } from '../physics/Ballistics';

export interface AIShot {
  angle: number;
  power: number;
  weaponId: string;
}

function chooseTarget(shooter: PlayerState, players: PlayerState[]): PlayerState | undefined {
  const enemies = players.filter((p) => p.alive && p.config.id !== shooter.config.id);
  if (enemies.length === 0) {
    return undefined;
  }

  enemies.sort((a, b) => Math.abs(a.x - shooter.x) - Math.abs(b.x - shooter.x));
  return enemies[0];
}

function randomIn(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function estimateAnglePower(shooter: PlayerState, target: PlayerState, wind: number, gravity: number, inaccuracy: number): AIShot {
  const dx = target.x - shooter.x;
  const dy = shooter.y - target.y;
  const angleBase = dx >= 0 ? randomIn(20, 75) : randomIn(105, 160);
  const absAngle = dx >= 0 ? angleBase : 180 - angleBase;
  const vxSign = dx >= 0 ? 1 : -1;
  const distance = Math.max(30, Math.abs(dx));
  const idealV = Math.sqrt((distance * gravity) / Math.max(0.2, Math.sin((2 * angleBase * Math.PI) / 180)));
  const windComp = wind * 0.2 * vxSign;
  const power = Math.max(120, Math.min(shooter.maxPower, idealV * (1 + dy * 0.001) + windComp + randomIn(-inaccuracy, inaccuracy)));

  return {
    angle: Math.max(2, Math.min(178, absAngle + randomIn(-inaccuracy * 0.05, inaccuracy * 0.05))),
    power,
    weaponId: shooter.selectedWeaponId,
  };
}

function scoreShot(shooter: PlayerState, target: PlayerState, shot: AIShot, wind: number, gravity: number, terrain: TerrainState): number {
  const { vx, vy } = toVelocity(shot.angle, shot.power);
  let x = shooter.x;
  let y = shooter.y - 3;
  let cx = vx;
  let cy = vy;
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 240; i += 1) {
    cx += wind / 60;
    cy += gravity / 60;
    x += cx / 60;
    y += cy / 60;

    if (x < 0 || x >= terrain.width || y < 0 || y >= terrain.height) {
      break;
    }

    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (terrain.mask[ty * terrain.width + tx] === 1) {
      break;
    }

    const d = Math.hypot(target.x - x, target.y - y);
    best = Math.min(best, d);
  }

  return best;
}

export function computeAIShot(match: MatchState, shooter: PlayerState, terrain: TerrainState, level: AILevel): AIShot {
  const target = chooseTarget(shooter, match.players);
  if (!target) {
    return { angle: shooter.angle, power: shooter.power, weaponId: shooter.selectedWeaponId };
  }

  if (level === 'easy') {
    return estimateAnglePower(shooter, target, match.wind, match.settings.gravity, 32);
  }

  if (level === 'normal') {
    return estimateAnglePower(shooter, target, match.wind, match.settings.gravity, 16);
  }

  let best: AIShot = estimateAnglePower(shooter, target, match.wind, match.settings.gravity, 8);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 50; i += 1) {
    const candidate = estimateAnglePower(shooter, target, match.wind, match.settings.gravity, 7);
    const s = scoreShot(shooter, target, candidate, match.wind, match.settings.gravity, terrain);
    if (s < bestScore) {
      best = candidate;
      bestScore = s;
    }
  }

  return best;
}
